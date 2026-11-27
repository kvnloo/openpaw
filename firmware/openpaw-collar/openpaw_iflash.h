// OpenPaw internal-flash backend: the same flash log (openpaw_flog.h) on the nRF52840's own
// flash, for boards whose JEDEC probe finds no external chip (the T1000-E may have none).
// Pure C99 so the host tests (firmware/test/test_iflash.c) run the exact code.
//
// Region: whole 4 KB pages just below a board's top (the .ino picks it: the linker's FLASH end
// 0xED000 on S140 v7, where the 28 KB InternalFS / bond area starts; 0xCD000 on the T1000-E,
// whose sketch limit is 128 KB lower), never below the end of the program image. 256 KB =
// 63 x 170 records = 10,710 epochs = 14.9 h at 5 s (the RAM ring keeps 5.7 h and loses
// everything on a reset). A UF2 update rewrites only the image, so the log survives it; a
// serial DFU update can use the free flash as its bank and wipe the log (it then restarts).
//
// The SoftDevice owns the flash controller once BLE is on: sd_flash_write and
// sd_flash_page_erase only queue the job (NRF_ERROR_BUSY while one is pending) and report the
// result later as an event (S140 SoftDevice Specification, "Flash memory API"). Bluefruit's
// SoC task consumes those events for InternalFS, so instead of the event this backend waits by
// reading the flash back until it shows the result, with a timeout. Two source buffers
// alternate, so a job that finishes after its timeout still writes its own bytes: the next job
// cannot start before it (BUSY) and uses the other buffer.
// NVMC rules (nRF52840 PS v1.5, 4.3): 32-bit aligned word writes, at most 2 writes per word
// between erases; the log writes each word once (12-byte headers, 24-byte slots).
// SPDX-License-Identifier: GPL-3.0-only
#ifndef OPENPAW_IFLASH_H
#define OPENPAW_IFLASH_H

#include "openpaw_flog.h"

