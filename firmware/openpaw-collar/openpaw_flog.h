// OpenPaw flash log: a circular log of 20-byte epoch records on NOR flash that
// survives reboots and flat batteries. Pure C99 like openpaw_core.h, so the
// same code runs on the collar and in host tests (firmware/test/test_flog.c).
//
// Layout, per 4 KB erase sector:
//   [0..12)  header: magic "OPL1", generation u32, ~generation u32 (all LE)
//   [12..)   170 slots of 24 bytes: record (20) + CRC-16/CCITT of the record (2) + 0xFFFF
// Sectors are filled in order; each newly started sector gets generation+1, so
// at boot the newest sector is the valid header with the highest generation and
// the oldest is found by walking back while generations stay consecutive.
// When the newest sector is full the next one (the oldest) is erased, so the
// log always keeps at least (sectors-1)*170 records: 2 MB = 86,870 records =
// 5.0 days of 5 s epochs.
//
// Power loss: a record cut off mid-write fails its CRC and reads as TORN (one
// record lost, never a corrupt one). A cut erase or header write leaves a sector
// without a valid header, which is ignored and erased again on the next pass.
// Writes are whole 24-byte slots on 4-byte boundaries, so the same layout also
// works on the nRF52's internal flash (word writes).
//
// The collar keeps counting seq across reboots from the last stored record, so
// "send me everything from seq N" stays meaningful after a restart.
// SPDX-License-Identifier: GPL-3.0-only
#ifndef OPENPAW_FLOG_H
#define OPENPAW_FLOG_H

#include "openpaw_core.h"

