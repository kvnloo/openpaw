// Host tests for firmware/openpaw-collar/openpaw_iflash.h: the flash log (openpaw_flog.h)
// on the nRF52840's own flash, for boards whose JEDEC probe finds no external chip.
// Build+run: cc -std=c99 -O1 -Wall -Wextra -Werror -o /tmp/ti firmware/test/test_iflash.c -lm && /tmp/ti
//
// The SoftDevice flash API is simulated with the rules from the nRF52840 Product
// Specification v1.5 (NVMC: 4 KB pages, 32-bit word writes, a word may be written at most
// twice between erases, writes can only clear bits) and the S140 SoftDevice Specification
// (sd_flash_write / sd_flash_page_erase only queue the operation; NRF_ERROR_BUSY while one is
// pending; the result arrives later as an event, or never if the radio keeps the timeslot).
// SPDX-License-Identifier: GPL-3.0-only
#include "../openpaw-collar/openpaw_iflash.h"
#include <stdio.h>
#include <stdlib.h>

static int failures = 0;
#define CHECK(cond, ...) do { if (!(cond)) { failures++; printf("FAIL %s:%d: ", __FILE__, __LINE__); printf(__VA_ARGS__); printf("\n"); } } while (0)

#define SIM_BASE 0xAD000u  // the simulated array covers [SIM_BASE, SIM_BASE + size)

typedef struct {
  uint8_t *mem;
  uint32_t size;
  uint8_t *nwrite;        // writes per word since its page was erased
  int pending;            // 0 none, 1 write, 2 erase
  uint32_t p_addr, p_n;   // pending op: address and word count (write) / page (erase)
  const uint32_t *p_src;  // SoftDevice reads the source when the op runs, not when queued
  int p_left;             // ms until the pending op completes
  int latency_ms;         // how long each op takes
  int drop_next;          // the next op never completes (timeslot never granted)
  uint32_t ms, ops, unaligned, over_nwrite, busy_seen;
} simsd_t;

static void sim_run(simsd_t *s) {
  if (s->pending == 1) {
    for (uint32_t w = 0; w < s->p_n; w++) {
      const uint32_t a = s->p_addr + 4 * w - SIM_BASE;
      for (int j = 0; j < 4; j++) s->mem[a + j] &= (uint8_t)(s->p_src[w] >> (8 * j));
      if (++s->nwrite[a / 4] > 2) s->over_nwrite++;
    }
  } else if (s->pending == 2) {
    const uint32_t a = s->p_n * 4096u - SIM_BASE;
    memset(s->mem + a, 0xFF, 4096);
    memset(s->nwrite + a / 4, 0, 1024);
  }
  s->pending = 0;
}
static void sim_wait_1ms(void *hw) {
  simsd_t *s = (simsd_t *)hw;
  s->ms++;
  if (s->pending && s->p_left > 0 && --s->p_left == 0) sim_run(s);
}
static int sim_queue(simsd_t *s, int kind, uint32_t addr, uint32_t n, const uint32_t *src) {
  if (s->pending) { s->busy_seen++; return OPENPAW_IFLASH_BUSY; }
  s->ops++;
  s->pending = kind; s->p_addr = addr; s->p_n = n; s->p_src = src;
  s->p_left = s->drop_next ? -1 : s->latency_ms;
  s->drop_next = 0;
  if (s->p_left == 0) sim_run(s);  // SoftDevice disabled: the operation runs at once
  return 0;
}
static int sim_write_words(void *hw, uint32_t addr, const uint32_t *src, uint32_t nwords) {
  simsd_t *s = (simsd_t *)hw;
  if (addr % 4 || addr < SIM_BASE || addr + 4 * nwords > SIM_BASE + s->size) { s->unaligned++; return -1; }
  return sim_queue(s, 1, addr, nwords, src);
}
static int sim_erase_page(void *hw, uint32_t page) {
  simsd_t *s = (simsd_t *)hw;
  if (page * 4096u < SIM_BASE || page * 4096u + 4096u > SIM_BASE + s->size) return -1;
  return sim_queue(s, 2, 0, page, 0);
}
static const uint8_t *sim_at(void *hw, uint32_t addr) { return ((simsd_t *)hw)->mem + (addr - SIM_BASE); }

static simsd_t sim_new(uint32_t size, int latency_ms) {
  simsd_t s; memset(&s, 0, sizeof s);
  s.mem = (uint8_t *)malloc(size); memset(s.mem, 0xFF, size);
  s.nwrite = (uint8_t *)calloc(size / 4, 1);
  s.size = size; s.latency_ms = latency_ms;
  return s;
}
static void sim_free(simsd_t *s) { free(s->mem); free(s->nwrite); }

