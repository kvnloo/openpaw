// OpenPaw collar core: board-independent feature extraction + packet encoding.
// Pure C99, no Arduino dependency, so the exact same code runs on the collar
// and in host unit tests (firmware/test/test_core.c).
//
// Signal model (standard biologging practice):
//   static (gravity) component = exponential moving average of raw acceleration
//   dynamic component          = raw - static
//   VeDBA                      = |dynamic| (vectorial dynamic body acceleration)
// Each epoch (default 5 s) is summarized into one 20-byte record so it fits a
// single default-MTU BLE notification and ~100k records fit in 2 MB of flash.
//
// Nothing here infers emotion or diagnosis: these are movement measurements.
// SPDX-License-Identifier: GPL-3.0-only
#ifndef OPENPAW_CORE_H
#define OPENPAW_CORE_H

#include <stdint.h>
#include <string.h>
#include <math.h>

#ifdef __cplusplus
extern "C" {
#endif

#define OPENPAW_RECORD_VERSION 1
#define OPENPAW_RECORD_SIZE 20

// Record flags
#define OPENPAW_FLAG_HR_VALID 0x01
#define OPENPAW_FLAG_CHARGING 0x02
#define OPENPAW_FLAG_CLIPPED 0x04   // a sample hit the sensor's full-scale range
#define OPENPAW_FLAG_GAP 0x08       // fewer samples than expected (sensor stall)
#define OPENPAW_FLAG_LOWRATE 0x10   // epoch sampled at OPENPAW_HZ_LOW (still mode), not the full rate
#define OPENPAW_FLAG_NOSAMPLE 0x20  // IMU not read this epoch (openpaw_nosample_epoch): no movement or posture values

typedef struct {
  float sample_hz;          // nominal IMU rate, e.g. 50
  uint16_t epoch_s;         // epoch length in seconds, e.g. 5
  float static_tau_s;       // EMA time constant for gravity, e.g. 2.0
  float active_mg;          // VeDBA threshold counted as "active", e.g. 120 mg
  float burst_mg;           // VeDBA rising-edge threshold for bursts, e.g. 1500 mg
  int16_t full_scale_mg;    // sensor range, e.g. 8000 for +/-8 g
} openpaw_cfg_t;

typedef struct {
  uint8_t version;
  uint8_t flags;
  uint32_t seq;             // epoch index since boot
  uint32_t uptime_s;        // device uptime at end of epoch
  uint16_t vedba_mean_mg;
  uint16_t vedba_max_mg;
  uint8_t active_frac;      // 0..255 = fraction of samples above active_mg
  int8_t pitch_deg;         // mean pitch of the static vector, -90..90
  int8_t roll_half_deg;     // mean roll / 2, so -180..180 fits in int8
  uint8_t bursts;           // count of VeDBA rising edges above burst_mg (saturating)
  uint8_t hr_bpm;           // 0 = no heart-rate source
  uint8_t battery_pct;      // 0..100, 255 = unknown
} openpaw_record_t;

typedef struct {
  openpaw_cfg_t cfg;
  float alpha;
  float sx, sy, sz;         // static component (mg)
  int primed;
  // epoch accumulators
  uint32_t n, expected;
  double sum_vedba;
  float max_vedba;
  uint32_t n_active;
  double sum_pitch, sum_roll;
  uint32_t bursts;
  int above_burst;
  int clipped;
  uint32_t seq;
  float full_hz;            // rate from openpaw_init; epochs below it are flagged LOWRATE
  float pending_hz;         // openpaw_set_rate() asked mid-epoch: applied when the epoch closes
} openpaw_state_t;

static inline openpaw_cfg_t openpaw_default_cfg(void) {
  openpaw_cfg_t c;
  c.sample_hz = 50.0f;
  c.epoch_s = 5;
  c.static_tau_s = 2.0f;
  c.active_mg = 120.0f;
  c.burst_mg = 1500.0f;
  c.full_scale_mg = 8000;
  return c;
}

static inline void openpaw_epoch_reset(openpaw_state_t *s) {
  s->n = 0;
  s->sum_vedba = 0;
  s->max_vedba = 0;
  s->n_active = 0;
  s->sum_pitch = 0;
  s->sum_roll = 0;
  s->bursts = 0;
  s->clipped = 0;
}

static inline void openpaw__apply_rate(openpaw_state_t *s, float hz) {
  s->cfg.sample_hz = hz;
  float dt = 1.0f / hz;
  s->alpha = dt / (s->cfg.static_tau_s + dt);  // same gravity time constant in seconds at any rate
  s->expected = (uint32_t)(hz * s->cfg.epoch_s + 0.5f);
  s->pending_hz = 0;
}

static inline void openpaw_init(openpaw_state_t *s, openpaw_cfg_t cfg) {
  memset(s, 0, sizeof(*s));
  s->cfg = cfg;
  s->full_hz = cfg.sample_hz;
  openpaw__apply_rate(s, cfg.sample_hz);
  openpaw_epoch_reset(s);
}

// Change the sampling rate. Between epochs it applies at once; inside an epoch it
// waits for that epoch to close, so one record never mixes two rates.
static inline void openpaw_set_rate(openpaw_state_t *s, float hz) {
  if (hz <= 0) return;
  if (s->n == 0) openpaw__apply_rate(s, hz);
  else s->pending_hz = hz;
}

static inline void openpaw__close(openpaw_state_t *s, uint32_t uptime_s, uint8_t hr_bpm,
                                  uint8_t battery_pct, uint8_t extra_flags, openpaw_record_t *out) {
  const float mean = (float)(s->sum_vedba / s->n);
  out->version = OPENPAW_RECORD_VERSION;
  out->flags = extra_flags | (s->clipped ? OPENPAW_FLAG_CLIPPED : 0) |
               (hr_bpm ? OPENPAW_FLAG_HR_VALID : 0) |
               (s->cfg.sample_hz < s->full_hz ? OPENPAW_FLAG_LOWRATE : 0);
  out->seq = s->seq++;
  out->uptime_s = uptime_s;
  out->vedba_mean_mg = (uint16_t)(mean > 65535.0f ? 65535 : mean + 0.5f);
  out->vedba_max_mg = (uint16_t)(s->max_vedba > 65535.0f ? 65535 : s->max_vedba + 0.5f);
  out->active_frac = (uint8_t)((255u * s->n_active + s->n / 2) / s->n);
  out->pitch_deg = (int8_t)lroundf((float)(s->sum_pitch / s->n));
  out->roll_half_deg = (int8_t)lroundf((float)(s->sum_roll / s->n) / 2.0f);
  out->bursts = (uint8_t)(s->bursts > 255 ? 255 : s->bursts);
  out->hr_bpm = hr_bpm;
  out->battery_pct = battery_pct;
  openpaw_epoch_reset(s);
  if (s->pending_hz > 0) openpaw__apply_rate(s, s->pending_hz);
}

// Feed one sample in milli-g. Returns 1 when an epoch completed and *out was filled.
static inline int openpaw_push(openpaw_state_t *s, int16_t ax, int16_t ay, int16_t az,
                               uint32_t uptime_s, uint8_t hr_bpm, uint8_t battery_pct,
                               uint8_t extra_flags, openpaw_record_t *out) {
  const float x = ax, y = ay, z = az;
  const int16_t fs = s->cfg.full_scale_mg - 50;
  if (ax >= fs || ax <= -fs || ay >= fs || ay <= -fs || az >= fs || az <= -fs) s->clipped = 1;

  if (!s->primed) {  // start the gravity estimate at the first sample, not at zero
    s->sx = x; s->sy = y; s->sz = z;
    s->primed = 1;
  } else {
    // Only learn gravity from samples whose magnitude is near 1 g. A lunge or
    // head-shake would otherwise drag the gravity estimate and make the next
    // few seconds look "active" (caught by test_core.c case 3).
    const float mag = sqrtf(x * x + y * y + z * z);
    const float a = fabsf(mag - 1000.0f) < 350.0f ? s->alpha : s->alpha * 0.05f;
    s->sx += a * (x - s->sx);
    s->sy += a * (y - s->sy);
    s->sz += a * (z - s->sz);
  }
  const float dx = x - s->sx, dy = y - s->sy, dz = z - s->sz;
  const float vedba = sqrtf(dx * dx + dy * dy + dz * dz);

  s->sum_vedba += vedba;
  if (vedba > s->max_vedba) s->max_vedba = vedba;
  if (vedba > s->cfg.active_mg) s->n_active++;
  if (vedba > s->cfg.burst_mg) {
    if (!s->above_burst) { s->bursts++; s->above_burst = 1; }
  } else if (vedba < s->cfg.burst_mg * 0.7f) {
    s->above_burst = 0;  // hysteresis so one lunge is one burst
  }
  const float g_yz = sqrtf(s->sy * s->sy + s->sz * s->sz);
  s->sum_pitch += atan2f(-s->sx, g_yz) * 57.29578f;
  s->sum_roll += atan2f(s->sy, s->sz) * 57.29578f;
  s->n++;

  if (s->n < s->expected) return 0;
  openpaw__close(s, uptime_s, hr_bpm, battery_pct, extra_flags, out);
  return 1;
}

// Close an epoch early (e.g. the sensor stalled or the device is sleeping).
// The record is marked GAP so downstream code never mistakes it for a full epoch.
static inline int openpaw_flush(openpaw_state_t *s, uint32_t uptime_s, uint8_t hr_bpm,
                                uint8_t battery_pct, openpaw_record_t *out) {
  if (s->n == 0) return 0;
  openpaw__close(s, uptime_s, hr_bpm, battery_pct, OPENPAW_FLAG_GAP, out);
  return 1;
}

// ---- Still mode (power). A dog lying still for 5 min gets sampled at 10 Hz instead
// of 50: the CPU wakes 5x less often and the XIAO's IMU drops to its 12.5 Hz
// low-power mode (docs/POWER.md). Any epoch that is not clearly still (mean VeDBA at
// or above OPENPAW_STILL_MG, a burst, or a sensor gap), or a connected phone, returns
// to the full rate at the next epoch. OPENPAW_STILL_MG is a provisional power
// setting, tighter than the app's "still" band (250 mg, which includes standing).
#define OPENPAW_STILL_EPOCHS 60   // 60 x 5 s = 5 min
#define OPENPAW_STILL_MG 60
#define OPENPAW_HZ_LOW 10.0f

typedef struct {
  uint32_t still_epochs;  // consecutive still epochs with no phone connected
} openpaw_power_t;

static inline void openpaw_power_init(openpaw_power_t *p) { p->still_epochs = 0; }

// Feed each closed epoch; returns the sampling rate (Hz) to use from the next epoch on.
static inline float openpaw_power_step(openpaw_power_t *p, const openpaw_record_t *r, int connected) {
  const int still = r->vedba_mean_mg < OPENPAW_STILL_MG && r->bursts == 0 && !(r->flags & OPENPAW_FLAG_GAP);
  if (connected || !still) p->still_epochs = 0;
  else if (p->still_epochs < OPENPAW_STILL_EPOCHS) p->still_epochs++;
  return p->still_epochs >= OPENPAW_STILL_EPOCHS ? OPENPAW_HZ_LOW : 50.0f;
}

// ---- No-sample Still epoch (written in Quiet mode, openpaw_quiet_step below; XIAO only
// for now). When the IMU's motion interrupt has stayed quiet for a whole epoch the
// CPU may skip reading it, so there is no movement or posture to report. The record says
// so with OPENPAW_FLAG_NOSAMPLE; movement fields are 0 and pitch/roll carry
// OPENPAW_NOSAMPLE_POSTURE (-128: outside -90..90 pitch and, x2, outside -180..180 roll),
// so even a reader that ignores the flag sees an impossible posture, never "lying flat".
// The app exports no movement or posture events for it (app/openpaw-ble.js) and
// tools/check_export.py keeps it out of the still/moving checks. It is not a measurement
// of stillness: only "the motion interrupt did not fire" (provisional 125 mg threshold).
#define OPENPAW_NOSAMPLE_POSTURE (-128)

// Returns 1 and fills *out; returns 0 (nothing written) inside a half-filled epoch, so one
// record never mixes real samples with no-sample time.
static inline int openpaw_nosample_epoch(openpaw_state_t *s, uint32_t uptime_s, uint8_t battery_pct,
                                         openpaw_record_t *out) {
  if (s->n != 0) return 0;
  memset(out, 0, sizeof(*out));
  out->version = OPENPAW_RECORD_VERSION;
  out->flags = OPENPAW_FLAG_NOSAMPLE;
  out->seq = s->seq++;
  out->uptime_s = uptime_s;
  out->pitch_deg = OPENPAW_NOSAMPLE_POSTURE;
  out->roll_half_deg = OPENPAW_NOSAMPLE_POSTURE;
  out->battery_pct = battery_pct;
  return 1;
}

// ---- Sensor-only Still ("quiet", power). After OPENPAW_QUIET_AFTER low-rate still epochs
// (1 more minute in Still mode) with no phone, the CPU stops draining the IMU FIFO. The
// accelerometer keeps running at 12.5 Hz with its wake-up interrupt latched on INT1, and
// once per epoch the CPU reads only that pin (digitalRead: no GPIOTE channel, see
// docs/POWER.md) and writes a no-sample record. The pin, a phone connecting, or a check
// epoch that is not still returns to Active. Every OPENPAW_QUIET_CHECK-th quiet epoch is
// sampled for real (a check epoch), so a dead pin cannot hide a moving dog for more than a
// minute: a check epoch with a burst or a peak of OPENPAW_QUIET_MISS_MG or more while the
// pin stayed low means the pin missed motion, and quiet mode stays off until reboot.
// LSM6DS3TR-C registers (datasheet register map; ST lsm6ds3tr-c_reg.h):
//   TAP_CFG 58h: INTERRUPTS_ENABLE bit 7, LIR bit 0 (latch until WAKE_UP_SRC is read)
//   WAKE_UP_THS 5Bh WK_THS[5:0], 1 LSB = FS_XL / 2^6 (125 mg at +/-8 g); WAKE_UP_DUR 5Ch = 0
//   MD1_CFG 5Eh INT1_WU bit 5; WAKE_UP_SRC 1Bh WU_IA bit 3 (reading it clears the latch)
// Thresholds are provisional power settings, not calibrated. Not yet run on hardware.
#define OPENPAW_LSM_TAP_CFG_WAKE 0x81
#define OPENPAW_LSM_MD1_INT1_WU 0x20
#define OPENPAW_LSM_WU_IA 0x08
#define OPENPAW_LSM_WAKE_THS 1       // 125 mg slope at +/-8 g
// QMA6100P (T1000-E) any-motion on INT1 = P1.02 (QST datasheet Rev F; Seeed's T1000-E
// qma6100p.c and Meshtastic's QMA6100PSensor.cpp use the same registers):
//   7.3 any-motion: slope between successive samples > ANY_MOT_TH for ANY_MOT_DUR + 1 samples
//   MOTION_CFG2 2Eh ANY_MOT_TH: 1 LSB = 16 x 0.977 mg = 15.6 mg at +/-8 g (8 = 125 mg)
//   MOTION_CFG0 2Ch ANY_MOT_DUR[1:0] = 0 (NO_MOT_DUR unused); MOTION_CFG3 2Fh = 0 (slope input)
//   INT_EN2 18h ANY_MOT_EN_X/Y/Z bits 2:0; INT1_MAP1 1Ah INT1_ANY_MOT bit 0
//   INTPIN_CONF 20h INT1_LVL bit 0 (1 = active high), INT1_OD bit 1 (0 = push-pull)
//   INT_CFG 21h LATCH_INT bit 0; INT_RD_CLR bit 7 = 0: only reading INT_STATUS_0 09h clears
//     the any-motion latch, so the FIFO status burst from 0Bh in a check epoch leaves it set
//   INT_STATUS_0 09h ANY_MOT_X/Y/Z bits 2:0
// Thresholds are provisional power settings, not calibrated. Not yet run on hardware.
#define OPENPAW_QMA_ANY_MOT_TH 8        // 125 mg slope at +/-8 g, as on the XIAO
#define OPENPAW_QMA_ANY_MOT_DUR 0
#define OPENPAW_QMA_INT_EN2_ANY 0x07
#define OPENPAW_QMA_INT1_MAP1_ANY 0x01
#define OPENPAW_QMA_ANY_MOT_X_Y_Z 0x07
static inline uint8_t openpaw_qma_int_cfg(uint8_t old) { return (uint8_t)((old | 0x01u) & ~0x80u); }
static inline uint8_t openpaw_qma_intpin(uint8_t old) { return (uint8_t)((old & ~0x03u) | 0x01u); }
#define OPENPAW_QUIET_AFTER 12       // low-rate still epochs before reads stop (1 min)
#define OPENPAW_QUIET_CHECK 12       // every 12th quiet epoch is sampled (once a minute)
#define OPENPAW_QUIET_MISS_MG 500    // check-epoch peak that the wake pin must have seen
enum { OPENPAW_QUIET_READ = 0, OPENPAW_QUIET_SKIP = 1, OPENPAW_QUIET_WAKE = 2 };

typedef struct {
  uint8_t quiet;      // reads are skipped (or this is a check epoch inside quiet)
  uint8_t disabled;   // no wake pin on this board, or the pin missed motion: never skip
  uint32_t low_still; // consecutive low-rate still epochs, not connected
  uint32_t skipped;   // quiet epochs since the last check epoch
} openpaw_quiet_t;

static inline void openpaw_quiet_init(openpaw_quiet_t *q, int available) {
  q->quiet = 0; q->disabled = available ? 0 : 1; q->low_still = 0; q->skipped = 0;
}

// Call at every epoch boundary. r = the sampled epoch that just closed, or NULL if it was a
// skipped (no-sample) one; pin_high = the latched wake-up pin level read now. Returns what
// the next epoch does: READ (sample), SKIP (write a no-sample record), WAKE (leave Still:
// full rate, restart the Still count).
static inline int openpaw_quiet_step(openpaw_quiet_t *q, const openpaw_record_t *r, int connected, int pin_high) {
  if (q->disabled) return OPENPAW_QUIET_READ;
  const int was_quiet = q->quiet;
  if (connected) {
    q->quiet = 0; q->low_still = 0; q->skipped = 0;
    return was_quiet ? OPENPAW_QUIET_WAKE : OPENPAW_QUIET_READ;
  }
  if (!r) {  // a skipped epoch ended
    if (pin_high) { q->quiet = 0; q->low_still = 0; q->skipped = 0; return OPENPAW_QUIET_WAKE; }
    if (++q->skipped >= OPENPAW_QUIET_CHECK) { q->skipped = 0; return OPENPAW_QUIET_READ; }
    return OPENPAW_QUIET_SKIP;
  }
  const int still = r->vedba_mean_mg < OPENPAW_STILL_MG && r->bursts == 0 && !(r->flags & OPENPAW_FLAG_GAP);
  if (was_quiet) {  // a check epoch ended
    const int lively = r->bursts > 0 || r->vedba_max_mg >= OPENPAW_QUIET_MISS_MG;
    if (lively && !pin_high) q->disabled = 1;
    if (q->disabled || pin_high || !still) { q->quiet = 0; q->low_still = 0; q->skipped = 0; return OPENPAW_QUIET_WAKE; }
    return OPENPAW_QUIET_SKIP;
  }
  if (still && (r->flags & OPENPAW_FLAG_LOWRATE)) q->low_still++;
  else q->low_still = 0;
  if (q->low_still >= OPENPAW_QUIET_AFTER) { q->quiet = 1; q->skipped = 0; return OPENPAW_QUIET_SKIP; }
  return OPENPAW_QUIET_READ;
}

// ---- Connection interval (power). The phone gets a 15 ms interval while it is
// downloading the backlog, then 200 ms with peripheral latency 4 once the link has
// been idle (no dump) for OPENPAW_LINK_IDLE_MS. Live records (one per 5 s epoch) and
// status still arrive; latency only lets the collar skip empty connection events.
// Units: interval 1.25 ms, supervision timeout 10 ms (BLE Core spec, LL connection
// parameters). docs/POWER.md has the estimate.
#define OPENPAW_LINK_FAST 12         // 15 ms
#define OPENPAW_LINK_SLOW 160        // 200 ms
#define OPENPAW_LINK_SLOW_LATENCY 4  // radio wakes at least every 1 s when idle
#define OPENPAW_LINK_TIMEOUT_10MS 400
#define OPENPAW_LINK_IDLE_MS 2000u

typedef struct {
  uint8_t connected, fast;
  uint32_t last_busy_ms;
} openpaw_link_t;

static inline void openpaw_link_init(openpaw_link_t *l) { l->connected = 0; l->fast = 0; l->last_busy_ms = 0; }

// Call from the main loop; returns the interval to request now (OPENPAW_LINK_FAST or
// OPENPAW_LINK_SLOW, in 1.25 ms units) or 0 when nothing needs to change.
static inline uint16_t openpaw_link_step(openpaw_link_t *l, int connected, int dumping, uint32_t now_ms) {
  if (!connected) { l->connected = 0; l->fast = 0; return 0; }
  if (!l->connected || dumping) l->last_busy_ms = now_ms;
  if (!l->connected || (dumping && !l->fast)) {
    l->connected = 1; l->fast = 1;
    return OPENPAW_LINK_FAST;
  }
  if (l->fast && !dumping && (uint32_t)(now_ms - l->last_busy_ms) >= OPENPAW_LINK_IDLE_MS) {
    l->fast = 0;
    return OPENPAW_LINK_SLOW;
  }
  return 0;
}

// ---- Advertising (power). After boot or a disconnect the collar advertises every
// 100 ms for 30 s, then every 1 s. Once no phone has been connected for
// OPENPAW_ADV_PARK_MS it "parks" at 2 s: half the advertising radio cost, and a phone
// that opens the app still finds it within ~2 s. A connection restores the normal pair,
// so the next disconnect starts fast again. Units: 0.625 ms (BLE Core spec).
#define OPENPAW_ADV_FAST 160      // 100 ms
#define OPENPAW_ADV_SLOW 1600     // 1 s
#define OPENPAW_ADV_PARKED 3200   // 2 s
#define OPENPAW_ADV_PARK_MS 600000u  // 10 min with no phone

typedef struct {
  uint8_t parked;
  uint32_t last_conn_ms;  // boot, or the last moment a phone was connected
} openpaw_adv_t;

static inline void openpaw_adv_init(openpaw_adv_t *a, uint32_t now_ms) { a->parked = 0; a->last_conn_ms = now_ms; }

// Call from the main loop; returns OPENPAW_ADV_PARKED (restart advertising at 2 s),
// OPENPAW_ADV_SLOW (restore the 100 ms / 1 s pair) or 0 when nothing needs to change.
static inline uint16_t openpaw_adv_step(openpaw_adv_t *a, int connected, uint32_t now_ms) {
  if (connected) {
    a->last_conn_ms = now_ms;
    if (a->parked) { a->parked = 0; return OPENPAW_ADV_SLOW; }
    return 0;
  }
  if (!a->parked && (uint32_t)(now_ms - a->last_conn_ms) >= OPENPAW_ADV_PARK_MS) {
    a->parked = 1;
    return OPENPAW_ADV_PARKED;
  }
  return 0;
}

// ---- LSM6DS3TR-C FIFO batching (power, XIAO nRF52840 Sense). The IMU queues its
// accelerometer samples in its own FIFO (up to 4 KB = 682 XYZ samples, ~13 s at 52 Hz)
// and the CPU reads them in one burst about once a second instead of waking 50x/s.
// Registers: LSM6DS3TR-C datasheet section 5 / 9 and ST's lsm6ds3tr-c_reg.h:
//   FIFO_CTRL3 08h DEC_FIFO_XL[2:0]=001 (accel, no decimation), gyro not batched
//   FIFO_CTRL5 0Ah ODR_FIFO[6:3] (1 = 12.5 Hz, 3 = 52 Hz), FIFO_MODE[2:0]=110 continuous
//   FIFO_STATUS1/2 3Ah/3Bh DIFF_FIFO[10:0] unread 16-bit words, 3Bh bit 6 OVER_RUN, bit 4 EMPTY
//   FIFO_STATUS3/4 3Ch/3Dh FIFO_PATTERN[9:0] = which word comes next (0 = X when only accel)
//   FIFO_DATA_OUT_L/H 3Eh/3Fh, read as one burst (ST driver fifo_raw_data_get)
#define OPENPAW_LSM_FIFO_CTRL3 0x01
#define OPENPAW_FIFO_READ_MS 1000u  // how often the CPU drains the FIFO

// IMU bus clock. Both sensors support I2C fast mode (LSM6DS3TR-C datasheet I2C timing table;
// QMA6100P datasheet Rev F table 9: fSCL max 400 kHz). The Seeed core's Wire driver busy-waits
// for every byte, so the bus clock sets how long the CPU stays awake per read (docs/POWER.md).
// TwoWire::begin() resets the clock to 100 kHz, so call setClock after every begin().
// Not yet run on hardware: if reads fail on a real board (weak pull-ups), set 100000u here.
#define OPENPAW_I2C_HZ 400000u

static inline uint8_t openpaw_lsm_fifo_ctrl5(float hz) {
  const uint8_t odr = hz <= 12.5f ? 1 : 3;  // the two rates the collar uses: 12.5 Hz still, 52 Hz full
  return (uint8_t)((odr << 3) | 0x06);
}

typedef struct {
  uint16_t samples;    // whole XYZ samples to read after the skip
  uint8_t skip_words;  // words of a torn sample to read and drop first
  uint8_t overrun;     // the FIFO overflowed: the oldest samples are gone
} openpaw_fifo_plan_t;

// st = FIFO_STATUS1..4 read in one burst from 3Ah.
static inline openpaw_fifo_plan_t openpaw_lsm_fifo_plan(const uint8_t st[4]) {
  openpaw_fifo_plan_t p;
  const uint32_t words = (uint32_t)st[0] | ((uint32_t)(st[1] & 0x07) << 8);
  const uint32_t pattern = (uint32_t)st[2] | ((uint32_t)(st[3] & 0x03) << 8);
  uint32_t skip = (3 - pattern % 3) % 3;
  if (skip > words) skip = words;
  p.skip_words = (uint8_t)skip;
  p.samples = (uint16_t)((words - skip) / 3);
  p.overrun = (st[1] & 0x40) ? 1 : 0;
  return p;
}

// One XYZ sample (6 bytes, little-endian int16) -> milli-g at +/-8 g (0.244 mg/LSB,
// datasheet table 3); truncates like the polled read always did.
static inline void openpaw_lsm_xyz_mg(const uint8_t b[6], int16_t *x, int16_t *y, int16_t *z) {
  *x = (int16_t)((int16_t)(b[0] | (b[1] << 8)) * 0.244f);
  *y = (int16_t)((int16_t)(b[2] | (b[3] << 8)) * 0.244f);
  *z = (int16_t)((int16_t)(b[4] | (b[5] << 8)) * 0.244f);
}

// ---- QMA6100P FIFO batching (power, SenseCAP T1000-E). QST QMA6100P datasheet Rev F:
//   7.8 FIFO_INT: 64 frames of X/Y/Z; STREAM mode keeps the newest 64 and sets FIFO_OR
//     when it drops old ones; a frame not read completely is discarded; reading past the
//     fill level returns zeroes; writing 3Eh or 31h clears the FIFO.
//   9.7 INT_STATUS_2 0Bh bit 7 FIFO_OR; 9.9 FIFO_STATUS 0Eh = frames queued.
//   9.11 ODR 10h ODR[4:0] (5 = 50 Hz, 7 = 12.5 Hz at MCLK 51.2 kHz), NLPF bits 0 = filter off.
//   9.48 FIFO_CFG0 3Eh: FIFO_MODE[7:6] = 10 STREAM, FIFO_EN_Z/Y/X bits 2:0.
//   9.49 FIFO_DATA 3Fh: XLSB XMSB YLSB YMSB ZLSB ZMSB; bit 0 of an LSB is 1 for a real frame.
// 64 frames last 1.28 s at 50 Hz, so the CPU drains it more often than the XIAO's.
#define OPENPAW_QMA_FIFO_CFG0 0x87
#define OPENPAW_QMA_FIFO_DEPTH 64u
#define OPENPAW_QMA_FIFO_READ_MS 800u

static inline uint8_t openpaw_qma_odr(float hz) {
  return hz <= 12.5f ? 0x07 : 0x05;  // the two rates the collar uses: 12.5 Hz still, 50 Hz full
}

// ---- QMA6100P master clock (power, T1000-E). Datasheet Rev F table 2: current depends on
// MCLK, not the ODR: 38 / 19 / 10 / 6 uA at 51.2 / 25.6 / 12.8 / 6.4 kHz. 9.12 PM 11h:
// bit 7 MODE (active), MCLK[3:0] 4 = 51.2 kHz, 6 = 12.8 kHz. 9.11's ODR table is given only
// "when MCLK is 51.2 kHz"; no public driver runs another MCLK. Still mode assumes the rate
// scales with MCLK (ODR code 5 = 50 Hz at 51.2 kHz -> 12.5 Hz at 12.8 kHz) and checks it:
// openpaw_rate_check_* counts FIFO frames, and a wrong rate sends the board back to
// 51.2 kHz + ODR code 7 (slow_ok = 0) for the rest of the boot. Not yet run on hardware.
#define OPENPAW_QMA_PM_51K2 0x84u
#define OPENPAW_QMA_PM_12K8 0x86u
#define OPENPAW_RATE_CHECK_MS 4000u   // judge after this much FIFO time
#define OPENPAW_RATE_CHECK_TOL 0.25f  // allowed relative error (internal oscillator)

typedef struct { uint8_t pm, odr; uint16_t ua; } openpaw_qma_clock_t;

static inline openpaw_qma_clock_t openpaw_qma_clock(int low, int slow_ok) {
  openpaw_qma_clock_t c;
  if (low && slow_ok) { c.pm = OPENPAW_QMA_PM_12K8; c.odr = 0x05; c.ua = 10; }
  else { c.pm = OPENPAW_QMA_PM_51K2; c.odr = openpaw_qma_odr(low ? 12.5f : 50.0f); c.ua = 38; }
  return c;
}

typedef struct { float hz; uint32_t frames, ms; int verdict; } openpaw_rate_check_t;

static inline void openpaw_rate_check_start(openpaw_rate_check_t *r, float hz) {
  r->hz = hz; r->frames = 0; r->ms = 0; r->verdict = 0;
}

// Feed the frames one FIFO read returned and the ms since the previous read. Returns 0 while
// fewer than OPENPAW_RATE_CHECK_MS have been seen, then 1 (rate ok) or -1 (fall back); the
// verdict is sticky until the next start.
static inline int openpaw_rate_check_feed(openpaw_rate_check_t *r, uint32_t frames, uint32_t dt_ms) {
  if (r->verdict) return r->verdict;
  r->frames += frames; r->ms += dt_ms;
  if (r->ms < OPENPAW_RATE_CHECK_MS) return 0;
  float hz = (float)r->frames * 1000.0f / (float)r->ms;
  float err = (hz - r->hz) / r->hz;
  r->verdict = (err <= OPENPAW_RATE_CHECK_TOL && err >= -OPENPAW_RATE_CHECK_TOL) ? 1 : -1;
  return r->verdict;
}

// st = INT_STATUS_2..FIFO_STATUS read in one burst from 0Bh (0Bh, 0Ch, 0Dh, 0Eh).
static inline openpaw_fifo_plan_t openpaw_qma_fifo_plan(const uint8_t st[4]) {
  openpaw_fifo_plan_t p;
  p.samples = st[3] > OPENPAW_QMA_FIFO_DEPTH ? (uint16_t)OPENPAW_QMA_FIFO_DEPTH : st[3];
  p.skip_words = 0;  // the QMA6100P discards a partly read frame itself
  p.overrun = (st[0] & 0x80) ? 1 : 0;
  return p;
}

// One FIFO frame -> milli-g at +/-8 g (14-bit left-aligned, 0.977 mg/LSB, same arithmetic
// as the polled read). Returns 0 when bit 0 of the X LSB says it is not a real frame.
static inline int openpaw_qma_frame_mg(const uint8_t b[6], int16_t *x, int16_t *y, int16_t *z) {
  *x = (int16_t)(((int16_t)(b[0] | (b[1] << 8)) >> 2) * 0.977f);
  *y = (int16_t)(((int16_t)(b[2] | (b[3] << 8)) >> 2) * 0.977f);
  *z = (int16_t)(((int16_t)(b[4] | (b[5] << 8)) >> 2) * 0.977f);
  return b[0] & 0x01;
}

// Feed n samples (xyz interleaved, mg) read at now_ms; the last one is the newest and
// the others are 1/sample_hz apart, so each sample is dated on its own. Returns 1 when
// an epoch closed (*out filled, its uptime = its closing sample's time); *used = samples
// consumed. Call again with the rest of the batch.
static inline int openpaw_push_batch(openpaw_state_t *s, const int16_t *xyz, uint32_t n, uint32_t now_ms,
                                     uint8_t hr_bpm, uint8_t battery_pct, uint8_t extra_flags,
                                     openpaw_record_t *out, uint32_t *used) {
  for (uint32_t i = 0; i < n; i++) {
    const uint32_t age_ms = (uint32_t)((float)(n - 1 - i) * 1000.0f / s->cfg.sample_hz + 0.5f);
    const uint32_t up = (uint32_t)(now_ms - age_ms) / 1000u;
    if (openpaw_push(s, xyz[3 * i], xyz[3 * i + 1], xyz[3 * i + 2], up, hr_bpm, battery_pct, extra_flags, out)) {
      *used = i + 1;
      return 1;
    }
  }
  *used = n;
  return 0;
}

// ---- Chest strap read by the collar (BLE central), e.g. a Polar H10. The strap sends the
// standard Heart Rate Measurement characteristic (0x2A37, Bluetooth Heart Rate Service
// 1.0): flags byte, then bpm (uint8, or uint16 when flags bit 0 is set), energy expended
// (uint16, when bit 3), then RR intervals in 1/1024 s (uint16 each, when bit 4). Contact
// status: bit 2 = supported, bit 1 = detected. Parsed exactly like app/openpaw-ble.js
// parseHeartRate. A default-MTU notification holds at most 9 RR intervals; extra ones
// are dropped. Each closed epoch gets the rounded mean bpm of that epoch's notifications
// (openpaw_hr_take), never a value carried over from an earlier epoch. The 20-byte record
// has no room for RR intervals; they stay with the phone path for now.
#define OPENPAW_HRM_MAX_RR 9

typedef struct {
  uint16_t bpm;
  int8_t contact;      // 1 detected, 0 not detected, -1 strap does not report contact
  uint8_t n_rr;
  uint16_t rr_1024[OPENPAW_HRM_MAX_RR];
} openpaw_hrm_t;

// Returns 1 and fills *m for a well-formed packet; 0 for a truncated one.
static inline int openpaw_hrm_parse(const uint8_t *b, uint16_t len, openpaw_hrm_t *m) {
  memset(m, 0, sizeof(*m));
  if (len < 2) return 0;
  const uint8_t flags = b[0];
  uint16_t o = 1;
  if (flags & 0x01) {
    if (len < 3) return 0;
    m->bpm = (uint16_t)(b[1] | (b[2] << 8));
    o = 3;
  } else {
    m->bpm = b[1];
    o = 2;
  }
  m->contact = (flags & 0x04) ? ((flags & 0x02) ? 1 : 0) : -1;
  if (flags & 0x08) {
    if (len < o + 2) return 0;
    o += 2;
  }
  if (flags & 0x10)
    for (; o + 1 < len && m->n_rr < OPENPAW_HRM_MAX_RR; o += 2)
      m->rr_1024[m->n_rr++] = (uint16_t)(b[o] | (b[o + 1] << 8));
  return 1;
}

typedef struct {
  uint32_t sum, n;     // bpm notified during the current epoch
} openpaw_hr_t;

static inline void openpaw_hr_init(openpaw_hr_t *h) { h->sum = 0; h->n = 0; }

// Contact lost or a 0 bpm reading is not a heart rate: it is left out.
static inline void openpaw_hr_feed(openpaw_hr_t *h, const openpaw_hrm_t *m) {
  if (m->bpm == 0 || m->contact == 0) return;
  h->sum += m->bpm;
  h->n++;
}

// The epoch's hr_bpm (0 = no strap reading this epoch; 255 = 255 bpm or more). Resets.
static inline uint8_t openpaw_hr_take(openpaw_hr_t *h) {
  uint32_t v = h->n ? (h->sum + h->n / 2) / h->n : 0;
  openpaw_hr_init(h);
  return (uint8_t)(v > 255 ? 255 : v);
}

// Little-endian wire format, 20 bytes. Must match app/openpaw-ble.js decodeRecord().
static inline void openpaw_encode(const openpaw_record_t *r, uint8_t b[OPENPAW_RECORD_SIZE]) {
  b[0] = r->version;
  b[1] = r->flags;
  b[2] = (uint8_t)(r->seq); b[3] = (uint8_t)(r->seq >> 8);
  b[4] = (uint8_t)(r->seq >> 16); b[5] = (uint8_t)(r->seq >> 24);
  b[6] = (uint8_t)(r->uptime_s); b[7] = (uint8_t)(r->uptime_s >> 8);
  b[8] = (uint8_t)(r->uptime_s >> 16); b[9] = (uint8_t)(r->uptime_s >> 24);
  b[10] = (uint8_t)(r->vedba_mean_mg); b[11] = (uint8_t)(r->vedba_mean_mg >> 8);
  b[12] = (uint8_t)(r->vedba_max_mg); b[13] = (uint8_t)(r->vedba_max_mg >> 8);
  b[14] = r->active_frac;
  b[15] = (uint8_t)r->pitch_deg;
  b[16] = (uint8_t)r->roll_half_deg;
  b[17] = r->bursts;
  b[18] = r->hr_bpm;
  b[19] = r->battery_pct;
}

static inline void openpaw_decode(const uint8_t b[OPENPAW_RECORD_SIZE], openpaw_record_t *r) {
  r->version = b[0];
  r->flags = b[1];
  r->seq = (uint32_t)b[2] | ((uint32_t)b[3] << 8) | ((uint32_t)b[4] << 16) | ((uint32_t)b[5] << 24);
  r->uptime_s = (uint32_t)b[6] | ((uint32_t)b[7] << 8) | ((uint32_t)b[8] << 16) | ((uint32_t)b[9] << 24);
  r->vedba_mean_mg = (uint16_t)(b[10] | (b[11] << 8));
  r->vedba_max_mg = (uint16_t)(b[12] | (b[13] << 8));
  r->active_frac = b[14];
  r->pitch_deg = (int8_t)b[15];
  r->roll_half_deg = (int8_t)b[16];
  r->bursts = b[17];
  r->hr_bpm = b[18];
  r->battery_pct = b[19];
}

// ---- Time anchor (20 bytes, version byte 2). The collar has no clock; when the app
// connects it sends the wall-clock time and the collar logs this record next to
// the epochs, so epochs from this boot can still be dated after a restart.
// Wire: [0]=2 [1]=0 [2..6) seq of the next epoch [6..10) uptime_s [10..14) unix_s
//       [14..18) boot_seq (first seq of this boot) [18..20) 0. Must match app decodeRecord().
#define OPENPAW_ANCHOR_VERSION 2
typedef struct {
  uint32_t seq;       // seq the next epoch record will get (anchors sort just before it)
  uint32_t uptime_s;  // device uptime when the time was set
  uint32_t unix_s;    // wall-clock seconds since 1970 UTC, from the phone
  uint32_t boot_seq;  // first seq of this boot
} openpaw_anchor_t;

static inline void openpaw__le32put(uint8_t *b, uint32_t v) {
  b[0] = (uint8_t)v; b[1] = (uint8_t)(v >> 8); b[2] = (uint8_t)(v >> 16); b[3] = (uint8_t)(v >> 24);
}
static inline uint32_t openpaw__le32get(const uint8_t *b) {
  return (uint32_t)b[0] | ((uint32_t)b[1] << 8) | ((uint32_t)b[2] << 16) | ((uint32_t)b[3] << 24);
}
static inline void openpaw_encode_anchor(const openpaw_anchor_t *a, uint8_t b[OPENPAW_RECORD_SIZE]) {
  memset(b, 0, OPENPAW_RECORD_SIZE);
  b[0] = OPENPAW_ANCHOR_VERSION;
  openpaw__le32put(b + 2, a->seq);
  openpaw__le32put(b + 6, a->uptime_s);
  openpaw__le32put(b + 10, a->unix_s);
  openpaw__le32put(b + 14, a->boot_seq);
}
// 1 and fills *a if b is an anchor, else 0.
static inline int openpaw_decode_anchor(const uint8_t b[OPENPAW_RECORD_SIZE], openpaw_anchor_t *a) {
  if (b[0] != OPENPAW_ANCHOR_VERSION) return 0;
  a->seq = openpaw__le32get(b + 2);
  a->uptime_s = openpaw__le32get(b + 6);
  a->unix_s = openpaw__le32get(b + 10);
  a->boot_seq = openpaw__le32get(b + 14);
  return 1;
}

// ---- Record ring buffer (RAM). Flash persistence wraps the same interface. ----
typedef struct {
  uint8_t *buf;          // capacity * OPENPAW_RECORD_SIZE bytes
  uint32_t capacity;
  uint32_t head;         // next write slot
  uint32_t count;
} openpaw_ring_t;

static inline void openpaw_ring_init(openpaw_ring_t *q, uint8_t *storage, uint32_t capacity) {
  q->buf = storage; q->capacity = capacity; q->head = 0; q->count = 0;
}

static inline void openpaw_ring_put(openpaw_ring_t *q, const openpaw_record_t *r) {
  openpaw_encode(r, q->buf + (size_t)q->head * OPENPAW_RECORD_SIZE);
  q->head = (q->head + 1) % q->capacity;
  if (q->count < q->capacity) q->count++;
}

// Copy out the i-th oldest record (0 = oldest). Returns 0 if out of range.
static inline int openpaw_ring_get(const openpaw_ring_t *q, uint32_t i, uint8_t out[OPENPAW_RECORD_SIZE]) {
  if (i >= q->count) return 0;
  uint32_t start = (q->head + q->capacity - q->count) % q->capacity;
  memcpy(out, q->buf + (size_t)((start + i) % q->capacity) * OPENPAW_RECORD_SIZE, OPENPAW_RECORD_SIZE);
  return 1;
}

// Index of the oldest stored record with seq >= from_seq (records are seq-ordered).
static inline uint32_t openpaw_ring_find(const openpaw_ring_t *q, uint32_t from_seq) {
  uint8_t b[OPENPAW_RECORD_SIZE];
  openpaw_record_t r;
  for (uint32_t i = 0; i < q->count; i++) {
    openpaw_ring_get(q, i, b);
    openpaw_decode(b, &r);
    if (r.seq >= from_seq) return i;
  }
  return q->count;
}

// ---- Storage pick from the external flash's JEDEC ID (command 0x9F). ----
// Seeed's T1000-E variant.h declares a P25Q16H; one community source says the
// T1000-E has no QSPI flash and another lists a GD25Q64. So the firmware asks
// the chip at boot instead of trusting either, and logs to internal flash
// when nothing answers.
#define OPENPAW_STORE_INTERNAL 0
#define OPENPAW_STORE_QSPI 1

typedef struct {
  int kind;               // OPENPAW_STORE_*
  uint32_t size_bytes;    // 0 when internal
  const char *name;       // part name, "unknown" if not in the table, "none" if absent
} openpaw_flash_t;

static inline int openpaw_flash_identify(const uint8_t id[3], openpaw_flash_t *out) {
  static const struct { uint8_t m, t, c; const char *name; } known[] = {
    {0x85, 0x60, 0x15, "P25Q16H"},    // Puya, 2 MB (XIAO nRF52840 + Seeed T1000-E variant.h)
    {0xC8, 0x40, 0x17, "GD25Q64C"},   // GigaDevice, 8 MB (SoftRF lists it for the T1000-E)
  };
  out->kind = OPENPAW_STORE_INTERNAL; out->size_bytes = 0; out->name = "none";
  const int blank = (id[0] == 0xFF && id[1] == 0xFF && id[2] == 0xFF) || (id[0] == 0 && id[1] == 0 && id[2] == 0);
  // capacity code is log2(bytes): 0x10 = 64 KB .. 0x1A = 64 MB covers every serial NOR we would meet
  if (blank || id[2] < 0x10 || id[2] > 0x1A) return out->kind;
  out->kind = OPENPAW_STORE_QSPI;
  out->size_bytes = (uint32_t)1u << id[2];
  out->name = "unknown";
  for (size_t i = 0; i < sizeof known / sizeof known[0]; i++)
    if (known[i].m == id[0] && known[i].t == id[1] && known[i].c == id[2]) out->name = known[i].name;
  return out->kind;
}

// One short line, e.g. "flash P25Q16H 2048KB (856015)" or "flash none, internal (ffffff)".
// Published as BLE Device Information "Hardware Revision" and printed at boot.
static inline void openpaw_flash_describe(const uint8_t id[3], const openpaw_flash_t *f, char *buf, size_t n) {
  static const char hex[] = "0123456789abcdef";
  char line[48], idhex[7];
  for (int i = 0; i < 3; i++) { idhex[2 * i] = hex[id[i] >> 4]; idhex[2 * i + 1] = hex[id[i] & 15]; }
  idhex[6] = 0;
  if (f->kind == OPENPAW_STORE_QSPI) {
    // hand-rolled so the header stays printf-free for the smallest builds
    char kb[12]; uint32_t v = f->size_bytes / 1024u; int k = 0; char rev[12];
    do { rev[k++] = (char)('0' + v % 10); v /= 10; } while (v && k < 11);
    for (int i = 0; i < k; i++) kb[i] = rev[k - 1 - i];
    kb[k] = 0;
    line[0] = 0;
    strcat(line, "flash "); strcat(line, f->name); strcat(line, " "); strcat(line, kb);
    strcat(line, "KB ("); strcat(line, idhex); strcat(line, ")");
  } else {
    line[0] = 0;
    strcat(line, "flash none, internal ("); strcat(line, idhex); strcat(line, ")");
  }
  if (n == 0) return;
  strncpy(buf, line, n - 1);
  buf[n - 1] = 0;
}

// ---- Battery: averaged ADC reading through a resistor divider -> millivolts. ----
// raw_sum = sum of n readings at adc_bits resolution against aref_mv;
// divider ratio = div_num / div_den (e.g. 2000/1000 for 100k/100k).
static inline uint16_t openpaw_vbat_mv(uint32_t raw_sum, uint32_t n, uint8_t adc_bits, uint16_t aref_mv,
                                       uint32_t div_num, uint32_t div_den) {
  if (n == 0 || div_den == 0) return 0;
  const uint64_t num = (uint64_t)raw_sum * aref_mv * div_num;
  const uint64_t den = (uint64_t)n * ((uint64_t)1 << adc_bits) * div_den;
  const uint64_t mv = (num + den / 2) / den;
  return (uint16_t)(mv > 65535u ? 65535u : mv);
}

#ifdef __cplusplus
}
#endif
#endif  // OPENPAW_CORE_H