#ifdef __cplusplus
extern "C" {
#endif

#define OPENPAW_FLOG_SECTOR 4096u
#define OPENPAW_FLOG_HDR 12u
#define OPENPAW_FLOG_SLOT 24u
#define OPENPAW_FLOG_SLOTS ((OPENPAW_FLOG_SECTOR - OPENPAW_FLOG_HDR) / OPENPAW_FLOG_SLOT)  // 170
#define OPENPAW_FLOG_MAGIC 0x314C504Fu  // "OPL1"
#define OPENPAW_FLOG_TORN (-1)          // openpaw_flog_get: slot exists but its record was cut off

// Flash access, addresses absolute. Each returns 0 on success.
// erase() clears one OPENPAW_FLOG_SECTOR-aligned sector to 0xFF.
typedef struct {
  int (*read)(void *ctx, uint32_t addr, uint8_t *buf, uint32_t n);
  int (*prog)(void *ctx, uint32_t addr, const uint8_t *buf, uint32_t n);
  int (*erase)(void *ctx, uint32_t addr);
  void *ctx;
  uint32_t base, size;  // log region; base sector-aligned
} openpaw_flash_io_t;

typedef struct {
  openpaw_flash_io_t io;
  uint32_t nsect;
  uint32_t tail;       // oldest sector in use
  uint32_t head;       // sector being written
  uint32_t head_slot;  // next free slot in head (== OPENPAW_FLOG_SLOTS when full)
  uint32_t gen;        // generation of head
  uint32_t count;      // slots from oldest to newest, torn ones included
  uint32_t next_seq;   // seq after the newest good record (0 on an empty log)
} openpaw_flog_t;

// Records the log is guaranteed to keep for a region of `size` bytes.
static inline uint32_t openpaw_flog_capacity(uint32_t size) {
  uint32_t n = size / OPENPAW_FLOG_SECTOR;
  return n < 2 ? 0 : (n - 1) * OPENPAW_FLOG_SLOTS;
}

static inline uint16_t openpaw__crc16(const uint8_t *p, uint32_t n) {
  uint16_t c = 0xFFFF;
  while (n--) {
    c ^= (uint16_t)(*p++) << 8;
    for (int i = 0; i < 8; i++) c = (uint16_t)((c & 0x8000) ? (c << 1) ^ 0x1021 : c << 1);
  }
  return c;
}
static inline uint32_t openpaw__le32(const uint8_t *b) {
  return (uint32_t)b[0] | ((uint32_t)b[1] << 8) | ((uint32_t)b[2] << 16) | ((uint32_t)b[3] << 24);
}
static inline void openpaw__put32(uint8_t *b, uint32_t v) {
  b[0] = (uint8_t)v; b[1] = (uint8_t)(v >> 8); b[2] = (uint8_t)(v >> 16); b[3] = (uint8_t)(v >> 24);
}
static inline uint32_t openpaw__sect_addr(const openpaw_flog_t *L, uint32_t s) {
  return L->io.base + s * OPENPAW_FLOG_SECTOR;
}
// 1 + generation if the sector header is valid, else 0.
static inline int openpaw__hdr(const openpaw_flog_t *L, uint32_t s, uint32_t *gen) {
  uint8_t h[OPENPAW_FLOG_HDR];
  if (L->io.read(L->io.ctx, openpaw__sect_addr(L, s), h, sizeof h)) return 0;
  const uint32_t g = openpaw__le32(h + 4);
  if (openpaw__le32(h) != OPENPAW_FLOG_MAGIC || openpaw__le32(h + 8) != (uint32_t)~g) return 0;
  *gen = g;
  return 1;
}
#define OPENPAW__EMPTY 0
#define OPENPAW__VALID 1
#define OPENPAW__BAD 2
static inline int openpaw__slot(const openpaw_flog_t *L, uint32_t s, uint32_t k, uint8_t rec[OPENPAW_RECORD_SIZE]) {
  uint8_t b[OPENPAW_FLOG_SLOT];
  if (L->io.read(L->io.ctx, openpaw__sect_addr(L, s) + OPENPAW_FLOG_HDR + k * OPENPAW_FLOG_SLOT, b, sizeof b))
    return OPENPAW__BAD;
  int empty = 1;
  for (uint32_t i = 0; i < OPENPAW_FLOG_SLOT; i++) empty &= (b[i] == 0xFF);
  if (empty) return OPENPAW__EMPTY;
  const uint16_t crc = (uint16_t)(b[20] | (b[21] << 8));
  if (crc != openpaw__crc16(b, OPENPAW_RECORD_SIZE) || b[0] == 0xFF) return OPENPAW__BAD;
  if (rec) memcpy(rec, b, OPENPAW_RECORD_SIZE);
  return OPENPAW__VALID;
}
static inline int openpaw__start_sector(openpaw_flog_t *L, uint32_t s, uint32_t gen) {
  if (L->io.erase(L->io.ctx, openpaw__sect_addr(L, s))) return -1;
  uint8_t h[OPENPAW_FLOG_HDR];
  openpaw__put32(h, OPENPAW_FLOG_MAGIC); openpaw__put32(h + 4, gen); openpaw__put32(h + 8, ~gen);
  if (L->io.prog(L->io.ctx, openpaw__sect_addr(L, s), h, sizeof h)) return -1;
  L->head = s; L->head_slot = 0; L->gen = gen;
  return 0;
}

// Slot i (0 = oldest): 1 = record copied to out, OPENPAW_FLOG_TORN = lost record, 0 = out of range.
static inline int openpaw_flog_get(const openpaw_flog_t *L, uint32_t i, uint8_t out[OPENPAW_RECORD_SIZE]) {
  if (i >= L->count) return 0;
  const uint32_t s = (L->tail + i / OPENPAW_FLOG_SLOTS) % L->nsect;
  return openpaw__slot(L, s, i % OPENPAW_FLOG_SLOTS, out) == OPENPAW__VALID ? 1 : OPENPAW_FLOG_TORN;
}

// Find the log in flash (or start one). Returns 0, or -1 if the region is unusable.
static inline int openpaw_flog_mount(openpaw_flog_t *L, openpaw_flash_io_t io) {
  memset(L, 0, sizeof *L);
  L->io = io;
  L->nsect = io.size / OPENPAW_FLOG_SECTOR;
  if (L->nsect < 2 || io.base % OPENPAW_FLOG_SECTOR) return -1;
  int found = 0;
  uint32_t best = 0;
  for (uint32_t s = 0; s < L->nsect; s++) {
    uint32_t g;
    if (openpaw__hdr(L, s, &g) && (!found || g > L->gen)) { found = 1; L->gen = g; best = s; }
  }
  if (!found) return openpaw__start_sector(L, 0, 1);
  L->head = best;
  uint32_t t = best, g = L->gen, steps = 0;
  while (steps < L->nsect - 1) {
    const uint32_t p = (t + L->nsect - 1) % L->nsect;
    uint32_t pg;
    if (!openpaw__hdr(L, p, &pg) || pg != g - 1) break;
    t = p; g = pg; steps++;
  }
  L->tail = t;
  L->head_slot = 0;
  for (uint32_t k = OPENPAW_FLOG_SLOTS; k > 0; k--)
    if (openpaw__slot(L, best, k - 1, 0) != OPENPAW__EMPTY) { L->head_slot = k; break; }
  L->count = steps * OPENPAW_FLOG_SLOTS + L->head_slot;
  uint8_t b[OPENPAW_RECORD_SIZE] = {0};
  for (uint32_t i = L->count; i > 0; i--)
    if (openpaw_flog_get(L, i - 1, b) == 1) {  // an anchor carries the seq of the epoch after it
      L->next_seq = openpaw__le32(b + 2) + (b[0] == OPENPAW_ANCHOR_VERSION ? 0u : 1u);
      break;
    }
  return 0;
}

// Append one 20-byte slot (epoch record or time anchor); next_seq is what the
// seq counter becomes once it is stored.
static inline int openpaw__put_raw(openpaw_flog_t *L, uint8_t b[OPENPAW_FLOG_SLOT], uint32_t next_seq) {
  if (L->head_slot >= OPENPAW_FLOG_SLOTS) {
    const uint32_t ns = (L->head + 1) % L->nsect;
    if (ns == L->tail && L->count > 0) {  // recycle the oldest sector
      L->tail = (L->tail + 1) % L->nsect;
      L->count -= OPENPAW_FLOG_SLOTS;
    }
    if (openpaw__start_sector(L, ns, L->gen + 1)) return -1;  // head unchanged: retried next put
  }
  const uint16_t crc = openpaw__crc16(b, OPENPAW_RECORD_SIZE);
  b[20] = (uint8_t)crc; b[21] = (uint8_t)(crc >> 8); b[22] = 0xFF; b[23] = 0xFF;
  const uint32_t addr = openpaw__sect_addr(L, L->head) + OPENPAW_FLOG_HDR + L->head_slot * OPENPAW_FLOG_SLOT;
  L->head_slot++;
  L->count++;
  if (L->io.prog(L->io.ctx, addr, b, OPENPAW_FLOG_SLOT)) return -1;
  L->next_seq = next_seq;
  return 0;
}

// Append one record. Returns 0, or -1 if the flash write failed (that slot is
// skipped; the next put carries on).
static inline int openpaw_flog_put(openpaw_flog_t *L, const openpaw_record_t *r) {
  uint8_t b[OPENPAW_FLOG_SLOT];
  openpaw_encode(r, b);
  return openpaw__put_raw(L, b, r->seq + 1);
}

// Append a time anchor (a->seq should be the seq the next epoch will get, so
// the log stays in seq order and a sync from that seq includes the anchor).
static inline int openpaw_flog_put_anchor(openpaw_flog_t *L, const openpaw_anchor_t *a) {
  uint8_t b[OPENPAW_FLOG_SLOT];
  openpaw_encode_anchor(a, b);
  return openpaw__put_raw(L, b, a->seq > L->next_seq ? a->seq : L->next_seq);
}

// Index of the oldest good record with seq >= from_seq, or count if none
// (binary search; records are stored in seq order, torn slots are stepped over).
static inline uint32_t openpaw_flog_find(const openpaw_flog_t *L, uint32_t from_seq) {
  uint32_t lo = 0, hi = L->count, ans = L->count;
  uint8_t b[OPENPAW_RECORD_SIZE] = {0};  // only read after get() == 1 filled it; init for gcc's flow analysis
  while (lo < hi) {
    const uint32_t mid = lo + (hi - lo) / 2;
    uint32_t j = mid;
    while (j < hi && openpaw_flog_get(L, j, b) != 1) j++;
    if (j == hi) { hi = mid; continue; }
    if (openpaw__le32(b + 2) >= from_seq) { ans = j; hi = mid; }
    else lo = j + 1;
  }
  return ans;
}

#ifdef __cplusplus
}
#endif
#endif  // OPENPAW_FLOG_H
