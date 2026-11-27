// OpenPaw reference collar firmware v0.4.0
//
// Boards (Arduino core "Seeed nRF52 Boards", Seeeduino:nrf52):
//   - Seeed XIAO nRF52840 Sense  (FQBN Seeeduino:nrf52:xiaonRF52840Sense)  IMU LSM6DS3TR-C
//   - Seeed SenseCAP T1000-E     (FQBN Seeeduino:nrf52:tracker_t1000_e_lorawan) IMU QMA6100P
//
// What it does: samples the accelerometer at ~50 Hz, batched in the IMU's own FIFO (XIAO:
// 52 Hz, read once a second; T1000-E: 50 Hz, read every 0.8 s), summarizes every 5 s into a
// 20-byte record (openpaw_core.h), stores records in a power-loss-safe circular
// log on the external flash (openpaw_flog.h; RAM ring if no flash answers),
// streams each record live over BLE, and lets the OpenPaw web app download the backlog.
// Measurements only: no emotion, stress or diagnosis claims.
//
// BLE service (all UUIDs c0de000X-0be4-4f3a-9c1e-6f70656e7061):
//   0001 service
//   0002 live    notify, 20 B record each epoch
//   0003 log     notify, backlog chunks of N*20 B; a record whose version byte is 0xFF ends a dump
//   0004 control write: 0x01 <from_seq u32 LE> start dump | 0x02 stop dump | 0x10 find-me (blink/beep)
//                | 0x20 <unix_s u32 LE> set time: logs a time anchor (openpaw_anchor_t, version byte 2)
//                  in the flash log so epochs from this boot can be dated after a restart; anchors
//                  come back in dumps between the epochs (proto >= 2)
//   0005 status  read/notify 20 B: proto u8, board u8, epoch_s u16, next_seq u32, uptime_s u32, stored u32,
//                boot_seq u32 (first seq of this boot; seq continues across reboots when the flash log is used)
// plus the standard Battery Service (0x180F) and Device Information (0x180A).
//
// SPDX-License-Identifier: GPL-3.0-only
#include <Arduino.h>
#include <Wire.h>
#include <bluefruit.h>
#include "openpaw_core.h"
#include "openpaw_flog.h"
#include "openpaw_iflash.h"

#define OPENPAW_FW_VERSION "0.4.0"
#define OPENPAW_PROTO 2  // 2: set-time (0x20) + time anchors in the log
#define SAMPLE_HZ 50
#define RING_RECORDS 4096  // RAM fallback when no external flash answers: 80 KB = 5.7 h at 5 s epochs

#if defined(ARDUINO_Seeed_XIAO_nRF52840_Sense) || defined(ARDUINO_Seeed_XIAO_nRF52840_Sense_Plus) || defined(PIN_LSM6DS3TR_C_POWER)
#define BOARD_XIAO_SENSE 1
#define BOARD_ID 1
#define IMU_WIRE Wire1
#elif defined(PIN_ACC_POWER_EN)
#define BOARD_T1000E 1
#define BOARD_ID 2
#define IMU_WIRE Wire
#else
#error "Unsupported board: use Seeed XIAO nRF52840 Sense or Seeed T1000-E (Seeed nRF52 Boards core)"
#endif

// ---------------------------------------------------------------- IMU drivers
static bool i2c_write(uint8_t addr, uint8_t reg, uint8_t val) {
  IMU_WIRE.beginTransmission(addr);
  IMU_WIRE.write(reg);
  IMU_WIRE.write(val);
  return IMU_WIRE.endTransmission() == 0;
}
static bool i2c_read(uint8_t addr, uint8_t reg, uint8_t *buf, uint8_t n) {
  IMU_WIRE.beginTransmission(addr);
  IMU_WIRE.write(reg);
  if (IMU_WIRE.endTransmission(false) != 0) return false;
  if (IMU_WIRE.requestFrom(addr, n) != n) return false;
  for (uint8_t i = 0; i < n; i++) buf[i] = IMU_WIRE.read();
  return true;
}

