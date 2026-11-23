// Host tests for firmware/openpaw-collar/openpaw_flog.h (circular record log on NOR flash).
// Build+run: cc -std=c99 -O1 -Wall -Wextra -Werror -o /tmp/tf firmware/test/test_flog.c -lm && /tmp/tf
// The flash is simulated in RAM with real NOR rules: erase sets a 4 KB sector to 0xFF,
// programming can only clear bits (new = old & data). Power cuts are injected by
// limiting how many bytes a program or erase gets through before "the battery dies".
// SPDX-License-Identifier: GPL-3.0-only
#include "../openpaw-collar/openpaw_flog.h"
#include <stdio.h>
#include <stdlib.h>

static int failures = 0;
#define CHECK(cond, ...) do { if (!(cond)) { failures++; printf("FAIL %s:%d: ", __FILE__, __LINE__); printf(__VA_ARGS__); printf("\n"); } } while (0)

typedef struct {
  uint8_t *mem;
  uint32_t size;
  long prog_budget;   // bytes that still get programmed; <0 = unlimited
  long erase_budget;  // bytes that still get erased; <0 = unlimited
  int erase_from_end; // a cut erase leaves the start (header) intact instead of the end
  uint32_t erases, progs;
} simflash_t;

static int sim_read(void *ctx, uint32_t addr, uint8_t *buf, uint32_t n) {
  simflash_t *f = (simflash_t *)ctx;
  if (addr + n > f->size) return -1;
  memcpy(buf, f->mem + addr, n);
  return 0;
}
static int sim_prog(void *ctx, uint32_t addr, const uint8_t *buf, uint32_t n) {
  simflash_t *f = (simflash_t *)ctx;
  if (addr + n > f->size) return -1;
  f->progs++;
  for (uint32_t i = 0; i < n; i++) {
    if (f->prog_budget == 0) return -1;  // power gone mid-write
    if (f->prog_budget > 0) f->prog_budget--;
    f->mem[addr + i] &= buf[i];
  }
  return 0;
}
static int sim_erase(void *ctx, uint32_t addr) {
  simflash_t *f = (simflash_t *)ctx;
  if (addr % OPENPAW_FLOG_SECTOR || addr + OPENPAW_FLOG_SECTOR > f->size) return -1;
  f->erases++;
  for (uint32_t k = 0; k < OPENPAW_FLOG_SECTOR; k++) {
    uint32_t i = f->erase_from_end ? OPENPAW_FLOG_SECTOR - 1 - k : k;
    if (f->erase_budget == 0) return -1;
    if (f->erase_budget > 0) f->erase_budget--;
    f->mem[addr + i] = 0xFF;
  }
  return 0;
}

static simflash_t sim_new(uint32_t size, uint8_t fill) {
  simflash_t f; memset(&f, 0, sizeof f);
  f.mem = (uint8_t *)malloc(size); memset(f.mem, fill, size);
  f.size = size; f.prog_budget = -1; f.erase_budget = -1;
  return f;
}
static openpaw_flash_io_t io_for(simflash_t *f) {
  openpaw_flash_io_t io = {sim_read, sim_prog, sim_erase, f, 0, f->size};
  return io;
}
static openpaw_record_t rec(uint32_t seq) {
  openpaw_record_t r; memset(&r, 0, sizeof r);
  r.version = OPENPAW_RECORD_VERSION; r.seq = seq; r.uptime_s = seq * 5;
  r.vedba_mean_mg = (uint16_t)(seq * 7); r.battery_pct = 80;
  return r;
}
static uint32_t seq_at(openpaw_flog_t *L, uint32_t i, int *rc) {
  uint8_t b[OPENPAW_RECORD_SIZE]; openpaw_record_t r; memset(&r, 0, sizeof r);
  *rc = openpaw_flog_get(L, i, b);
  if (*rc == 1) openpaw_decode(b, &r);
  return r.seq;
}
// Every readable record decodes, and seqs strictly increase: never a corrupt dump.
static int dump_ok(openpaw_flog_t *L, uint32_t *n_valid, uint32_t *n_torn) {
  uint32_t last = 0; int first = 1; *n_valid = 0; *n_torn = 0;
  for (uint32_t i = 0; i < L->count; i++) {
    int rc; uint32_t s = seq_at(L, i, &rc);
    if (rc == OPENPAW_FLOG_TORN) { (*n_torn)++; continue; }
    if (rc != 1) return 0;
    if (!first && s <= last) return 0;
    last = s; first = 0; (*n_valid)++;
  }
  return 1;
}

