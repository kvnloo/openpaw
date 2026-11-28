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

  // 12b. no-sample Still epoch: in a later sensor-only Still mode the CPU skips reading the
  // IMU while the motion interrupt stays quiet. That epoch must never look measured: flag
  // NOSAMPLE, and pitch/roll carry -128, outside every real posture, so a flag-blind
  // reader sees an impossible value instead of "lying flat".
  CHECK(OPENPAW_FLAG_NOSAMPLE == 0x20, "NOSAMPLE flag is 0x20");
  openpaw_record_t ns; memset(&ns, 0xAB, sizeof ns);
  uint32_t seq_before = s6.seq;
  CHECK(openpaw_nosample_epoch(&s6, 4242, 61, &ns) == 1, "no-sample epoch closes between epochs");
  CHECK(ns.version == OPENPAW_RECORD_VERSION && ns.seq == seq_before && s6.seq == seq_before + 1, "seq counts on");
  CHECK(ns.flags == OPENPAW_FLAG_NOSAMPLE, "only NOSAMPLE set (no LOWRATE: nothing was sampled), got 0x%02x", ns.flags);
  CHECK(ns.uptime_s == 4242 && ns.battery_pct == 61 && ns.hr_bpm == 0, "uptime + battery kept, no hr");
  CHECK(ns.vedba_mean_mg == 0 && ns.vedba_max_mg == 0 && ns.active_frac == 0 && ns.bursts == 0, "no movement values");
  CHECK(ns.pitch_deg == OPENPAW_NOSAMPLE_POSTURE && ns.roll_half_deg == OPENPAW_NOSAMPLE_POSTURE &&
            OPENPAW_NOSAMPLE_POSTURE == -128, "posture sentinel -128");
  uint8_t nsb[OPENPAW_RECORD_SIZE]; openpaw_encode(&ns, nsb);
  CHECK(nsb[1] == 0x20 && (int8_t)nsb[15] == -128 && (int8_t)nsb[16] == -128, "sentinel survives encoding");
  openpaw_power_init(&pw);
  for (int i = 0; i < OPENPAW_STILL_EPOCHS; i++) openpaw_power_step(&pw, &still_r, 0);
  CHECK(openpaw_power_step(&pw, &ns, 0) == OPENPAW_HZ_LOW, "a no-sample epoch keeps Still mode");
  openpaw_state_t s7; openpaw_init(&s7, cfg);
  openpaw_record_t r7; memset(&r7, 0, sizeof r7);
  openpaw_push(&s7, 0, 0, 1000, 1, 0, 50, 0, &r7);
  CHECK(openpaw_nosample_epoch(&s7, 5, 50, &r7) == 0 && s7.seq == 0 && s7.n == 1,
        "refused inside a half-filled epoch: never mixes samples and no-sample");

  // 12c. sensor-only Still ("quiet"): after 1 more minute of low-rate still epochs the CPU
  // stops reading the FIFO and only reads the IMU's latched wake-up pin once per epoch,
  // writing no-sample records. Every OPENPAW_QUIET_CHECK-th quiet epoch is sampled again;
  // the pin, a phone, or a non-still check epoch wakes it. A lively check epoch with the
  // pin still low means the pin missed motion: quiet mode is off until reboot.
  CHECK(OPENPAW_LSM_TAP_CFG_WAKE == 0x81, "TAP_CFG 58h: INTERRUPTS_ENABLE (bit 7) + LIR latch (bit 0)");
  CHECK(OPENPAW_LSM_MD1_INT1_WU == 0x20 && OPENPAW_LSM_WU_IA == 0x08, "MD1_CFG 5Eh INT1_WU bit 5; WAKE_UP_SRC 1Bh WU_IA bit 3");
  CHECK(OPENPAW_LSM_WAKE_THS * 8000 / 64 == 125, "wake threshold 1 LSB = FS/2^6 = 125 mg at +/-8 g");
  openpaw_quiet_t qt; openpaw_quiet_init(&qt, 1);
  openpaw_record_t low_r = still_r; low_r.flags = OPENPAW_FLAG_LOWRATE;
  int act = -1;
  for (int i = 0; i < OPENPAW_QUIET_AFTER - 1; i++) act = openpaw_quiet_step(&qt, &low_r, 0, 0);
  CHECK(act == OPENPAW_QUIET_READ && !qt.quiet, "11 low-rate still epochs: keep reading, got %d", act);
  CHECK(openpaw_quiet_step(&qt, &low_r, 0, 0) == OPENPAW_QUIET_SKIP && qt.quiet, "12th (1 min in Still): stop reading");
  for (int i = 0; i < OPENPAW_QUIET_CHECK - 1; i++) act = openpaw_quiet_step(&qt, NULL, 0, 0);
  CHECK(act == OPENPAW_QUIET_SKIP, "quiet epochs with the pin low stay skipped, got %d", act);
  CHECK(openpaw_quiet_step(&qt, NULL, 0, 0) == OPENPAW_QUIET_READ && qt.quiet, "every 12th quiet epoch is sampled (check)");
  CHECK(openpaw_quiet_step(&qt, &low_r, 0, 0) == OPENPAW_QUIET_SKIP, "a still check epoch with the pin low: skip again");
  CHECK(openpaw_quiet_step(&qt, NULL, 0, 1) == OPENPAW_QUIET_WAKE && !qt.quiet, "latched pin high: wake to Active");
  CHECK(openpaw_quiet_step(&qt, &low_r, 0, 0) == OPENPAW_QUIET_READ, "after a wake the 1 min count starts again");
  openpaw_quiet_init(&qt, 1);
  for (int i = 0; i < OPENPAW_QUIET_AFTER; i++) openpaw_quiet_step(&qt, &low_r, 0, 0);
  CHECK(openpaw_quiet_step(&qt, NULL, 1, 0) == OPENPAW_QUIET_WAKE, "a phone connecting wakes it (live view needs samples)");
  CHECK(openpaw_quiet_step(&qt, &low_r, 1, 0) == OPENPAW_QUIET_READ, "connected: never skip");
  openpaw_quiet_init(&qt, 1);
  openpaw_record_t full_r = still_r; full_r.flags = 0;
  for (int i = 0; i < 3 * OPENPAW_QUIET_AFTER; i++) act = openpaw_quiet_step(&qt, &full_r, 0, 0);
  CHECK(act == OPENPAW_QUIET_READ, "still but full rate (not in Still mode yet): keep reading");
  openpaw_record_t low_gap = low_r; low_gap.flags |= OPENPAW_FLAG_GAP;
  for (int i = 0; i < OPENPAW_QUIET_AFTER - 1; i++) openpaw_quiet_step(&qt, &low_r, 0, 0);
  CHECK(openpaw_quiet_step(&qt, &low_gap, 0, 0) == OPENPAW_QUIET_READ, "a gap epoch breaks the count");
  // check epochs that wake
  openpaw_quiet_init(&qt, 1);
  for (int i = 0; i < OPENPAW_QUIET_AFTER; i++) openpaw_quiet_step(&qt, &low_r, 0, 0);
  for (int i = 0; i < OPENPAW_QUIET_CHECK; i++) openpaw_quiet_step(&qt, NULL, 0, 0);
  openpaw_record_t stir_r = low_r; stir_r.vedba_mean_mg = OPENPAW_STILL_MG;
  CHECK(openpaw_quiet_step(&qt, &stir_r, 0, 1) == OPENPAW_QUIET_WAKE && !qt.disabled, "check epoch not still, pin high: wake");
  openpaw_quiet_init(&qt, 1);
  for (int i = 0; i < OPENPAW_QUIET_AFTER; i++) openpaw_quiet_step(&qt, &low_r, 0, 0);
  for (int i = 0; i < OPENPAW_QUIET_CHECK; i++) openpaw_quiet_step(&qt, NULL, 0, 0);
  CHECK(openpaw_quiet_step(&qt, &low_gap, 0, 0) == OPENPAW_QUIET_WAKE && !qt.disabled, "check epoch with a gap: wake");
  openpaw_quiet_init(&qt, 1);
  for (int i = 0; i < OPENPAW_QUIET_AFTER; i++) openpaw_quiet_step(&qt, &low_r, 0, 0);
  for (int i = 0; i < OPENPAW_QUIET_CHECK; i++) openpaw_quiet_step(&qt, NULL, 0, 0);
  openpaw_record_t miss_r = low_r; miss_r.vedba_mean_mg = 80; miss_r.vedba_max_mg = OPENPAW_QUIET_MISS_MG;
  CHECK(openpaw_quiet_step(&qt, &miss_r, 0, 0) == OPENPAW_QUIET_WAKE && qt.disabled,
        "lively check epoch but the pin stayed low: the pin missed motion, quiet off");
  for (int i = 0; i < 3 * OPENPAW_QUIET_AFTER; i++) act = openpaw_quiet_step(&qt, &low_r, 0, 0);
  CHECK(act == OPENPAW_QUIET_READ, "after a miss: never skip again until reboot");
  openpaw_quiet_init(&qt, 1);
  for (int i = 0; i < OPENPAW_QUIET_AFTER; i++) openpaw_quiet_step(&qt, &low_r, 0, 0);
  for (int i = 0; i < OPENPAW_QUIET_CHECK; i++) openpaw_quiet_step(&qt, NULL, 0, 0);
  openpaw_record_t burst_low = low_r; burst_low.bursts = 1;
  CHECK(openpaw_quiet_step(&qt, &burst_low, 0, 0) == OPENPAW_QUIET_WAKE && qt.disabled, "a burst with the pin low is a miss too");
  openpaw_quiet_init(&qt, 0);
  for (int i = 0; i < 3 * OPENPAW_QUIET_AFTER; i++) act = openpaw_quiet_step(&qt, &low_r, 0, 0);
  CHECK(act == OPENPAW_QUIET_READ, "board without a wake pin: never skip");

  // 12d. T1000-E wake pin: QMA6100P any-motion latched on INT1 (P1.02), same Quiet state
  // machine. QST QMA6100P datasheet Rev F 7.3, 7.9, 9.5, 9.19, 9.21, 9.27, 9.28, 9.37, 9.39.
  CHECK(OPENPAW_QMA_ANY_MOT_TH == 8 && OPENPAW_QMA_ANY_MOT_TH * 15625 / 1000 == 125,
        "ANY_MOT_TH 2Eh: 8 x 16 LSB x 0.977 mg = 125 mg at +/-8 g, same as the XIAO's wake-up");
  CHECK(OPENPAW_QMA_ANY_MOT_DUR == 0, "MOTION_CFG0 2Ch ANY_MOT_DUR 0: one sample over the threshold");
  CHECK(OPENPAW_QMA_INT_EN2_ANY == 0x07, "INT_EN2 18h: ANY_MOT_EN_X/Y/Z bits 2:0, no-motion off");
  CHECK(OPENPAW_QMA_INT1_MAP1_ANY == 0x01, "INT1_MAP1 1Ah: INT1_ANY_MOT bit 0 only");
  CHECK(OPENPAW_QMA_ANY_MOT_X_Y_Z == 0x07, "INT_STATUS_0 09h: ANY_MOT_X/Y/Z bits 2:0");
  // INT_CFG 21h: LATCH_INT (bit 0) on; INT_RD_CLR (bit 7) off so the FIFO status burst from
  // 0Bh in a check epoch does not clear the any-motion latch (only reading 09h does);
  // the other bits (Rev F default 0x00, Rev A1 0x0C: SDX pad settings) are kept.
  CHECK(openpaw_qma_int_cfg(0x00) == 0x01, "INT_CFG from 0x00 -> 0x01");
  CHECK(openpaw_qma_int_cfg(0x0C) == 0x0D, "INT_CFG keeps the SDX pad bits (Rev A1 default 0x0C)");
  CHECK(openpaw_qma_int_cfg(0x81) == 0x01, "INT_CFG clears INT_RD_CLR");
  // INTPIN_CONF 20h: INT1 push-pull (INT1_OD bit 1 = 0), active high (INT1_LVL bit 0 = 1), so
  // digitalRead(HIGH) means motion like the XIAO; bit 6 DIS_IE_AD0 (I2C address) etc. kept.
  CHECK(openpaw_qma_intpin(0x05) == 0x05, "INTPIN_CONF default 0x05 stays");
  CHECK(openpaw_qma_intpin(0x02) == 0x01, "INT1 open-drain active-low -> push-pull active-high");
  CHECK(openpaw_qma_intpin(0x4E) == 0x4D, "INTPIN_CONF keeps bit 6 and the INT2 bits");

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

  // 15. LSM6DS3TR-C FIFO batching (power): the IMU queues accelerometer samples in its
  // own FIFO and the CPU reads them about once a second instead of waking 50x/s.
  // Register values from the LSM6DS3TR-C datasheet (FIFO_CTRL3 08h, FIFO_CTRL5 0Ah,
  // FIFO_STATUS1..4 3Ah-3Dh) and ST's lsm6ds3tr-c_reg.h.
  CHECK(OPENPAW_LSM_FIFO_CTRL3 == 0x01, "FIFO_CTRL3: accel in FIFO, no decimation, gyro not batched");
  CHECK(openpaw_lsm_fifo_ctrl5(52.0f) == 0x1E, "FIFO_CTRL5 52 Hz continuous = 0x1E, got 0x%02x", openpaw_lsm_fifo_ctrl5(52.0f));
  CHECK(openpaw_lsm_fifo_ctrl5(12.5f) == 0x0E, "FIFO_CTRL5 12.5 Hz continuous = 0x0E, got 0x%02x", openpaw_lsm_fifo_ctrl5(12.5f));
  const uint8_t st_full[4] = {156, 0x00, 0x00, 0x00};  // 156 words, next word = X
  openpaw_fifo_plan_t fp = openpaw_lsm_fifo_plan(st_full);
  CHECK(fp.samples == 52 && fp.skip_words == 0 && !fp.overrun, "156 words aligned -> 52 samples (%u, skip %u)", fp.samples,
        fp.skip_words);
  const uint8_t st_mis[4] = {156, 0x00, 0x01, 0x00};   // next word is Y: drop Y and Z of a torn sample
  fp = openpaw_lsm_fifo_plan(st_mis);
  CHECK(fp.skip_words == 2 && fp.samples == 51, "pattern 1 -> skip 2 words, 51 samples (%u, %u)", fp.skip_words, fp.samples);
  const uint8_t st_big[4] = {0x01, 0x03, 0x00, 0x00};  // DIFF_FIFO is 11 bits: 0x301 = 769 words
  fp = openpaw_lsm_fifo_plan(st_big);
  CHECK(fp.samples == 256, "11-bit word count 769 -> 256 samples, got %u", fp.samples);
  const uint8_t st_over[4] = {0x00, 0x47, 0x00, 0x00};  // OVER_RUN: oldest samples were overwritten
  CHECK(openpaw_lsm_fifo_plan(st_over).overrun == 1, "overrun bit 0x40 seen");
  const uint8_t st_empty[4] = {0x00, 0x10, 0x00, 0x00};
  fp = openpaw_lsm_fifo_plan(st_empty);
  CHECK(fp.samples == 0 && fp.skip_words == 0, "empty FIFO -> nothing to read");
  const uint8_t st_one[4] = {1, 0x00, 0x02, 0x00};     // only the Z of a torn sample is queued
  fp = openpaw_lsm_fifo_plan(st_one);
  CHECK(fp.skip_words == 1 && fp.samples == 0, "torn tail: skip 1, no samples (%u, %u)", fp.skip_words, fp.samples);
  const uint8_t raw6[6] = {0x00, 0x10, 0x00, 0xF0, 0x00, 0x00};  // +4096, -4096, 0 LSB at +/-8 g
  int16_t mx, my, mz;
  openpaw_lsm_xyz_mg(raw6, &mx, &my, &mz);
  CHECK(mx == 999 && my == -999 && mz == 0, "0.244 mg/LSB, same truncation as the polled read: %d %d %d", mx, my, mz);

  // 15b. QMA6100P FIFO batching (power, T1000-E). QST datasheet Rev F: 7.8 FIFO_INT,
  // 9.7 INT_STATUS_2 0Bh (bit 7 FIFO_OR), 9.9 FIFO_STATUS 0Eh (frame counter),
  // 9.11 ODR 10h, 9.48 FIFO_CFG0 3Eh, 9.49 FIFO_DATA 3Fh (LSB bit 0 = frame valid).
  CHECK(OPENPAW_QMA_FIFO_CFG0 == 0x87, "FIFO_CFG0: STREAM mode (10b in bits 7:6) + X/Y/Z enabled = 0x87");
  CHECK(openpaw_qma_odr(50.0f) == 0x05, "ODR 50 Hz = 0x05, LPF off, got 0x%02x", openpaw_qma_odr(50.0f));
  CHECK(openpaw_qma_odr(12.5f) == 0x07, "ODR 12.5 Hz = 0x07, got 0x%02x", openpaw_qma_odr(12.5f));
  CHECK(OPENPAW_QMA_FIFO_DEPTH == 64, "64-frame FIFO");
  CHECK(OPENPAW_QMA_FIFO_READ_MS * 50u < OPENPAW_QMA_FIFO_DEPTH * 1000u,
        "a read every %u ms at 50 Hz fits the 64-frame FIFO (1.28 s)", OPENPAW_QMA_FIFO_READ_MS);
  const uint8_t q_st[4] = {0x00, 0x00, 0x00, 40};  // 0Bh..0Eh burst: 40 frames queued
  fp = openpaw_qma_fifo_plan(q_st);
  CHECK(fp.samples == 40 && fp.skip_words == 0 && !fp.overrun, "40 frames -> 40 samples (%u)", fp.samples);
  const uint8_t q_over[4] = {0x80, 0x00, 0x00, 64};
  fp = openpaw_qma_fifo_plan(q_over);
  CHECK(fp.overrun == 1 && fp.samples == 64, "FIFO_OR bit 7 -> overrun, 64 frames (%u)", fp.samples);
  const uint8_t q_bad[4] = {0x00, 0x00, 0x00, 200};  // counter beyond the depth: never read past it
  CHECK(openpaw_qma_fifo_plan(q_bad).samples == 64, "frame counter clamps to the 64-frame depth");
  // +2048, -2048, 0 counts (14-bit, left-aligned), X LSB bit 0 = valid frame
  const uint8_t qf[6] = {0x01, 0x20, 0x00, 0xE0, 0x00, 0x00};
  CHECK(openpaw_qma_frame_mg(qf, &mx, &my, &mz) == 1, "LSB bit 0 set -> valid frame");
  CHECK(mx == 2000 && my == -2000 && mz == 0, "0.977 mg/LSB, same as the polled read: %d %d %d", mx, my, mz);
  const uint8_t qe[6] = {0, 0, 0, 0, 0, 0};  // read past the fill level: all zeroes
  CHECK(openpaw_qma_frame_mg(qe, &mx, &my, &mz) == 0, "all-zero frame (FIFO empty) is not valid");

  // 15c. QMA6100P master clock in Still mode. Datasheet Rev F table 2: current 38/19/10/6 uA
  // at MCLK 51.2/25.6/12.8/6.4 kHz (any ODR); 9.12 PM 11h = MODE bit 7 + MCLK[3:0] (4 = 51.2,
  // 6 = 12.8 kHz); 9.11 gives the ODR table "when MCLK is 51.2 kHz". Still mode asks for MCLK
  // 12.8 kHz with ODR code 5 (50 Hz at 51.2 kHz -> 12.5 Hz if the rate scales with MCLK),
  // and a rate check falls back to 51.2 kHz + ODR code 7 when the measured rate is off.
  openpaw_qma_clock_t ck = openpaw_qma_clock(0, 1);
  CHECK(ck.pm == 0x84 && ck.odr == 0x05 && ck.ua == 38, "Active: PM 0x84 (51.2 kHz), ODR 0x05, 38 uA (%02x %02x %u)",
        ck.pm, ck.odr, ck.ua);
  ck = openpaw_qma_clock(1, 1);
  CHECK(ck.pm == 0x86 && ck.odr == 0x05 && ck.ua == 10, "Still: PM 0x86 (12.8 kHz), ODR 0x05, 10 uA (%02x %02x %u)",
        ck.pm, ck.odr, ck.ua);
  ck = openpaw_qma_clock(1, 0);
  CHECK(ck.pm == 0x84 && ck.odr == 0x07 && ck.ua == 38, "Still after a failed rate check: PM 0x84, ODR 0x07 (%02x %02x)",
        ck.pm, ck.odr);
  openpaw_rate_check_t rck;
  int rv = 0;
  openpaw_rate_check_start(&rck, 12.5f);
  for (int i = 0; i < 4; i++) rv = openpaw_rate_check_feed(&rck, 10, 800);
  CHECK(rv == 0, "3.2 s is too short for a verdict (%d)", rv);
  rv = openpaw_rate_check_feed(&rck, 10, 800);
  CHECK(rv == 1, "12.5 Hz over 4 s -> rate ok (%d)", rv);
  CHECK(openpaw_rate_check_feed(&rck, 40, 800) == 1, "the verdict is sticky once given");
  openpaw_rate_check_start(&rck, 12.5f);
  for (int i = 0; i < 5; i++) rv = openpaw_rate_check_feed(&rck, 40, 800);
  CHECK(rv == -1, "50 Hz when 12.5 Hz was asked (ODR did not scale) -> fall back (%d)", rv);
  openpaw_rate_check_start(&rck, 12.5f);
  for (int i = 0; i < 5; i++) rv = openpaw_rate_check_feed(&rck, 0, 800);
  CHECK(rv == -1, "no frames at all -> fall back (%d)", rv);
  openpaw_rate_check_start(&rck, 12.5f);
  for (int i = 0; i < 5; i++) rv = openpaw_rate_check_feed(&rck, 11, 800);
  CHECK(rv == 1, "13.75 Hz (10%% fast, internal oscillator) -> ok (%d)", rv);
  openpaw_rate_check_start(&rck, 12.5f);
  for (int i = 0; i < 5; i++) rv = openpaw_rate_check_feed(&rck, 7, 800);
  CHECK(rv == -1, "8.75 Hz (30%% slow) -> fall back (%d)", rv);

  // a batch gives the same epochs as feeding the samples one by one
  openpaw_state_t sa, sb; openpaw_init(&sa, cfg); openpaw_init(&sb, cfg);
  int16_t xyz[3 * 37]; uint32_t ta = 0, n_rec_a = 0, n_rec_b = 0, mism = 0;
  openpaw_record_t ra[8], rb[8];
  rng = 4242;
  for (int batch = 0; batch < 22; batch++) {  // 22 x 37 = 814 samples = 3 epochs + 64
    for (int i = 0; i < 37; i++, ta++) {
      for (int k = 0; k < 3; k++) xyz[3 * i + k] = gen_trot(k, ta);
      openpaw_record_t r;
      if (openpaw_push(&sa, xyz[3 * i], xyz[3 * i + 1], xyz[3 * i + 2], 0, 0, 80, 0, &r) && n_rec_a < 8) ra[n_rec_a++] = r;
    }
    uint32_t off = 0, used = 0;
    openpaw_record_t r;
    while (off < 37) {
      if (openpaw_push_batch(&sb, xyz + 3 * off, 37 - off, 1000u * (batch + 1), 0, 80, 0, &r, &used) && n_rec_b < 8)
        rb[n_rec_b++] = r;
      if (used == 0) { CHECK(0, "push_batch consumed nothing"); break; }
      off += used;
    }
  }
  CHECK(n_rec_a == 3 && n_rec_b == 3, "3 epochs either way (%u, %u)", n_rec_a, n_rec_b);
  for (uint32_t i = 0; i < 3 && i < n_rec_b; i++)
    if (ra[i].vedba_mean_mg != rb[i].vedba_mean_mg || ra[i].vedba_max_mg != rb[i].vedba_max_mg ||
        ra[i].active_frac != rb[i].active_frac || ra[i].pitch_deg != rb[i].pitch_deg ||
        ra[i].roll_half_deg != rb[i].roll_half_deg || ra[i].bursts != rb[i].bursts || ra[i].seq != rb[i].seq) mism++;
  CHECK(mism == 0, "batched epochs match sample-by-sample epochs (%u differ)", mism);
  CHECK(sa.n == sb.n && sb.n == 64, "64 samples of the 4th epoch pending either way (%u, %u)", sa.n, sb.n);

  // each sample gets its own time: the newest sample was read at now_ms, older ones
  // are 1/hz apart, so an epoch that closes mid-batch is not dated to the read time
  openpaw_cfg_t c52 = cfg; c52.sample_hz = 52.0f;
  openpaw_state_t sc; openpaw_init(&sc, c52);
  CHECK(sc.expected == 260, "52 Hz x 5 s = 260 samples, got %u", sc.expected);
  openpaw_record_t rc;
  for (int i = 0; i < 230; i++) openpaw_push(&sc, 0, 0, 1000, 0, 0, 80, 0, &rc);
  int16_t flat[3 * 52];
  for (int i = 0; i < 52; i++) { flat[3 * i] = 0; flat[3 * i + 1] = 0; flat[3 * i + 2] = 1000; }
  uint32_t used = 0;
  CHECK(openpaw_push_batch(&sc, flat, 52, 20300, 0, 80, 0, &rc, &used) == 1 && used == 30,
        "epoch closes at the 30th sample of the batch (used %u)", used);
  CHECK(rc.uptime_s == 19, "closing sample is 22/52 s older than the read at 20.3 s -> uptime 19, got %u", rc.uptime_s);
  CHECK(openpaw_push_batch(&sc, flat + 3 * 30, 22, 20300, 0, 80, 0, &rc, &used) == 0 && used == 22 && sc.n == 22,
        "the rest of the batch starts the next epoch (used %u, n %u)", used, sc.n);
  CHECK(openpaw_push_batch(&sc, flat, 0, 20300, 0, 80, 0, &rc, &used) == 0 && used == 0, "empty batch is a no-op");

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