static openpaw_iflash_t dev_for(simsd_t *s) {
  openpaw_iflash_t d; memset(&d, 0, sizeof d);
  d.write_words = sim_write_words; d.erase_page = sim_erase_page; d.at = sim_at; d.wait_1ms = sim_wait_1ms;
  d.hw = s; d.write_timeout_ms = 50; d.erase_timeout_ms = 500;
  return d;
}
static openpaw_record_t rec(uint32_t seq) {
  openpaw_record_t r; memset(&r, 0, sizeof r);
  r.version = OPENPAW_RECORD_VERSION; r.seq = seq; r.uptime_s = seq * 5;
  r.vedba_mean_mg = (uint16_t)(seq * 7); r.battery_pct = 80;
  return r;
}
// Every readable record decodes and seqs strictly increase.
static int dump_ok(openpaw_flog_t *L, uint32_t *n_valid, uint32_t *n_torn) {
  uint32_t last = 0; int first = 1; *n_valid = 0; *n_torn = 0;
  for (uint32_t i = 0; i < L->count; i++) {
    uint8_t b[OPENPAW_RECORD_SIZE]; openpaw_record_t r;
    const int rc = openpaw_flog_get(L, i, b);
    if (rc == OPENPAW_FLOG_TORN) { (*n_torn)++; continue; }
    if (rc != 1) return 0;
    openpaw_decode(b, &r);
    if (!first && r.seq <= last) return 0;
    last = r.seq; first = 0; (*n_valid)++;
  }
  return 1;
}