#if BOARD_XIAO_SENSE
// LSM6DS3TR-C: 52 Hz, +/-8 g, gyro off. 0.244 mg/LSB at +/-8 g (datasheet table 3).
// Samples are batched in the IMU's FIFO and read about once a second (openpaw_core.h),
// so the epoch is counted in the IMU's own 52 Hz / 12.5 Hz samples.
#define LSM_ADDR 0x6A
#define IMU_HAS_FIFO 1
#define IMU_FULL_HZ 52.0f
#define IMU_LOW_HZ 12.5f
#define FIFO_CHUNK 10  // samples per I2C burst: 60 B fits the Wire buffer
static bool g_fifo_drop_first = false;
static void imu_fifo_restart(bool low) {  // bypass empties the FIFO, then continuous at the new rate
  i2c_write(LSM_ADDR, 0x0A, 0x00);
  i2c_write(LSM_ADDR, 0x08, OPENPAW_LSM_FIFO_CTRL3);
  i2c_write(LSM_ADDR, 0x0A, openpaw_lsm_fifo_ctrl5(low ? IMU_LOW_HZ : IMU_FULL_HZ));
  g_fifo_drop_first = true;  // datasheet 5.5: discard the first sample after entering a FIFO mode
}
static bool imu_begin() {
  pinMode(PIN_LSM6DS3TR_C_POWER, OUTPUT);
  digitalWrite(PIN_LSM6DS3TR_C_POWER, HIGH);
  delay(20);
  IMU_WIRE.begin();
  IMU_WIRE.setClock(OPENPAW_I2C_HZ);  // after begin(): begin() resets the bus to 100 kHz
  uint8_t who = 0;
  if (!i2c_read(LSM_ADDR, 0x0F, &who, 1) || who != 0x6A) return false;
  i2c_write(LSM_ADDR, 0x12, 0x44);  // CTRL3_C: BDU=1, IF_INC=1
  i2c_write(LSM_ADDR, 0x11, 0x00);  // CTRL2_G: gyro power-down
  i2c_write(LSM_ADDR, 0x10, 0x3C);  // CTRL1_XL: ODR 52 Hz, FS +/-8 g
  i2c_write(LSM_ADDR, 0x15, 0x10);  // CTRL6_C: XL_HM_MODE=1 (low-power accel at 52 Hz)
  imu_fifo_restart(false);
  return true;
}
// Still mode: ODR 12.5 Hz low-power (9 uA vs 25 uA at 52 Hz, ST AN5130 table 7), FS +/-8 g kept.
static void imu_set_low_rate(bool low) {
  i2c_write(LSM_ADDR, 0x10, low ? 0x1C : 0x3C);
  imu_fifo_restart(low);
}
// Read up to max queued samples (mg, xyz interleaved). false on an I2C error.
static bool imu_fifo_read(int16_t *xyz, uint16_t max, uint16_t *n, bool *overrun) {
  uint8_t st[4], b[6 * FIFO_CHUNK];
  *n = 0; *overrun = false;
  if (!i2c_read(LSM_ADDR, 0x3A, st, 4)) return false;  // FIFO_STATUS1..4
  openpaw_fifo_plan_t p = openpaw_lsm_fifo_plan(st);
  *overrun = p.overrun;
  if (p.skip_words && !i2c_read(LSM_ADDR, 0x3E, b, (uint8_t)(2 * p.skip_words))) return false;
  uint16_t want = p.samples < max ? p.samples : max;
  while (*n < want) {
    uint8_t k = (uint8_t)((want - *n) < FIFO_CHUNK ? (want - *n) : FIFO_CHUNK);
    if (!i2c_read(LSM_ADDR, 0x3E, b, (uint8_t)(6 * k))) return false;
    for (uint8_t i = 0; i < k; i++) {
      if (g_fifo_drop_first) { g_fifo_drop_first = false; want--; continue; }
      int16_t *o = xyz + 3 * (*n)++;
      openpaw_lsm_xyz_mg(b + 6 * i, o, o + 1, o + 2);
    }
  }
  return true;
}
#endif

#if BOARD_T1000E
// QMA6100P: init sequence from Seeed's Tracker_T1000_E_LoRaWAN_Examples driver (MIT),
// +/-8 g, 0.977 mg/LSB, 14-bit left-aligned. Samples are batched in its 64-frame FIFO
// (STREAM mode, openpaw_core.h) and read every 0.8 s, so epochs count the sensor's own
// 50 Hz / 12.5 Hz samples. Not yet run on hardware.
#define QMA_ADDR 0x12
#define IMU_HAS_FIFO 1
#define IMU_FULL_HZ 50.0f
#define IMU_LOW_HZ 12.5f
#define IMU_FIFO_READ_MS OPENPAW_QMA_FIFO_READ_MS
#define FIFO_CHUNK 10  // frames per I2C burst: 60 B fits the Wire buffer
// Still mode runs the sensor at MCLK 12.8 kHz (10 uA instead of 38 uA) if a rate check over
// its first 4 s agrees; otherwise 51.2 kHz + ODR code 7 for the rest of the boot
// (openpaw_qma_clock / openpaw_rate_check_* in openpaw_core.h).
static bool g_qma_slow_ok = true, g_qma_low = false;
static openpaw_rate_check_t g_qma_rate;
static uint32_t g_qma_last_ms = 0;
// Clock, then ODR, then FIFO_CFG0: writing 3Eh empties the FIFO, so no old-rate frame is left.
static void imu_fifo_restart(bool low) {
  openpaw_qma_clock_t c = openpaw_qma_clock(low, g_qma_slow_ok);
  i2c_write(QMA_ADDR, 0x11, c.pm);
  i2c_write(QMA_ADDR, 0x10, c.odr);
  i2c_write(QMA_ADDR, 0x3E, OPENPAW_QMA_FIFO_CFG0);
  g_qma_low = low;
  openpaw_rate_check_start(&g_qma_rate, low ? IMU_LOW_HZ : IMU_FULL_HZ);
  g_qma_last_ms = millis();
}
static bool imu_begin() {
  pinMode(PIN_ACC_POWER_EN, OUTPUT);
  digitalWrite(PIN_ACC_POWER_EN, HIGH);
  delay(20);
  IMU_WIRE.begin();
  IMU_WIRE.setClock(OPENPAW_I2C_HZ);  // after begin(): begin() resets the bus to 100 kHz
  i2c_write(QMA_ADDR, 0x36, 0xB6); delay(5);
  i2c_write(QMA_ADDR, 0x36, 0x00); delay(10);
  uint8_t id = 0;
  if (!i2c_read(QMA_ADDR, 0x00, &id, 1) || id != 0x90) return false;
  i2c_write(QMA_ADDR, 0x11, 0x80);
  i2c_write(QMA_ADDR, 0x11, 0x84);
  i2c_write(QMA_ADDR, 0x4A, 0x20);
  i2c_write(QMA_ADDR, 0x56, 0x01);
  i2c_write(QMA_ADDR, 0x5F, 0x80); delay(2);
  i2c_write(QMA_ADDR, 0x5F, 0x00); delay(10);
  i2c_write(QMA_ADDR, 0x0F, 0x04);  // range +/-8 g
  imu_fifo_restart(false);
  return true;
}
// QMA6100P current depends on its master clock, not the ODR (QST datasheet Rev F table 2),
// so still mode lowers the clock as well as the rate (see imu_fifo_restart).
static void imu_set_low_rate(bool low) { imu_fifo_restart(low); }
// Read up to max queued frames (mg, xyz interleaved). false on an I2C error.
static bool qma_fifo_drain(int16_t *xyz, uint16_t max, uint16_t *n, bool *overrun) {
  uint8_t st[4], b[6 * FIFO_CHUNK];
  *n = 0; *overrun = false;
  if (!i2c_read(QMA_ADDR, 0x0B, st, 4)) return false;  // INT_STATUS_2 (FIFO_OR) .. FIFO_STATUS
  openpaw_fifo_plan_t p = openpaw_qma_fifo_plan(st);
  *overrun = p.overrun;
  uint16_t want = p.samples < max ? p.samples : max;
  while (*n < want) {
    uint8_t k = (uint8_t)((want - *n) < FIFO_CHUNK ? (want - *n) : FIFO_CHUNK);
    if (!i2c_read(QMA_ADDR, 0x3F, b, (uint8_t)(6 * k))) return false;
    for (uint8_t i = 0; i < k; i++) {
      int16_t *o = xyz + 3 * (*n);
      if (!openpaw_qma_frame_mg(b + 6 * i, o, o + 1, o + 2)) return true;  // ran dry: keep what we have
      (*n)++;
    }
  }
  return true;
}
static bool imu_fifo_read(int16_t *xyz, uint16_t max, uint16_t *n, bool *overrun) {
  if (!qma_fifo_drain(xyz, max, n, overrun)) return false;
  uint32_t now = millis();
  if (g_qma_low && g_qma_slow_ok && openpaw_rate_check_feed(&g_qma_rate, *n, now - g_qma_last_ms) < 0) {
    g_qma_slow_ok = false;  // the slow clock did not give 12.5 Hz: back to 51.2 kHz until reboot
    Serial.println("qma_clock=fallback");
    imu_fifo_restart(true);
    return true;
  }
  g_qma_last_ms = now;
  return true;
}
#endif
#ifndef IMU_FIFO_READ_MS
#define IMU_FIFO_READ_MS OPENPAW_FIFO_READ_MS
#endif
#if !IMU_HAS_FIFO
#error "the main loop drains the IMU FIFO: every board needs imu_fifo_read()"
#endif