int main(void) {
  // 1. blank chip (never erased, random-ish content) mounts empty and starts at seq 0
  simflash_t f = sim_new(16 * OPENPAW_FLOG_SECTOR, 0xA5);
  openpaw_flash_io_t io = io_for(&f);
  openpaw_flog_t L;
  CHECK(openpaw_flog_mount(&L, io) == 0, "mount blank");
  CHECK(L.count == 0 && L.next_seq == 0, "blank: count %u next_seq %u", L.count, L.next_seq);

  // 2. put + get round trip, in order
  for (uint32_t s = 0; s < 3; s++) { openpaw_record_t r = rec(s); CHECK(openpaw_flog_put(&L, &r) == 0, "put %u", s); }
  CHECK(L.count == 3 && L.next_seq == 3, "after 3 puts: count %u next %u", L.count, L.next_seq);
  int rc;
  CHECK(seq_at(&L, 0, &rc) == 0 && rc == 1, "get 0");
  CHECK(seq_at(&L, 2, &rc) == 2 && rc == 1, "get 2");
  seq_at(&L, 3, &rc); CHECK(rc == 0, "get past end -> 0, got %d", rc);

  // 3. reboot: remount finds the same records and continues the seq after the last one
  openpaw_flog_t L2;
  CHECK(openpaw_flog_mount(&L2, io) == 0, "remount");
  CHECK(L2.count == 3 && L2.next_seq == 3, "remount: count %u next %u", L2.count, L2.next_seq);
  { openpaw_record_t r = rec(L2.next_seq); openpaw_flog_put(&L2, &r); }
  CHECK(seq_at(&L2, 3, &rc) == 3 && rc == 1, "append after remount");

  // 4. wrap: far more records than fit; keeps the newest, drops whole oldest sectors
  simflash_t w = sim_new(4 * OPENPAW_FLOG_SECTOR, 0xFF);
  openpaw_flash_io_t wio = io_for(&w);
  openpaw_flog_t W; openpaw_flog_mount(&W, wio);
  const uint32_t cap = openpaw_flog_capacity(4 * OPENPAW_FLOG_SECTOR);
  CHECK(cap == 3 * OPENPAW_FLOG_SLOTS, "guaranteed capacity = all but the sector being recycled: %u", cap);
  const uint32_t N = 10 * OPENPAW_FLOG_SLOTS + 17;
  for (uint32_t s = 0; s < N; s++) { openpaw_record_t r = rec(s); openpaw_flog_put(&W, &r); }
  CHECK(W.count >= cap && W.count <= cap + OPENPAW_FLOG_SLOTS, "wrapped count %u (cap %u)", W.count, cap);
  CHECK(seq_at(&W, W.count - 1, &rc) == N - 1, "newest kept");
  CHECK(seq_at(&W, 0, &rc) == N - W.count, "oldest = N - count, got %u", seq_at(&W, 0, &rc));
  openpaw_flog_t W2; openpaw_flog_mount(&W2, wio);
  CHECK(W2.count == W.count && W2.next_seq == N, "remount after wrap: count %u/%u next %u", W2.count, W.count, W2.next_seq);
  CHECK(seq_at(&W2, 0, &rc) == N - W.count, "remount oldest");
  uint32_t nv, nt;
  CHECK(dump_ok(&W2, &nv, &nt) && nv == W.count && nt == 0, "wrapped dump clean: %u valid %u torn", nv, nt);

  // 5. find(from_seq): index of the oldest record with seq >= from (what the app's backlog sync asks)
  CHECK(openpaw_flog_find(&W2, 0) == 0, "find below oldest -> 0");
  CHECK(openpaw_flog_find(&W2, N - 5) == W2.count - 5, "find N-5 -> %u", openpaw_flog_find(&W2, N - 5));
  CHECK(openpaw_flog_find(&W2, N + 100) == W2.count, "find past newest -> count");

  // 6. power cut in the middle of writing a record: exactly that one record is lost,
  //    everything before it still reads, and logging carries on after the reboot
  simflash_t p = sim_new(8 * OPENPAW_FLOG_SECTOR, 0xFF);
  openpaw_flash_io_t pio = io_for(&p);
  openpaw_flog_t P; openpaw_flog_mount(&P, pio);
  for (uint32_t s = 0; s < 50; s++) { openpaw_record_t r = rec(s); openpaw_flog_put(&P, &r); }
  p.prog_budget = 9;  // the 51st record gets 9 of its bytes written, then the battery dies
  { openpaw_record_t r = rec(50); CHECK(openpaw_flog_put(&P, &r) != 0, "put reports the failed write"); }
  p.prog_budget = -1;
  openpaw_flog_t P2; openpaw_flog_mount(&P2, pio);
  CHECK(P2.count == 51, "torn slot is counted but skipped: count %u", P2.count);
  CHECK(P2.next_seq == 50, "seq resumes after the last good record: %u", P2.next_seq);
  seq_at(&P2, 50, &rc); CHECK(rc == OPENPAW_FLOG_TORN, "torn slot reads as TORN, got %d", rc);
  CHECK(dump_ok(&P2, &nv, &nt) && nv == 50 && nt == 1, "torn dump: %u valid %u torn", nv, nt);
  { openpaw_record_t r = rec(P2.next_seq); openpaw_flog_put(&P2, &r); }
  CHECK(seq_at(&P2, 51, &rc) == 50 && rc == 1, "logging continues after the torn slot");
  CHECK(openpaw_flog_find(&P2, 50) == 51, "find skips the torn slot: %u", openpaw_flog_find(&P2, 50));

  // 7. power cut while erasing the next sector (both ways a NOR erase can be interrupted)
  for (int from_end = 0; from_end <= 1; from_end++) {
    simflash_t e = sim_new(4 * OPENPAW_FLOG_SECTOR, 0xFF);
    openpaw_flash_io_t eio = io_for(&e);
    openpaw_flog_t E; openpaw_flog_mount(&E, eio);
    const uint32_t M = 4 * OPENPAW_FLOG_SLOTS;  // fills all four sectors once
    for (uint32_t s = 0; s < M; s++) { openpaw_record_t r = rec(s); openpaw_flog_put(&E, &r); }
    e.erase_budget = 1500; e.erase_from_end = from_end;
    { openpaw_record_t r = rec(M); CHECK(openpaw_flog_put(&E, &r) != 0, "put reports the failed erase (%d)", from_end); }
    e.erase_budget = -1;
    openpaw_flog_t E2;
    CHECK(openpaw_flog_mount(&E2, eio) == 0, "mount after cut erase (%d)", from_end);
    CHECK(dump_ok(&E2, &nv, &nt), "no corrupt dump after cut erase (%d)", from_end);
    CHECK(E2.next_seq == M, "seq resumes after cut erase (%d): %u", from_end, E2.next_seq);
    CHECK(nv >= 2 * OPENPAW_FLOG_SLOTS, "cut erase loses at most one sector (%d): %u valid", from_end, nv);
    { openpaw_record_t r = rec(E2.next_seq); CHECK(openpaw_flog_put(&E2, &r) == 0, "put after cut erase (%d)", from_end); }
    int rc2; CHECK(seq_at(&E2, E2.count - 1, &rc2) == M && rc2 == 1, "newest after cut erase (%d)", from_end);
    free(e.mem);
  }

  // 8. sizing: the XIAO's 2 MB chip holds >= 5 days of 5 s epochs
  const uint32_t two_mb = 2u * 1024u * 1024u;
  CHECK((uint64_t)openpaw_flog_capacity(two_mb) * 5u >= 5u * 86400u, "2 MB holds %u records = %.2f days",
        openpaw_flog_capacity(two_mb), openpaw_flog_capacity(two_mb) * 5.0 / 86400.0);
  // and the log never touches anything outside its region
  simflash_t g = sim_new(6 * OPENPAW_FLOG_SECTOR, 0xFF);
  openpaw_flash_io_t gio = io_for(&g); gio.base = OPENPAW_FLOG_SECTOR; gio.size = 4 * OPENPAW_FLOG_SECTOR;
  openpaw_flog_t G; openpaw_flog_mount(&G, gio);
  for (uint32_t s = 0; s < 9 * OPENPAW_FLOG_SLOTS; s++) { openpaw_record_t r = rec(s); openpaw_flog_put(&G, &r); }
  int outside = 0;
  for (uint32_t i = 0; i < OPENPAW_FLOG_SECTOR; i++) outside |= (g.mem[i] != 0xFF) | (g.mem[5 * OPENPAW_FLOG_SECTOR + i] != 0xFF);
  CHECK(!outside, "writes stayed inside [base, base+size)");

  printf("flog: %u records per 4 KB sector, 2 MB = %u records = %.2f days at 5 s\n", OPENPAW_FLOG_SLOTS,
         openpaw_flog_capacity(two_mb), openpaw_flog_capacity(two_mb) * 5.0 / 86400.0);
  free(f.mem); free(w.mem); free(p.mem); free(g.mem);
  if (failures) { printf("%d FAILED\n", failures); return 1; }
  printf("ALL PASS\n");
  return 0;
}