#ifdef __cplusplus
extern "C" {
#endif

#define OPENPAW_IFLASH_PAGE 4096u
#define OPENPAW_IFLASH_BUSY 1     // write_words / erase_page: another job is still pending
#define OPENPAW_IFLASH_MAX_PROG 32u  // largest prog the log issues is a 24-byte slot

typedef struct {
  // Queue a job: 0 queued (or done, with the SoftDevice off), OPENPAW_IFLASH_BUSY, <0 error.
  // src must stay valid until the job has run.
  int (*write_words)(void *hw, uint32_t addr, const uint32_t *src, uint32_t nwords);
  int (*erase_page)(void *hw, uint32_t page);
  const uint8_t *(*at)(void *hw, uint32_t addr);  // memory-mapped read of an absolute address
  void (*wait_1ms)(void *hw);
  void *hw;
  uint32_t write_timeout_ms, erase_timeout_ms;
  // filled by openpaw_iflash_io
  uint32_t base, size;
  uint32_t buf[2][OPENPAW_IFLASH_MAX_PROG / 4];
  uint32_t next_buf;
} openpaw_iflash_t;

// Pick the log region: up to `want` bytes of whole pages ending at `limit`, starting no lower
// than image_end rounded up to a page. 0 = ok, -1 = fewer than 2 pages fit (use the RAM ring).
static inline int openpaw_iflash_plan(uint32_t image_end, uint32_t limit, uint32_t want, uint32_t *base, uint32_t *size) {
  const uint32_t floor_ = (image_end + OPENPAW_IFLASH_PAGE - 1u) / OPENPAW_IFLASH_PAGE * OPENPAW_IFLASH_PAGE;
  const uint32_t top = limit / OPENPAW_IFLASH_PAGE * OPENPAW_IFLASH_PAGE;
  want = want / OPENPAW_IFLASH_PAGE * OPENPAW_IFLASH_PAGE;
  *base = 0; *size = 0;
  if (top <= floor_ || top - floor_ < 2u * OPENPAW_IFLASH_PAGE || want < 2u * OPENPAW_IFLASH_PAGE) return -1;
  const uint32_t b = top - want > floor_ && top >= want ? top - want : floor_;
  *base = b; *size = top - b;
  return 0;
}

static inline int openpaw__if_inside(const openpaw_iflash_t *d, uint32_t addr, uint32_t n) {
  return addr >= d->base && n <= d->size && addr - d->base <= d->size - n;
}
// Retry while BUSY: a pending job is at most an erase, so wait up to erase + write timeouts.
static inline int openpaw__if_queue(openpaw_iflash_t *d, int is_erase, uint32_t addr, const uint32_t *src, uint32_t nw) {
  uint32_t t = 0;
  for (;;) {
    const int rc = is_erase ? d->erase_page(d->hw, addr / OPENPAW_IFLASH_PAGE) : d->write_words(d->hw, addr, src, nw);
    if (rc != OPENPAW_IFLASH_BUSY) return rc;
    if (t++ >= d->erase_timeout_ms + d->write_timeout_ms) return -1;
    d->wait_1ms(d->hw);
  }
}

static inline int openpaw__if_read(void *ctx, uint32_t addr, uint8_t *buf, uint32_t n) {
  openpaw_iflash_t *d = (openpaw_iflash_t *)ctx;
  if (!openpaw__if_inside(d, addr, n)) return -1;
  memcpy(buf, d->at(d->hw, addr), n);
  return 0;
}
static inline int openpaw__if_prog(void *ctx, uint32_t addr, const uint8_t *buf, uint32_t n) {
  openpaw_iflash_t *d = (openpaw_iflash_t *)ctx;
  if (!openpaw__if_inside(d, addr, n) || addr % 4u || n % 4u || n == 0 || n > OPENPAW_IFLASH_MAX_PROG) return -1;
  uint32_t *src = d->buf[d->next_buf];
  d->next_buf ^= 1u;
  memcpy(src, buf, n);
  uint8_t want[OPENPAW_IFLASH_MAX_PROG];  // NOR: the result is old & new
  const uint8_t *cur = d->at(d->hw, addr);
  for (uint32_t i = 0; i < n; i++) want[i] = (uint8_t)(cur[i] & buf[i]);
  if (openpaw__if_queue(d, 0, addr, src, n / 4u)) return -1;
  for (uint32_t t = 0;; t++) {
    if (memcmp(d->at(d->hw, addr), want, n) == 0) return 0;
    if (t >= d->write_timeout_ms) return -1;
    d->wait_1ms(d->hw);
  }
}
static inline int openpaw__if_erased(const openpaw_iflash_t *d, uint32_t addr) {
  const uint8_t *p = d->at(d->hw, addr);
  for (uint32_t i = 0; i < OPENPAW_IFLASH_PAGE; i++)
    if (p[i] != 0xFF) return 0;
  return 1;
}
static inline int openpaw__if_erase(void *ctx, uint32_t addr) {
  openpaw_iflash_t *d = (openpaw_iflash_t *)ctx;
  if (addr % OPENPAW_IFLASH_PAGE || !openpaw__if_inside(d, addr, OPENPAW_IFLASH_PAGE)) return -1;
  if (openpaw__if_queue(d, 1, addr, 0, 0)) return -1;
  for (uint32_t t = 0;; t++) {
    if (openpaw__if_erased(d, addr)) return 0;
    if (t >= d->erase_timeout_ms) return -1;
    d->wait_1ms(d->hw);
  }
}

// The flog io for region [base, base+size) (from openpaw_iflash_plan). d must outlive the log.
static inline openpaw_flash_io_t openpaw_iflash_io(openpaw_iflash_t *d, uint32_t base, uint32_t size) {
  d->base = base; d->size = size; d->next_buf = 0;
  openpaw_flash_io_t io = {openpaw__if_read, openpaw__if_prog, openpaw__if_erase, d, base, size};
  return io;
}

#ifdef __cplusplus
}
#endif
#endif  // OPENPAW_IFLASH_H
