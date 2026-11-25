// Host tests for firmware/openpaw-collar/openpaw_core.h
// Build+run: cc -std=c99 -O1 -Wall -Wextra -Werror -o /tmp/t firmware/test/test_core.c -lm && /tmp/t
// With an argument, also writes golden packets for the web-app decoder test.
// SPDX-License-Identifier: GPL-3.0-only
#include "../openpaw-collar/openpaw_core.h"
#include <stdio.h>
#include <stdlib.h>

static int failures = 0;
#define CHECK(cond, ...) do { if (!(cond)) { failures++; printf("FAIL %s:%d: ", __FILE__, __LINE__); printf(__VA_ARGS__); printf("\n"); } } while (0)

// deterministic LCG noise, +/- amp mg
static uint32_t rng = 12345;
static int16_t noise(int amp) { rng = rng * 1103515245u + 12345u; return (int16_t)((int)((rng >> 16) % (2 * amp + 1)) - amp); }

static openpaw_record_t run_epoch(openpaw_state_t *s, int16_t (*gen)(int axis, uint32_t i), uint32_t *t) {
  openpaw_record_t r; memset(&r, 0, sizeof r);
  for (uint32_t i = 0;; i++) {
    int16_t x = gen(0, *t), y = gen(1, *t), z = gen(2, *t);
#ifdef OPENPAW_DUMP_GOLDEN_SAMPLES
    printf("sample %d %d %d\n", x, y, z);
#endif
    (*t)++;
    if (openpaw_push(s, x, y, z, *t / 50, 0, 87, 0, &r)) return r;
    if (i > 100000) { CHECK(0, "epoch never closed"); return r; }
  }
}

// dog lying still, collar puck at the bottom of the neck: gravity on +z, tiny noise
static int16_t gen_rest(int a, uint32_t i) { (void)i; return (int16_t)((a == 2 ? 1000 : 0) + noise(8)); }
// trotting: ~2.5 Hz vertical oscillation of 600 mg plus lateral sway
static int16_t gen_trot(int a, uint32_t i) {
  float ph = 2.0f * 3.14159265f * 2.5f * (float)i / 50.0f;
  if (a == 2) return (int16_t)(1000 + 600 * sinf(ph) + noise(20));
  if (a == 1) return (int16_t)(250 * sinf(ph / 2) + noise(20));
  return (int16_t)noise(20);
}
// lunge: rest, then one 0.4 s 3 g spike, then rest
static int16_t gen_lunge(int a, uint32_t i) {
  uint32_t k = i % 250;
  if (k >= 100 && k < 120) return (int16_t)(a == 0 ? 3000 : (a == 2 ? 1000 : 0));
  return gen_rest(a, i);
}
// clipped: a hard shake that saturates the +/-8 g range
static int16_t gen_clip(int a, uint32_t i) { return (int16_t)(a == 0 && (i % 50) == 10 ? 8000 : gen_rest(a, i)); }
// puck rotated 90 deg (dog lying on its side): gravity on +y
static int16_t gen_side(int a, uint32_t i) { (void)i; return (int16_t)((a == 1 ? 1000 : 0) + noise(8)); }