int main(void) {
  // 1. region plan: the log sits below the 28 KB InternalFS/bond area (0xED000, linker FLASH end)
  //    and never overlaps the program image
  uint32_t base = 0, size = 0;
  CHECK(openpaw_iflash_plan(0x52345u, 0xED000u, 256u * 1024u, &base, &size) == 0, "plan fits");
  CHECK(base == 0xED000u - 256u * 1024u && size == 256u * 1024u, "plan 256 KB: base %#x size %u", base, size);
  CHECK(openpaw_iflash_plan(0xC0001u, 0xED000u, 256u * 1024u, &base, &size) == 0, "plan shrinks to fit");
  CHECK(base == 0xC1000u && size == 0xED000u - 0xC1000u, "shrunk: base %#x (image end rounded up to a page) size %u", base, size);
  CHECK(openpaw_iflash_plan(0xEB001u, 0xED000u, 256u * 1024u, &base, &size) != 0, "under 2 pages left -> no log (RAM ring)");
  CHECK(openpaw_iflash_plan(0x52345u, 0xED000u, 256u * 1024u + 100u, &base, &size) == 0 && size % 4096u == 0 &&
        (base % 4096u) == 0, "odd want rounds down to whole pages: base %#x size %u", base, size);
  // T1000-E: top 0xCD000 (sketch limit), image end 0x460EC (this build) -> 256 KB at 0x8D000
  CHECK(openpaw_iflash_plan(0x460ECu, 0xCD000u, 256u * 1024u, &base, &size) == 0 && base == 0x8D000u && size == 256u * 1024u,
        "T1000-E plan: base %#x size %u", base, size);
  // 256 KB = 63 x 170 records = 10,710 = 14.9 h of 5 s epochs (vs 4,096 = 5.7 h in the RAM ring)
  CHECK(openpaw_flog_capacity(256u * 1024u) == 10710u, "256 KB keeps %u records", openpaw_flog_capacity(256u * 1024u));

  // 2. the flash log runs unchanged on the internal-flash io: blank mount, puts, remount
  simsd_t s = sim_new(16 * 4096u, 3);
  openpaw_iflash_t d = dev_for(&s);
  openpaw_flash_io_t io = openpaw_iflash_io(&d, SIM_BASE, s.size);
  openpaw_flog_t L;
  CHECK(openpaw_flog_mount(&L, io) == 0 && L.count == 0 && L.next_seq == 0, "mount blank internal flash");
  for (uint32_t q = 0; q < 3 * OPENPAW_FLOG_SLOTS + 5; q++) { openpaw_record_t r = rec(q); CHECK(openpaw_flog_put(&L, &r) == 0, "put %u", q); }
  openpaw_flog_t L2;
  CHECK(openpaw_flog_mount(&L2, io) == 0 && L2.count == L.count && L2.next_seq == 3 * OPENPAW_FLOG_SLOTS + 5,
        "remount: count %u/%u next %u", L2.count, L.count, L2.next_seq);
  uint32_t nv, nt;
  CHECK(dump_ok(&L2, &nv, &nt) && nv == L.count && nt == 0, "dump clean: %u valid %u torn", nv, nt);
  // NVMC rules held: only whole aligned words, never more than 2 writes per word between erases
  CHECK(s.unaligned == 0 && s.over_nwrite == 0, "word rules: %u unaligned, %u words written > 2 times", s.unaligned, s.over_nwrite);
  CHECK(s.ms > 0, "the io waited for each queued operation to complete (%u ms)", s.ms);

  // 3. wrap on internal flash keeps the newest records
  simsd_t w = sim_new(4 * 4096u, 1);
  openpaw_iflash_t dw = dev_for(&w);
  openpaw_flog_t W; openpaw_flog_mount(&W, openpaw_iflash_io(&dw, SIM_BASE, w.size));
  const uint32_t N = 9 * OPENPAW_FLOG_SLOTS + 11;
  for (uint32_t q = 0; q < N; q++) { openpaw_record_t r = rec(q); openpaw_flog_put(&W, &r); }
  CHECK(dump_ok(&W, &nv, &nt) && nt == 0 && nv >= openpaw_flog_capacity(w.size), "wrapped: %u valid", nv);
  CHECK(w.over_nwrite == 0, "wrap: no word written > 2 times (%u)", w.over_nwrite);

  // 4. an operation the SoftDevice never completes: put reports it, the next put works,
  //    and the log stays readable (that one record is lost, never a corrupt dump)
  s.drop_next = 1;
  { openpaw_record_t r = rec(L2.next_seq); CHECK(openpaw_flog_put(&L2, &r) != 0, "dropped write reported"); }
  s.pending = 0;  // the event never comes; the SoftDevice is idle again
  { openpaw_record_t r = rec(L2.next_seq); CHECK(openpaw_flog_put(&L2, &r) == 0, "next put after a dropped write"); }
  openpaw_flog_t L3; openpaw_flog_mount(&L3, io);
  CHECK(dump_ok(&L3, &nv, &nt) && nt == 1, "after a dropped write: %u valid %u torn", nv, nt);

  // 5. a slow write that completes after the io gave up must still land the right bytes:
  //    the next operation waits behind it (BUSY) and must not have reused its source buffer
  simsd_t v = sim_new(4 * 4096u, 2);
  openpaw_iflash_t dv = dev_for(&v);
  openpaw_flash_io_t vio = openpaw_iflash_io(&dv, SIM_BASE, v.size);
  openpaw_flog_t V; openpaw_flog_mount(&V, vio);
  for (uint32_t q = 0; q < 5; q++) { openpaw_record_t r = rec(q); openpaw_flog_put(&V, &r); }
  v.latency_ms = 200;  // > write_timeout_ms (50)
  { openpaw_record_t r = rec(5); CHECK(openpaw_flog_put(&V, &r) != 0, "slow write reported as failed"); }
  v.latency_ms = 2;
  { openpaw_record_t r = rec(6); CHECK(openpaw_flog_put(&V, &r) == 0, "next put waits behind the slow one"); }
  CHECK(v.busy_seen > 0, "the next op saw BUSY while the slow one ran (%u)", v.busy_seen);
  openpaw_flog_t V2; openpaw_flog_mount(&V2, vio);
  CHECK(dump_ok(&V2, &nv, &nt) && nv == 7 && nt == 0, "late write landed intact, in order: %u valid %u torn", nv, nt);

  // 6. the io refuses anything outside its region (the program image lives just below it)
  {
    uint8_t b[24]; memset(b, 0, sizeof b);
    CHECK(io.prog(io.ctx, SIM_BASE - 24u, b, 24) != 0, "prog below the region refused");
    CHECK(io.prog(io.ctx, SIM_BASE + s.size, b, 24) != 0, "prog above the region refused");
    CHECK(io.erase(io.ctx, SIM_BASE - 4096u) != 0, "erase below the region refused");
    CHECK(io.prog(io.ctx, SIM_BASE + 2u, b, 24) != 0, "unaligned prog refused");
    CHECK(io.prog(io.ctx, SIM_BASE, b, 22) != 0, "prog of a partial word refused");
    uint8_t rb[8];
    CHECK(io.read(io.ctx, SIM_BASE + s.size - 4u, rb, 8) != 0, "read past the region refused");
  }

  printf("iflash: 256 KB below 0xED000 = %u records = %.1f h at 5 s epochs\n", openpaw_flog_capacity(256u * 1024u),
         openpaw_flog_capacity(256u * 1024u) * 5.0 / 3600.0);
  sim_free(&s); sim_free(&w); sim_free(&v);
  if (failures) { printf("%d FAILED\n", failures); return 1; }
  printf("ALL PASS\n");
  return 0;
}