// ---------------------------------------------------------------- battery
static uint8_t lipo_pct(float v) {  // rough single-cell LiPo resting curve
  const float pts[][2] = {{4.20f, 100}, {4.00f, 85}, {3.85f, 65}, {3.75f, 45}, {3.70f, 30}, {3.60f, 12}, {3.40f, 3}, {3.20f, 0}};
  if (v >= pts[0][0]) return 100;
  for (int i = 1; i < 8; i++)
    if (v >= pts[i][0]) {
      float f = (v - pts[i][0]) / (pts[i - 1][0] - pts[i][0]);
      return (uint8_t)(pts[i][1] + f * (pts[i - 1][1] - pts[i][1]) + 0.5f);
    }
  return 0;
}
static uint8_t battery_read_pct() {
  analogReadResolution(12);
  uint32_t raw = 0;
#if BOARD_XIAO_SENSE
  // XIAO nRF52840: VBAT through 1M/510k divider on PIN_VBAT, enabled by VBAT_ENABLE low.
  pinMode(VBAT_ENABLE, OUTPUT);
  digitalWrite(VBAT_ENABLE, LOW);
  for (int i = 0; i < 4; i++) raw += analogRead(PIN_VBAT);
  uint16_t mv = openpaw_vbat_mv(raw, 4, 12, 3600, 1510, 510);
#else
  // T1000-E: VBAT through a 100k/100k divider (x2) on A0 = P0.02, 3.0 V reference.
  // Sources: Seeed T1000-E LoRaWAN dev-board sensor.c (bat_v * 2), Meshtastic
  // tracker-t1000-e variant.h (ADC_MULTIPLIER 2.0, AR_INTERNAL_3_0), SoftRF (100K + 100K).
  analogReference(AR_INTERNAL_3_0);
  for (int i = 0; i < 4; i++) raw += analogRead(BAT_ANALOG_INPUT);
  analogReference(AR_DEFAULT);
  uint16_t mv = openpaw_vbat_mv(raw, 4, 12, 3000, 2000, 1000);
#endif
  if (mv < 2500) return 255;  // no battery attached (USB only)
  return lipo_pct(mv / 1000.0f);
}

// ---------------------------------------------------------------- storage probe
// Ask the external NOR flash for its JEDEC ID (0x9F) with a bit-banged SPI read
// on the QSPI pins, so no flash library is needed and an absent chip just reads
// FF/00. The result picks QSPI vs internal-flash logging (openpaw_flash_identify).
#if BOARD_T1000E
// Seeed's T1000-E variant.h sets PIN_QSPI_IO3 to 33, but its own variant.cpp and
// the Seeed wiki pin table put QSPI IO3 on P1.00 = pin 32 (33 is P1.01, LR1110
// DIO9). The flash also has a power switch, "Flash Enable" P1.13 = pin 45, that
// variant.h does not define (Seeed wiki pin table; SoftRF drives it HIGH).
#define FLASH_SCK 19
#define FLASH_CS 20
#define FLASH_MOSI 21
#define FLASH_MISO 22
#define FLASH_WP 23
#define FLASH_HOLD 32
#define FLASH_POWER_EN 45
#else
#define FLASH_SCK PIN_QSPI_SCK
#define FLASH_CS PIN_QSPI_CS
#define FLASH_MOSI PIN_QSPI_IO0
#define FLASH_MISO PIN_QSPI_IO1
#define FLASH_WP PIN_QSPI_IO2
#define FLASH_HOLD PIN_QSPI_IO3
#endif
static uint8_t g_flash_id[3] = {0xFF, 0xFF, 0xFF};
static openpaw_flash_t g_flash;
static char g_flash_line[40];