int main(int argc, char **argv) {
  openpaw_state_t s;
  openpaw_cfg_t cfg = openpaw_default_cfg();
  uint32_t t = 0;
  openpaw_init(&s, cfg);
  CHECK(s.expected == 250, "expected 250 samples per 5 s epoch, got %u", s.expected);

  // 1. rest: near-zero dynamic acceleration, upright, not active
  openpaw_record_t rest = run_epoch(&s, gen_rest, &t);
  CHECK(rest.version == 1, "version %u", rest.version);
  CHECK(rest.seq == 0, "first seq %u", rest.seq);
  CHECK(rest.vedba_mean_mg < 20, "rest vedba_mean %u", rest.vedba_mean_mg);
  CHECK(rest.active_frac == 0, "rest active_frac %u", rest.active_frac);
  CHECK(rest.bursts == 0, "rest bursts %u", rest.bursts);
  CHECK(rest.pitch_deg >= -2 && rest.pitch_deg <= 2, "rest pitch %d", rest.pitch_deg);
  CHECK(rest.roll_half_deg >= -1 && rest.roll_half_deg <= 1, "rest roll/2 %d", rest.roll_half_deg);
  CHECK(!(rest.flags & OPENPAW_FLAG_CLIPPED), "rest should not clip");
  CHECK(rest.battery_pct == 87, "battery passthrough %u", rest.battery_pct);

  // 2. trot: clearly active, mean VeDBA in the hundreds of mg, much larger than rest
  openpaw_record_t trot = run_epoch(&s, gen_trot, &t);
  trot = run_epoch(&s, gen_trot, &t);  // second epoch: gravity estimate settled
  CHECK(trot.seq == 2, "seq increments %u", trot.seq);
  CHECK(trot.vedba_mean_mg > 250 && trot.vedba_mean_mg < 700, "trot vedba_mean %u", trot.vedba_mean_mg);
  CHECK(trot.vedba_mean_mg > 10 * (rest.vedba_mean_mg + 1), "trot >> rest");
  CHECK(trot.active_frac > 200, "trot active_frac %u", trot.active_frac);
  CHECK(trot.bursts == 0, "trot is not a burst %u", trot.bursts);

  // 3. lunge: exactly one burst per spike, peak near 3 g
  openpaw_state_t s2; uint32_t t2 = 0; openpaw_init(&s2, cfg);
  openpaw_record_t lunge = run_epoch(&s2, gen_lunge, &t2);
  CHECK(lunge.bursts == 1, "one lunge = one burst, got %u", lunge.bursts);
  CHECK(lunge.vedba_max_mg > 2500 && lunge.vedba_max_mg < 3300, "lunge peak %u", lunge.vedba_max_mg);
  CHECK(lunge.active_frac < 40, "lunge epoch mostly still %u", lunge.active_frac);

  // 4. clipping is flagged
  openpaw_state_t s3; uint32_t t3 = 0; openpaw_init(&s3, cfg);
  openpaw_record_t clip = run_epoch(&s3, gen_clip, &t3);
  CHECK(clip.flags & OPENPAW_FLAG_CLIPPED, "clip flag missing");

  // 5. orientation: on its side -> roll ~ +90 deg (roll/2 ~ 45), pitch ~ 0
  openpaw_state_t s4; uint32_t t4 = 0; openpaw_init(&s4, cfg);
  openpaw_record_t side = run_epoch(&s4, gen_side, &t4);
  CHECK(side.roll_half_deg >= 43 && side.roll_half_deg <= 47, "side roll/2 %d", side.roll_half_deg);
  CHECK(side.pitch_deg >= -2 && side.pitch_deg <= 2, "side pitch %d", side.pitch_deg);

  // 6. flush closes a partial epoch with GAP
  openpaw_state_t s5; openpaw_init(&s5, cfg);
  openpaw_record_t part; memset(&part, 0, sizeof part);
  for (int i = 0; i < 60; i++) { openpaw_push(&s5, 0, 0, 1000, 1, 0, 50, 0, &part); }
  CHECK(openpaw_flush(&s5, 2, 0, 50, &part) == 1, "flush returns 1");
  CHECK(part.flags & OPENPAW_FLAG_GAP, "flush sets GAP");
  CHECK(openpaw_flush(&s5, 2, 0, 50, &part) == 0, "empty flush returns 0");

  // 7. encode/decode round trip incl. negative angles and big values
  openpaw_record_t a = {1, OPENPAW_FLAG_HR_VALID | OPENPAW_FLAG_CHARGING, 0xA1B2C3D4u, 86400u * 30,
                        65535, 4321, 255, -73, -90, 7, 112, 100};
  uint8_t buf[OPENPAW_RECORD_SIZE]; openpaw_record_t b;
  openpaw_encode(&a, buf); openpaw_decode(buf, &b);
  CHECK(memcmp(&a, &b, sizeof a) == 0 || (a.seq == b.seq && a.uptime_s == b.uptime_s && a.pitch_deg == b.pitch_deg &&
        a.roll_half_deg == b.roll_half_deg && a.vedba_mean_mg == b.vedba_mean_mg && a.hr_bpm == b.hr_bpm), "round trip");
  CHECK(buf[2] == 0xD4 && buf[5] == 0xA1, "little endian seq");

  // 8. ring buffer wraps, keeps newest, find() works
  uint8_t store[8 * OPENPAW_RECORD_SIZE]; openpaw_ring_t q; openpaw_ring_init(&q, store, 8);
  for (uint32_t i = 0; i < 13; i++) { openpaw_record_t r = rest; r.seq = 100 + i; openpaw_ring_put(&q, &r); }
  CHECK(q.count == 8, "ring count %u", q.count);
  uint8_t o[OPENPAW_RECORD_SIZE]; openpaw_record_t d;
  openpaw_ring_get(&q, 0, o); openpaw_decode(o, &d); CHECK(d.seq == 105, "oldest seq %u", d.seq);
  openpaw_ring_get(&q, 7, o); openpaw_decode(o, &d); CHECK(d.seq == 112, "newest seq %u", d.seq);
  CHECK(openpaw_ring_find(&q, 110) == 5, "find 110 -> %u", openpaw_ring_find(&q, 110));
  CHECK(openpaw_ring_find(&q, 0) == 0, "find 0 -> oldest");
  CHECK(openpaw_ring_find(&q, 999) == 8, "find past end -> count");
  CHECK(openpaw_ring_get(&q, 8, o) == 0, "get out of range");

  // 9. storage pick from a JEDEC ID (0x9F reply: manufacturer, type, capacity code)
  openpaw_flash_t fl;
  const uint8_t id_p25[3] = {0x85, 0x60, 0x15};   // Puya P25Q16H, 2 MB (Seeed variant.h)
  const uint8_t id_gd[3] = {0xC8, 0x40, 0x17};    // GigaDevice GD25Q64C, 8 MB (SoftRF T1000-E note)
  const uint8_t id_ff[3] = {0xFF, 0xFF, 0xFF};    // no chip: MISO floats high
  const uint8_t id_00[3] = {0x00, 0x00, 0x00};    // no chip / unpowered: MISO low
  const uint8_t id_odd[3] = {0xEF, 0x40, 0x03};   // capacity code out of range: not trusted
  const uint8_t id_unk[3] = {0xEF, 0x40, 0x16};   // valid but not in our table (W25Q32, 4 MB)
  CHECK(openpaw_flash_identify(id_p25, &fl) == OPENPAW_STORE_QSPI && fl.size_bytes == 2097152u &&
        strcmp(fl.name, "P25Q16H") == 0, "P25Q16H -> qspi 2 MB, got %d %u %s", fl.kind, fl.size_bytes, fl.name);
  CHECK(openpaw_flash_identify(id_gd, &fl) == OPENPAW_STORE_QSPI && fl.size_bytes == 8388608u &&
        strcmp(fl.name, "GD25Q64C") == 0, "GD25Q64C -> qspi 8 MB");
  CHECK(openpaw_flash_identify(id_ff, &fl) == OPENPAW_STORE_INTERNAL && fl.size_bytes == 0, "FFFFFF -> internal");
  CHECK(openpaw_flash_identify(id_00, &fl) == OPENPAW_STORE_INTERNAL, "000000 -> internal");
  CHECK(openpaw_flash_identify(id_odd, &fl) == OPENPAW_STORE_INTERNAL, "bad capacity -> internal");
  CHECK(openpaw_flash_identify(id_unk, &fl) == OPENPAW_STORE_QSPI && fl.size_bytes == 4194304u &&
        strcmp(fl.name, "unknown") == 0, "unlisted chip -> qspi by capacity code");

  // 10. human-readable storage line for BLE Device Information "Hardware Revision" + serial boot line
  char line[40];
  openpaw_flash_identify(id_p25, &fl); openpaw_flash_describe(id_p25, &fl, line, sizeof line);
  CHECK(strcmp(line, "flash P25Q16H 2048KB (856015)") == 0, "describe p25: '%s'", line);
  openpaw_flash_identify(id_ff, &fl); openpaw_flash_describe(id_ff, &fl, line, sizeof line);
  CHECK(strcmp(line, "flash none, internal (ffffff)") == 0, "describe none: '%s'", line);
  char tiny[8];
  openpaw_flash_identify(id_p25, &fl); openpaw_flash_describe(id_p25, &fl, tiny, sizeof tiny);
  CHECK(strlen(tiny) == 7, "describe truncates safely");

  // 11. battery millivolts from an averaged ADC reading through a divider
  // T1000-E: 100k/100k (x2), 3.0 V reference, 12-bit (Seeed sensor.c bat_v*2; Meshtastic ADC_MULTIPLIER 2.0)
  CHECK(openpaw_vbat_mv(2867u * 4, 4, 12, 3000, 2000, 1000) == 4200, "t1000e full: %u",
        openpaw_vbat_mv(2867u * 4, 4, 12, 3000, 2000, 1000));
  CHECK(openpaw_vbat_mv(2457u, 1, 12, 3000, 2000, 1000) == 3599, "t1000e mid: %u", openpaw_vbat_mv(2457u, 1, 12, 3000, 2000, 1000));
  // XIAO: 1M/510k (x1510/510), 3.6 V reference
  CHECK(openpaw_vbat_mv(1615u, 1, 12, 3600, 1510, 510) == 4203, "xiao: %u", openpaw_vbat_mv(1615u, 1, 12, 3600, 1510, 510));
  CHECK(openpaw_vbat_mv(0, 0, 12, 3000, 2000, 1000) == 0, "zero samples -> 0");

  // time anchor: the app tells the collar the wall-clock time; the collar logs
  // (seq, uptime, unix time, boot_seq) so epochs from that boot can be dated later.
  openpaw_anchor_t an = {0x00012345u, 3601u, 1795000000u, 0x00012000u};
  uint8_t ab[OPENPAW_RECORD_SIZE];
  openpaw_encode_anchor(&an, ab);
  const uint8_t want_ab[OPENPAW_RECORD_SIZE] = {0x02, 0x00, 0x45, 0x23, 0x01, 0x00, 0x11, 0x0e, 0x00, 0x00,
                                                0xc0, 0x86, 0xfd, 0x6a, 0x00, 0x20, 0x01, 0x00, 0x00, 0x00};
  CHECK(memcmp(ab, want_ab, sizeof ab) == 0, "anchor wire bytes");
  CHECK(ab[0] == OPENPAW_ANCHOR_VERSION && ab[0] != OPENPAW_RECORD_VERSION && ab[0] != 0xFF, "anchor version byte distinct");
  openpaw_anchor_t an2; memset(&an2, 0, sizeof an2);
  CHECK(openpaw_decode_anchor(ab, &an2) == 1 && an2.seq == an.seq && an2.uptime_s == an.uptime_s &&
            an2.unix_s == an.unix_s && an2.boot_seq == an.boot_seq, "anchor round trip");
  CHECK(openpaw_decode_anchor(buf, &an2) == 0, "an epoch record is not an anchor");

  // 12. still mode: after 5 min of still epochs with no phone connected the collar
  // samples at 10 Hz instead of 50 (fewer CPU wake-ups, IMU in its 12.5 Hz low-power
  // mode); records say so with the LOWRATE flag; any non-still epoch goes back to 50 Hz.
  CHECK(OPENPAW_FLAG_LOWRATE == 0x10, "LOWRATE flag is 0x10");
  openpaw_power_t pw; openpaw_power_init(&pw);
  openpaw_record_t still_r = rest; still_r.flags = 0; still_r.vedba_mean_mg = 12; still_r.bursts = 0;
  float hz = 0;
  for (int i = 0; i < OPENPAW_STILL_EPOCHS - 1; i++) hz = openpaw_power_step(&pw, &still_r, 0);
  CHECK(hz == 50.0f, "59 still epochs (4 min 55 s) stay at 50 Hz, got %g", (double)hz);
  hz = openpaw_power_step(&pw, &still_r, 0);
  CHECK(hz == OPENPAW_HZ_LOW && OPENPAW_HZ_LOW == 10.0f, "60th still epoch (5 min) -> 10 Hz, got %g", (double)hz);
  CHECK(openpaw_power_step(&pw, &still_r, 0) == OPENPAW_HZ_LOW, "stays low while still");
  CHECK(openpaw_power_step(&pw, &still_r, 1) == 50.0f, "a connected phone (live view) gets 50 Hz");
  CHECK(openpaw_power_step(&pw, &still_r, 0) == 50.0f, "after a connection the 5 min count starts again");
  openpaw_power_init(&pw);
  for (int i = 0; i < OPENPAW_STILL_EPOCHS; i++) openpaw_power_step(&pw, &still_r, 0);
  openpaw_record_t moving_r = still_r; moving_r.vedba_mean_mg = OPENPAW_STILL_MG;
  CHECK(openpaw_power_step(&pw, &moving_r, 0) == 50.0f, "one epoch at the still limit wakes to 50 Hz");
  for (int i = 0; i < OPENPAW_STILL_EPOCHS; i++) openpaw_power_step(&pw, &still_r, 0);
  openpaw_record_t burst_r = still_r; burst_r.bursts = 1;
  CHECK(openpaw_power_step(&pw, &burst_r, 0) == 50.0f, "a burst wakes to 50 Hz");
  for (int i = 0; i < OPENPAW_STILL_EPOCHS; i++) openpaw_power_step(&pw, &still_r, 0);
  openpaw_record_t gap_r = still_r; gap_r.flags = OPENPAW_FLAG_GAP;
  CHECK(openpaw_power_step(&pw, &gap_r, 0) == 50.0f, "a sensor gap is not 'still': back to 50 Hz");

  // the rate change applies at the next epoch boundary, never inside an epoch
  openpaw_state_t s6; uint32_t t6 = 0; openpaw_init(&s6, cfg);
  openpaw_record_t r6; memset(&r6, 0, sizeof r6);
  for (int i = 0; i < 100; i++) openpaw_push(&s6, 0, 0, 1000, 1, 0, 50, 0, &r6);
  openpaw_set_rate(&s6, OPENPAW_HZ_LOW);
  CHECK(s6.expected == 250, "mid-epoch rate change waits: expected %u", s6.expected);
  int closed_at = -1;
  for (int i = 0; i < 200; i++) if (openpaw_push(&s6, 0, 0, 1000, 1, 0, 50, 0, &r6)) { closed_at = i; break; }
  CHECK(closed_at == 149, "the 50 Hz epoch still closes after 250 samples (at %d)", closed_at);
  CHECK(!(r6.flags & OPENPAW_FLAG_LOWRATE), "that epoch was sampled at 50 Hz: no LOWRATE");
  CHECK(s6.expected == 50, "next epoch: 10 Hz x 5 s = 50 samples, got %u", s6.expected);
  rng = 777;
  openpaw_record_t low = run_epoch(&s6, gen_rest, &t6);
  CHECK(low.flags & OPENPAW_FLAG_LOWRATE, "10 Hz epoch carries LOWRATE");
  CHECK(low.vedba_mean_mg < 20 && low.active_frac == 0 && low.bursts == 0, "rest at 10 Hz still reads as rest (%u)",
        low.vedba_mean_mg);
  openpaw_set_rate(&s6, 50.0f);
  CHECK(s6.expected == 250, "back to 50 Hz at once when between epochs, got %u", s6.expected);
  openpaw_record_t back = run_epoch(&s6, gen_rest, &t6);
  CHECK(!(back.flags & OPENPAW_FLAG_LOWRATE) && back.seq == low.seq + 1, "50 Hz again, seq continues");

  // 13. connection interval: 15 ms while a backlog download runs (fast sync), then a
  // slow 200 ms interval with peripheral latency once the link has been idle for
  // OPENPAW_LINK_IDLE_MS, so a phone left connected does not cost >100 uA (docs/POWER.md).
  CHECK(OPENPAW_LINK_FAST == 12 && OPENPAW_LINK_SLOW == 160, "fast 12 x 1.25 = 15 ms, slow 160 x 1.25 = 200 ms");
  CHECK(OPENPAW_LINK_SLOW_LATENCY == 4 && OPENPAW_LINK_TIMEOUT_10MS == 400, "slow: latency 4, 4 s supervision timeout");
  CHECK((uint32_t)OPENPAW_LINK_SLOW * 125 / 100 * (OPENPAW_LINK_SLOW_LATENCY + 1) * 2 < OPENPAW_LINK_TIMEOUT_10MS * 10u,
        "supervision timeout > 2 x interval x (latency + 1) (BLE Core spec)");
  openpaw_link_t lk; openpaw_link_init(&lk);
  CHECK(openpaw_link_step(&lk, 0, 0, 100) == 0, "not connected: nothing to request");
  CHECK(openpaw_link_step(&lk, 1, 0, 1000) == OPENPAW_LINK_FAST, "on connect: ask for 15 ms (the app syncs first)");
  CHECK(openpaw_link_step(&lk, 1, 0, 1500) == 0, "no repeated requests");
  CHECK(openpaw_link_step(&lk, 1, 1, 2000) == 0, "dump running: stays fast");
  CHECK(openpaw_link_step(&lk, 1, 1, 9000) == 0, "long dump: still fast");
  CHECK(openpaw_link_step(&lk, 1, 0, 9000 + OPENPAW_LINK_IDLE_MS - 1) == 0, "idle just under the limit: still fast");
  CHECK(openpaw_link_step(&lk, 1, 0, 9000 + OPENPAW_LINK_IDLE_MS) == OPENPAW_LINK_SLOW, "idle after the dump: slow");
  CHECK(openpaw_link_step(&lk, 1, 0, 60000) == 0, "slow stays slow without new requests");
  CHECK(openpaw_link_step(&lk, 1, 1, 61000) == OPENPAW_LINK_FAST, "a new dump asks for 15 ms again");
  CHECK(openpaw_link_step(&lk, 0, 0, 62000) == 0, "disconnect: nothing to request");
  CHECK(openpaw_link_step(&lk, 1, 0, 63000) == OPENPAW_LINK_FAST, "reconnect starts fast again");
  openpaw_link_init(&lk);
  CHECK(openpaw_link_step(&lk, 1, 0, 0xFFFFFF00u) == OPENPAW_LINK_FAST, "connect just before millis() wraps");
  CHECK(openpaw_link_step(&lk, 1, 0, 0xFFFFFF00u + OPENPAW_LINK_IDLE_MS) == OPENPAW_LINK_SLOW, "idle time survives the wrap");

  // 14. advertising (power): 100 ms for 30 s, then every 1 s as before; once no phone
  // has connected for OPENPAW_ADV_PARK_MS the collar advertises every 2 s ("parked").
  // A connection restores the normal 100 ms/1 s pair so the next disconnect starts fast.
  CHECK(OPENPAW_ADV_FAST == 160 && OPENPAW_ADV_SLOW == 1600 && OPENPAW_ADV_PARKED == 3200,
        "adv units 0.625 ms: 160 = 100 ms, 1600 = 1 s, 3200 = 2 s");
  CHECK(OPENPAW_ADV_PARK_MS == 600000u, "parked after 10 min with no phone");
  openpaw_adv_t av; openpaw_adv_init(&av, 500);
  CHECK(openpaw_adv_step(&av, 0, 1000) == 0, "after boot: keep the normal intervals");
  CHECK(openpaw_adv_step(&av, 0, 500 + OPENPAW_ADV_PARK_MS - 1) == 0, "just under 10 min: not parked yet");
  CHECK(openpaw_adv_step(&av, 0, 500 + OPENPAW_ADV_PARK_MS) == OPENPAW_ADV_PARKED, "10 min with no phone: park at 2 s");
  CHECK(openpaw_adv_step(&av, 0, 3600000u) == 0, "parked stays parked without repeated requests");
  CHECK(openpaw_adv_step(&av, 1, 3601000u) == OPENPAW_ADV_SLOW, "phone connects: restore 100 ms/1 s for the next disconnect");
  CHECK(openpaw_adv_step(&av, 1, 3602000u) == 0, "connected: nothing more to change");
  CHECK(openpaw_adv_step(&av, 0, 3603000u) == 0, "just disconnected: normal advertising");
  CHECK(openpaw_adv_step(&av, 0, 3602000u + OPENPAW_ADV_PARK_MS - 1) == 0, "the clock counts from the last connected moment");
  CHECK(openpaw_adv_step(&av, 0, 3602000u + OPENPAW_ADV_PARK_MS) == OPENPAW_ADV_PARKED, "10 min after the disconnect: parked again");
  openpaw_adv_init(&av, 0);
  CHECK(openpaw_adv_step(&av, 1, 1000) == 0, "connect before ever parking: nothing to restore");
  openpaw_adv_init(&av, 0xFFFFFF00u);
  CHECK(openpaw_adv_step(&av, 0, 0xFFFFFF00u + OPENPAW_ADV_PARK_MS) == OPENPAW_ADV_PARKED, "park time survives the millis() wrap");

  if (argc > 1) {  // golden vectors for app/test: hex packet + expected decoded fields
    FILE *f = fopen(argv[1], "w");
    if (!f) { perror("golden"); return 2; }
    openpaw_record_t g[] = {rest, trot, lunge, clip, side, a};
    const char *names[] = {"rest", "trot", "lunge", "clip", "side", "roundtrip"};
    fprintf(f, "[\n");
    for (int i = 0; i < 6; i++) {
      openpaw_encode(&g[i], buf);
      fprintf(f, "  {\"name\":\"%s\",\"hex\":\"", names[i]);
      for (int j = 0; j < OPENPAW_RECORD_SIZE; j++) fprintf(f, "%02x", buf[j]);
      fprintf(f, "\",\"version\":%u,\"flags\":%u,\"seq\":%u,\"uptime_s\":%u,\"vedba_mean_mg\":%u,\"vedba_max_mg\":%u,"
                 "\"active_frac\":%u,\"pitch_deg\":%d,\"roll_deg\":%d,\"bursts\":%u,\"hr_bpm\":%u,\"battery_pct\":%u}%s\n",
              g[i].version, g[i].flags, g[i].seq, g[i].uptime_s, g[i].vedba_mean_mg, g[i].vedba_max_mg, g[i].active_frac,
              g[i].pitch_deg, g[i].roll_half_deg * 2, g[i].bursts, g[i].hr_bpm, g[i].battery_pct, ",");
    }
    fprintf(f, "  {\"name\":\"anchor\",\"hex\":\"");
    for (int j = 0; j < OPENPAW_RECORD_SIZE; j++) fprintf(f, "%02x", ab[j]);
    fprintf(f, "\",\"version\":%u,\"seq\":%u,\"uptime_s\":%u,\"unix_s\":%u,\"boot_seq\":%u}\n", OPENPAW_ANCHOR_VERSION,
            an.seq, an.uptime_s, an.unix_s, an.boot_seq);
    fprintf(f, "]\n");
    fclose(f);
  }

  printf("rest  mean=%u max=%u act=%u pitch=%d roll=%d\n", rest.vedba_mean_mg, rest.vedba_max_mg, rest.active_frac, rest.pitch_deg, rest.roll_half_deg * 2);
  printf("trot  mean=%u max=%u act=%u bursts=%u\n", trot.vedba_mean_mg, trot.vedba_max_mg, trot.active_frac, trot.bursts);
  printf("lunge mean=%u max=%u act=%u bursts=%u\n", lunge.vedba_mean_mg, lunge.vedba_max_mg, lunge.active_frac, lunge.bursts);
  printf("side  roll=%d pitch=%d\n", side.roll_half_deg * 2, side.pitch_deg);
  if (failures) { printf("%d FAILED\n", failures); return 1; }
  printf("ALL PASS\n");
  return 0;
}
