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

static inline void openpaw_init(openpaw_state_t *s, openpaw_cfg_t cfg) {
  memset(s, 0, sizeof(*s));
  s->cfg = cfg;
  float dt = 1.0f / cfg.sample_hz;
  s->alpha = dt / (cfg.static_tau_s + dt);
  s->expected = (uint32_t)(cfg.sample_hz * cfg.epoch_s + 0.5f);
  openpaw_epoch_reset(s);
}

static inline void openpaw__close(openpaw_state_t *s, uint32_t uptime_s, uint8_t hr_bpm,
                                  uint8_t battery_pct, uint8_t extra_flags, openpaw_record_t *out) {
  const float mean = (float)(s->sum_vedba / s->n);
  out->version = OPENPAW_RECORD_VERSION;
  out->flags = extra_flags | (s->clipped ? OPENPAW_FLAG_CLIPPED : 0) |
               (hr_bpm ? OPENPAW_FLAG_HR_VALID : 0);
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

#ifdef __cplusplus
}
#endif
#endif  // OPENPAW_CORE_H