static uint8_t flash_xfer(uint8_t out) {
  uint8_t in = 0;
  for (int i = 7; i >= 0; i--) {  // SPI mode 0, MSB first
    digitalWrite(FLASH_MOSI, (out >> i) & 1);
    delayMicroseconds(1);
    digitalWrite(FLASH_SCK, HIGH);
    in = (uint8_t)((in << 1) | (digitalRead(FLASH_MISO) ? 1 : 0));
    delayMicroseconds(1);
    digitalWrite(FLASH_SCK, LOW);
  }
  return in;
}
static void flash_probe() {
#ifdef FLASH_POWER_EN
  pinMode(FLASH_POWER_EN, OUTPUT);
  digitalWrite(FLASH_POWER_EN, HIGH);
  delay(5);  // NOR flash power-up time (tVSL) is well under 5 ms
#endif
  pinMode(FLASH_CS, OUTPUT); digitalWrite(FLASH_CS, HIGH);
  pinMode(FLASH_SCK, OUTPUT); digitalWrite(FLASH_SCK, LOW);
  pinMode(FLASH_MOSI, OUTPUT);
  pinMode(FLASH_WP, OUTPUT); digitalWrite(FLASH_WP, HIGH);
  pinMode(FLASH_HOLD, OUTPUT); digitalWrite(FLASH_HOLD, HIGH);  // HOLD# low would freeze the bus
  pinMode(FLASH_MISO, INPUT_PULLUP);  // nothing there -> FF
  delayMicroseconds(50);
  digitalWrite(FLASH_CS, LOW);
  flash_xfer(0xAB);  // release from deep power-down, in case a bootloader left it asleep
  digitalWrite(FLASH_CS, HIGH); delayMicroseconds(50);
  digitalWrite(FLASH_CS, LOW);
  flash_xfer(0x9F);
  for (int i = 0; i < 3; i++) g_flash_id[i] = flash_xfer(0x00);
  digitalWrite(FLASH_CS, HIGH);
  pinMode(FLASH_MISO, INPUT);
  openpaw_flash_identify(g_flash_id, &g_flash);
  openpaw_flash_describe(g_flash_id, &g_flash, g_flash_line, sizeof g_flash_line);
}

// Standard SPI NOR commands (P25Q16H / GD25Q64 datasheets): 0x03 read, 0x06 write
// enable, 0x02 page program (max 256 B, must not cross a page), 0x20 4 KB sector
// erase, 0x05 status (bit 0 = busy). Bit-banged on the same pins as the probe:
// one 24-byte record every 5 s needs no QSPI peripheral.
static void flash_cmd_addr(uint8_t cmd, uint32_t addr) {
  flash_xfer(cmd);
  flash_xfer((uint8_t)(addr >> 16)); flash_xfer((uint8_t)(addr >> 8)); flash_xfer((uint8_t)addr);
}
static int flash_wait(uint32_t timeout_ms) {
  uint32_t t0 = millis();
  for (;;) {
    digitalWrite(FLASH_CS, LOW);
    flash_xfer(0x05);
    uint8_t sr = flash_xfer(0x00);
    digitalWrite(FLASH_CS, HIGH);
    if (!(sr & 1)) return 0;
    if (millis() - t0 > timeout_ms) return -1;
    if (timeout_ms > 10) delay(1);
  }
}
static void flash_wren() { digitalWrite(FLASH_CS, LOW); flash_xfer(0x06); digitalWrite(FLASH_CS, HIGH); }
static int fl_read(void *, uint32_t addr, uint8_t *buf, uint32_t n) {
  digitalWrite(FLASH_CS, LOW);
  flash_cmd_addr(0x03, addr);
  for (uint32_t i = 0; i < n; i++) buf[i] = flash_xfer(0x00);
  digitalWrite(FLASH_CS, HIGH);
  return 0;
}
static int fl_prog(void *, uint32_t addr, const uint8_t *buf, uint32_t n) {
  while (n) {
    uint32_t room = 256 - (addr & 255), k = n < room ? n : room;
    flash_wren();
    digitalWrite(FLASH_CS, LOW);
    flash_cmd_addr(0x02, addr);
    for (uint32_t i = 0; i < k; i++) flash_xfer(buf[i]);
    digitalWrite(FLASH_CS, HIGH);
    if (flash_wait(10)) return -1;  // page program max is a few ms
    addr += k; buf += k; n -= k;
  }
  return 0;
}
static int fl_erase(void *, uint32_t addr) {
  flash_wren();
  digitalWrite(FLASH_CS, LOW);
  flash_cmd_addr(0x20, addr);
  digitalWrite(FLASH_CS, HIGH);
  return flash_wait(1000);  // 4 KB erase: tens of ms typical, < 1 s worst case
}
static void flash_bus_begin() {  // probe left MISO without pull-up; everything else is still set up
  pinMode(FLASH_MISO, INPUT_PULLUP);
  digitalWrite(FLASH_CS, HIGH);
}

// ---------------------------------------------------------------- BLE
// 128-bit UUIDs, little-endian byte order for Bluefruit.
#define OP_UUID(n) {0x61, 0x70, 0x6e, 0x65, 0x70, 0x6f, 0x1e, 0x9c, 0x3a, 0x4f, 0xe4, 0x0b, (n), 0x00, 0xde, 0xc0}
static const uint8_t UUID_SVC[16] = OP_UUID(0x01);
static const uint8_t UUID_LIVE[16] = OP_UUID(0x02);
static const uint8_t UUID_LOG[16] = OP_UUID(0x03);
static const uint8_t UUID_CTRL[16] = OP_UUID(0x04);
static const uint8_t UUID_STATUS[16] = OP_UUID(0x05);

BLEService svc(UUID_SVC);
BLECharacteristic chrLive(UUID_LIVE), chrLog(UUID_LOG), chrCtrl(UUID_CTRL), chrStatus(UUID_STATUS);
BLEBas bas;
BLEDis dis;

static openpaw_state_t g_core;
static uint8_t g_ring_store[RING_RECORDS * OPENPAW_RECORD_SIZE];
static openpaw_ring_t g_ring;
static openpaw_flog_t g_flog;
static bool g_use_flog = false;
static bool g_log_internal = false;  // g_flog lives on the nRF52840's own flash (openpaw_iflash.h)
static uint32_t g_boot_seq = 0;

// ---------------------------------------------------------------- internal-flash log
// When no external chip answers, the same flash log goes on the nRF52840's own flash:
// up to IFLASH_LOG_BYTES of whole pages ending at IFLASH_TOP, never over the program image
// (__etext + .data load image). XIAO: the linker's FLASH end (0xED000, where InternalFS/bonds
// start). T1000-E: Seeed's boards.txt caps sketches at 679,936 B from 0x27000 = 0xCD000 (128 KB
// less than the XIAO; the reason isn't documented), so the log stays below that too.
#define IFLASH_LOG_BYTES (256u * 1024u)  // 10,710 records = 14.9 h at 5 s epochs
extern "C" uint32_t __etext[], __data_start__[], __data_end__[], __flash_arduino_end[];
#if BOARD_T1000E
#define IFLASH_TOP 0xCD000u
#else
#define IFLASH_TOP ((uint32_t)(uintptr_t)__flash_arduino_end)
#endif
static int ifl_write_words(void *hw, uint32_t addr, const uint32_t *src, uint32_t nwords) {
  (void)hw;
  const uint32_t err = sd_flash_write((uint32_t *)addr, src, nwords);  // runs at once while the SoftDevice is off
  return err == NRF_SUCCESS ? 0 : err == NRF_ERROR_BUSY ? OPENPAW_IFLASH_BUSY : -1;
}
static int ifl_erase_page(void *hw, uint32_t page) {
  (void)hw;
  const uint32_t err = sd_flash_page_erase(page);
  return err == NRF_SUCCESS ? 0 : err == NRF_ERROR_BUSY ? OPENPAW_IFLASH_BUSY : -1;
}
static const uint8_t *ifl_at(void *hw, uint32_t addr) { (void)hw; return (const uint8_t *)(uintptr_t)addr; }
static void ifl_wait_1ms(void *hw) { (void)hw; delay(1); }
// Event-free waits (read-back) because Bluefruit hands flash events to InternalFS. Caveat:
// our completions also release InternalFS's counting semaphore; OpenPaw never bonds, so
// InternalFS only writes inside Bluefruit.begin(), before the first log write.
static openpaw_iflash_t g_ifl = {ifl_write_words, ifl_erase_page, ifl_at, ifl_wait_1ms, nullptr, 50, 400, 0, 0, {{0}}, 0};

static const char *log_kind_name() {
  return g_log_internal ? "internal" : g_use_flog ? "flash" : "ram";
}

// One log interface over the flash log (external chip or internal flash) or the RAM ring.
static void log_begin() {
  uint32_t gen;
  if (g_flash.kind == OPENPAW_STORE_QSPI) {
    flash_bus_begin();
    openpaw_flash_io_t io = {fl_read, fl_prog, fl_erase, nullptr, 0, g_flash.size_bytes};
    // the header read-back catches a write-protected or flaky chip: then stay on RAM
    g_use_flog = openpaw_flog_mount(&g_flog, io) == 0 && openpaw__hdr(&g_flog, g_flog.head, &gen);
  } else {
    const uint32_t image_end = (uint32_t)(uintptr_t)__etext + (uint32_t)((uintptr_t)__data_end__ - (uintptr_t)__data_start__);
    uint32_t base, size;
    const uint32_t top = IFLASH_TOP < (uint32_t)(uintptr_t)__flash_arduino_end ? IFLASH_TOP : (uint32_t)(uintptr_t)__flash_arduino_end;
    if (openpaw_iflash_plan(image_end, top, IFLASH_LOG_BYTES, &base, &size) == 0) {
      openpaw_flash_io_t io = openpaw_iflash_io(&g_ifl, base, size);
      g_use_flog = openpaw_flog_mount(&g_flog, io) == 0 && openpaw__hdr(&g_flog, g_flog.head, &gen);
      g_log_internal = g_use_flog;
    }
  }
  if (g_use_flog) g_core.seq = g_flog.next_seq;  // seq keeps counting across reboots
  g_boot_seq = g_core.seq;
}
static void log_put(const openpaw_record_t *r) {
  if (g_use_flog) openpaw_flog_put(&g_flog, r);  // a failed write loses that one record only
  else openpaw_ring_put(&g_ring, r);
}
static uint32_t log_count() { return g_use_flog ? g_flog.count : g_ring.count; }
static int log_get(uint32_t i, uint8_t out[OPENPAW_RECORD_SIZE]) {  // 1 ok, 0 end, -1 lost record
  return g_use_flog ? openpaw_flog_get(&g_flog, i, out) : openpaw_ring_get(&g_ring, i, out);
}
static uint32_t log_find(uint32_t from_seq) {
  return g_use_flog ? openpaw_flog_find(&g_flog, from_seq) : openpaw_ring_find(&g_ring, from_seq);
}

static volatile bool g_dump_req = false, g_dump_stop = false;
static volatile uint32_t g_dump_from = 0;
static volatile bool g_find_me = false;
static volatile bool g_time_req = false;
static volatile uint32_t g_time_unix = 0;
static uint32_t g_dump_idx = 0;
static bool g_dumping = false;
static uint16_t g_conn = BLE_CONN_HANDLE_INVALID;
static uint8_t g_batt = 255;
static uint32_t g_imu_errors = 0;
static openpaw_power_t g_pwr;          // still mode: 10 Hz after 5 min still with no phone (openpaw_core.h)
static float g_rate_hz = SAMPLE_HZ;

static void ctrl_write_cb(uint16_t conn, BLECharacteristic *chr, uint8_t *data, uint16_t len) {
  (void)conn; (void)chr;
  if (len < 1) return;
  if (data[0] == 0x01 && len >= 5) {
    g_dump_from = (uint32_t)data[1] | ((uint32_t)data[2] << 8) | ((uint32_t)data[3] << 16) | ((uint32_t)data[4] << 24);
    g_dump_req = true;
  } else if (data[0] == 0x02) {
    g_dump_stop = true;
  } else if (data[0] == 0x10) {
    g_find_me = true;
  } else if (data[0] == 0x20 && len >= 5) {  // flash is written from loop(), not the BLE callback
    g_time_unix = (uint32_t)data[1] | ((uint32_t)data[2] << 8) | ((uint32_t)data[3] << 16) | ((uint32_t)data[4] << 24);
    g_time_req = true;
  }
}
static void connect_cb(uint16_t conn) {
  g_conn = conn;
  BLEConnection *c = Bluefruit.Connection(conn);
  c->requestMtuExchange(247);
  // connection interval: loop() asks via openpaw_link_step (15 ms for dumps, 200 ms when idle)
}

static openpaw_link_t g_link;  // fast/slow connection interval state (openpaw_core.h)

static void link_update(uint32_t now) {
  uint16_t want = openpaw_link_step(&g_link, g_conn != BLE_CONN_HANDLE_INVALID, g_dumping, now);
  if (!want) return;
  BLEConnection *c = Bluefruit.Connection(g_conn);
  if (!c) return;
  if (want == OPENPAW_LINK_FAST) c->requestConnectionParameter(OPENPAW_LINK_FAST, 0, OPENPAW_LINK_TIMEOUT_10MS);
  else c->requestConnectionParameter(OPENPAW_LINK_SLOW, OPENPAW_LINK_SLOW_LATENCY, OPENPAW_LINK_TIMEOUT_10MS);
}
static openpaw_adv_t g_adv;  // normal (100 ms then 1 s) or parked (2 s) advertising (openpaw_core.h)

static void adv_update(uint32_t now) {
  uint16_t want = openpaw_adv_step(&g_adv, g_conn != BLE_CONN_HANDLE_INVALID, now);
  if (want == OPENPAW_ADV_PARKED) {  // nobody connected for 10 min: restart at 2 s, no fast burst
    if (Bluefruit.Advertising.isRunning()) Bluefruit.Advertising.stop();
    Bluefruit.Advertising.setInterval(OPENPAW_ADV_PARKED, OPENPAW_ADV_PARKED);
    Bluefruit.Advertising.start(0);
  } else if (want == OPENPAW_ADV_SLOW) {  // connected: advertising is off; restartOnDisconnect uses these
    Bluefruit.Advertising.setInterval(OPENPAW_ADV_FAST, OPENPAW_ADV_SLOW);
  }
}
static void disconnect_cb(uint16_t conn, uint8_t reason) {
  (void)conn; (void)reason;
  g_conn = BLE_CONN_HANDLE_INVALID;
  g_dumping = false;
}

static void status_update(uint32_t uptime_s) {
  uint8_t b[20];
  b[0] = OPENPAW_PROTO;
  b[1] = BOARD_ID;
  b[2] = g_core.cfg.epoch_s & 0xFF; b[3] = g_core.cfg.epoch_s >> 8;
  uint32_t v[4] = {g_core.seq, uptime_s, log_count(), g_boot_seq};
  for (int k = 0; k < 4; k++)
    for (int j = 0; j < 4; j++) b[4 + 4 * k + j] = (uint8_t)(v[k] >> (8 * j));
  chrStatus.write(b, sizeof b);
  if (g_conn != BLE_CONN_HANDLE_INVALID && chrStatus.notifyEnabled(g_conn)) chrStatus.notify(b, sizeof b);
}

static void ble_begin() {
  Bluefruit.configPrphBandwidth(BANDWIDTH_MAX);
  Bluefruit.begin();
  Bluefruit.setTxPower(0);
  Bluefruit.autoConnLed(false);
  uint8_t mac[6];
  Bluefruit.getAddr(mac);
  char name[20];
  snprintf(name, sizeof name, "OpenPaw-%02X%02X", mac[1], mac[0]);
  Bluefruit.setName(name);
  Bluefruit.Periph.setConnectCallback(connect_cb);
  Bluefruit.Periph.setDisconnectCallback(disconnect_cb);

  dis.setManufacturer("OpenPaw (open hardware)");
  dis.setModel(BOARD_ID == 1 ? "XIAO nRF52840 Sense" : "SenseCAP T1000-E");
  dis.setFirmwareRev(OPENPAW_FW_VERSION);
  dis.setHardwareRev(g_flash_line);  // storage found at boot, e.g. "flash P25Q16H 2048KB (856015)"
  dis.begin();
  bas.begin();

  svc.begin();
  chrLive.setProperties(CHR_PROPS_NOTIFY | CHR_PROPS_READ);
  chrLive.setPermission(SECMODE_OPEN, SECMODE_NO_ACCESS);
  chrLive.setFixedLen(OPENPAW_RECORD_SIZE);
  chrLive.begin();
  chrLog.setProperties(CHR_PROPS_NOTIFY);
  chrLog.setPermission(SECMODE_OPEN, SECMODE_NO_ACCESS);
  chrLog.setMaxLen(240);
  chrLog.begin();
  chrCtrl.setProperties(CHR_PROPS_WRITE | CHR_PROPS_WRITE_WO_RESP);
  chrCtrl.setPermission(SECMODE_NO_ACCESS, SECMODE_OPEN);
  chrCtrl.setMaxLen(8);
  chrCtrl.setWriteCallback(ctrl_write_cb);
  chrCtrl.begin();
  chrStatus.setProperties(CHR_PROPS_READ | CHR_PROPS_NOTIFY);
  chrStatus.setPermission(SECMODE_OPEN, SECMODE_NO_ACCESS);
  chrStatus.setFixedLen(20);
  chrStatus.begin();

  Bluefruit.Advertising.addFlags(BLE_GAP_ADV_FLAGS_LE_ONLY_GENERAL_DISC_MODE);
  Bluefruit.Advertising.addService(svc);
  Bluefruit.ScanResponse.addName();
  Bluefruit.Advertising.restartOnDisconnect(true);
  Bluefruit.Advertising.setInterval(OPENPAW_ADV_FAST, OPENPAW_ADV_SLOW);  // 100 ms for 30 s, then 1 s; loop() parks at 2 s
  Bluefruit.Advertising.setFastTimeout(30);
  Bluefruit.Advertising.start(0);
}

// Send as many backlog records as fit in one notification; returns false when done.
static bool dump_step() {
  BLEConnection *c = Bluefruit.Connection(g_conn);
  uint16_t mtu = c ? c->getMtu() : 23;
  uint16_t per = (mtu - 3) / OPENPAW_RECORD_SIZE;
  if (per < 1) per = 1;
  if (per > 12) per = 12;
  uint8_t buf[12 * OPENPAW_RECORD_SIZE];
  uint16_t n = 0;
  uint32_t idx = g_dump_idx;
  while (n < per && idx < log_count()) {
    if (log_get(idx++, buf + n * OPENPAW_RECORD_SIZE) == 1) n++;  // lost (power-cut) records are skipped
  }
  if (n == 0) {
    memset(buf, 0xFF, OPENPAW_RECORD_SIZE);  // end-of-dump marker
    chrLog.notify(buf, OPENPAW_RECORD_SIZE);
    return false;
  }
  if (chrLog.notify(buf, n * OPENPAW_RECORD_SIZE)) g_dump_idx = idx;  // else: TX queue full, retry next loop
  return true;
}

static void led(bool on) {
#if BOARD_XIAO_SENSE
  digitalWrite(LED_GREEN, on ? LOW : HIGH);  // XIAO LEDs are active-low
#else
  digitalWrite(LED_GREEN, on ? HIGH : LOW);
#endif
}

static void find_me() {
#if BOARD_T1000E
  pinMode(PIN_BUZZER_EN, OUTPUT);
  digitalWrite(PIN_BUZZER_EN, HIGH);
  for (int i = 0; i < 3; i++) { tone(PIN_BUZZER_PWM, 2700, 150); led(true); delay(250); led(false); delay(100); }
  digitalWrite(PIN_BUZZER_EN, LOW);
#else
  for (int i = 0; i < 6; i++) { led(true); delay(150); led(false); delay(150); }
#endif
}

// ---------------------------------------------------------------- main
void setup() {
  pinMode(LED_GREEN, OUTPUT);
  led(false);
  Serial.begin(115200);
  openpaw_cfg_t cfg = openpaw_default_cfg();
  cfg.sample_hz = IMU_FULL_HZ;  // epochs count the IMU's own samples (XIAO 52 Hz, T1000-E 50 Hz, both FIFO)
  openpaw_init(&g_core, cfg);
  openpaw_ring_init(&g_ring, g_ring_store, RING_RECORDS);
  openpaw_power_init(&g_pwr);
  openpaw_link_init(&g_link);
  openpaw_adv_init(&g_adv, millis());

  bool ok = imu_begin();
  flash_probe();
  log_begin();  // flash log if the probe found a chip, else RAM ring
  ble_begin();
  g_batt = battery_read_pct();
  bas.write(g_batt == 255 ? 0 : g_batt);
  status_update(0);
  // boot signal: 1 long blink = OK, 5 fast blinks = IMU not found
  if (ok) { led(true); delay(600); led(false); }
  else for (int i = 0; i < 5; i++) { led(true); delay(80); led(false); delay(80); }
  Serial.printf("openpaw fw=%s board=%d imu=%s storage=%s log=%s stored=%lu next_seq=%lu\n", OPENPAW_FW_VERSION,
                BOARD_ID, ok ? "ok" : "MISSING", g_flash_line, log_kind_name(),
                (unsigned long)log_count(), (unsigned long)g_core.seq);
  Serial.println("seq,uptime_s,flags,vedba_mean_mg,vedba_max_mg,active_frac,pitch_deg,roll_deg,bursts,hr_bpm,battery_pct");
}

static bool epoch_done(openpaw_record_t *rec, uint32_t up);
static void epoch_out(openpaw_record_t *rec, uint32_t up);

void loop() {
  static uint32_t next_ms = millis();
  static uint32_t last_ok_ms = millis();

  if (g_find_me) { g_find_me = false; find_me(); next_ms = millis(); }
  if (g_time_req) {  // RAM ring is lost on restart anyway: only the flash log keeps anchors
    g_time_req = false;
    openpaw_anchor_t a = {g_core.seq, millis() / 1000, g_time_unix, g_boot_seq};
    if (g_use_flog) openpaw_flog_put_anchor(&g_flog, &a);  // appended like an epoch, also mid-dump
  }
  if (g_dump_stop) { g_dump_stop = false; g_dumping = false; }
  if (g_dump_req) { g_dump_req = false; g_dump_idx = log_find(g_dump_from); g_dumping = true; }
  if (g_dumping && g_conn != BLE_CONN_HANDLE_INVALID) g_dumping = dump_step();

  uint32_t now = millis();
  link_update(now);
  adv_update(now);
  if ((int32_t)(now - next_ms) < 0) {
    if (!g_dumping) delay(next_ms - now);  // FreeRTOS delay = CPU sleeps between samples
    return;
  }
  uint32_t up = now / 1000;
  openpaw_record_t rec;

  // drain the IMU FIFO every IMU_FIFO_READ_MS (1 s XIAO, 0.8 s T1000-E): ~40-50x fewer
  // CPU wake-ups than polling each sample
  static int16_t xyz[3 * 128];
  uint16_t n = 0;
  bool overrun = false;
  next_ms = now + IMU_FIFO_READ_MS;
  if (!imu_fifo_read(xyz, 128, &n, &overrun)) {
    g_imu_errors++;
    n = 0;
  } else if (n) {
    last_ok_ms = now;
    if (n == 128) next_ms = now;  // more queued (e.g. after find-me): read again at once
  }
  if (now - last_ok_ms > 2000 + IMU_FIFO_READ_MS) {  // no samples: close the epoch as a GAP, re-init
    if (openpaw_flush(&g_core, up, 0, g_batt, &rec)) epoch_done(&rec, up);
    imu_begin();
    last_ok_ms = now;
    return;
  }
  // lost samples: close as GAP; if that changes the rate the FIFO restarted, so drop this batch
  if (overrun && openpaw_flush(&g_core, up, 0, g_batt, &rec) && epoch_done(&rec, up)) n = 0;
  uint32_t off = 0, used = 0;
  while (off < n) {
    int closed = openpaw_push_batch(&g_core, xyz + 3 * off, n - off, now, 0, g_batt, 0, &rec, &used);
    off += used;
    // a rate change restarts the FIFO: the rest of this batch is at the old rate, so drop it
    if (closed && epoch_done(&rec, up)) break;
  }
}

// Store, stream and report one closed epoch; returns true if the sampling rate changed.
static bool epoch_done(openpaw_record_t *rec, uint32_t up) {
  bool changed = false;
  // the epoch just closed, so a rate change starts cleanly with the next one
  float want_hz = openpaw_power_step(&g_pwr, rec, g_conn != BLE_CONN_HANDLE_INVALID);
  if (want_hz != g_rate_hz) {
    g_rate_hz = want_hz;
    openpaw_set_rate(&g_core, want_hz < SAMPLE_HZ ? IMU_LOW_HZ : IMU_FULL_HZ);
    imu_set_low_rate(want_hz < SAMPLE_HZ);
    changed = true;
  }
  epoch_out(rec, up);
  return changed;
}

static void epoch_out(openpaw_record_t *rec_p, uint32_t up) {
  openpaw_record_t &rec = *rec_p;
  log_put(&rec);
  uint8_t pkt[OPENPAW_RECORD_SIZE];
  openpaw_encode(&rec, pkt);
  chrLive.write(pkt, sizeof pkt);
  if (g_conn != BLE_CONN_HANDLE_INVALID && chrLive.notifyEnabled(g_conn)) chrLive.notify(pkt, sizeof pkt);
  if (rec.seq % 12 == 0) {  // once a minute
    g_batt = battery_read_pct();
    bas.write(g_batt == 255 ? 0 : g_batt);
  }
  status_update(up);
  if (g_conn == BLE_CONN_HANDLE_INVALID) { led(true); delay(2); led(false); }  // heartbeat blink
  if (Serial) {
    Serial.printf("%lu,%lu,%u,%u,%u,%u,%d,%d,%u,%u,%u\n", (unsigned long)rec.seq, (unsigned long)rec.uptime_s, rec.flags,
                  rec.vedba_mean_mg, rec.vedba_max_mg, rec.active_frac, rec.pitch_deg, rec.roll_half_deg * 2, rec.bursts,
                  rec.hr_bpm, rec.battery_pct);
  }
}
