// OpenPaw reference collar firmware v0.1
//
// Boards (Arduino core "Seeed nRF52 Boards", Seeeduino:nrf52):
//   - Seeed XIAO nRF52840 Sense  (FQBN Seeeduino:nrf52:xiaonRF52840Sense)  IMU LSM6DS3TR-C
//   - Seeed SenseCAP T1000-E     (FQBN Seeeduino:nrf52:tracker_t1000_e_lorawan) IMU QMA6100P
//
// What it does: samples the accelerometer at 50 Hz, summarizes every 5 s into a
// 20-byte record (openpaw_core.h), keeps the newest records in RAM, streams
// each record live over BLE, and lets the OpenPaw web app download the backlog.
// Measurements only: no emotion, stress or diagnosis claims.
//
// BLE service (all UUIDs c0de000X-0be4-4f3a-9c1e-6f70656e7061):
//   0001 service
//   0002 live    notify, 20 B record each epoch
//   0003 log     notify, backlog chunks of N*20 B; a record whose version byte is 0xFF ends a dump
//   0004 control write: 0x01 <from_seq u32 LE> start dump | 0x02 stop dump | 0x10 find-me (blink/beep)
//   0005 status  read/notify 16 B: proto u8, board u8, epoch_s u16, next_seq u32, uptime_s u32, stored u32
// plus the standard Battery Service (0x180F) and Device Information (0x180A).
//
// SPDX-License-Identifier: GPL-3.0-only
#include <Arduino.h>
#include <Wire.h>
#include <bluefruit.h>
#include "openpaw_core.h"

#define OPENPAW_FW_VERSION "0.1.0"
#define OPENPAW_PROTO 1
#define SAMPLE_HZ 50
#define SAMPLE_MS (1000 / SAMPLE_HZ)
#define RING_RECORDS 4096  // 80 KB RAM = 5.7 h at 5 s epochs (flash persistence: see docs/COLLAR.md roadmap)

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
#define LSM_ADDR 0x6A
static bool imu_begin() {
  pinMode(PIN_LSM6DS3TR_C_POWER, OUTPUT);
  digitalWrite(PIN_LSM6DS3TR_C_POWER, HIGH);
  delay(20);
  IMU_WIRE.begin();
  uint8_t who = 0;
  if (!i2c_read(LSM_ADDR, 0x0F, &who, 1) || who != 0x6A) return false;
  i2c_write(LSM_ADDR, 0x12, 0x44);  // CTRL3_C: BDU=1, IF_INC=1
  i2c_write(LSM_ADDR, 0x11, 0x00);  // CTRL2_G: gyro power-down
  i2c_write(LSM_ADDR, 0x10, 0x3C);  // CTRL1_XL: ODR 52 Hz, FS +/-8 g
  i2c_write(LSM_ADDR, 0x15, 0x10);  // CTRL6_C: XL_HM_MODE=1 (low-power accel at 52 Hz)
  return true;
}
static bool imu_read_mg(int16_t *x, int16_t *y, int16_t *z) {
  uint8_t b[6];
  if (!i2c_read(LSM_ADDR, 0x28, b, 6)) return false;
  *x = (int16_t)((int16_t)(b[0] | (b[1] << 8)) * 0.244f);
  *y = (int16_t)((int16_t)(b[2] | (b[3] << 8)) * 0.244f);
  *z = (int16_t)((int16_t)(b[4] | (b[5] << 8)) * 0.244f);
  return true;
}
#endif

#if BOARD_T1000E
// QMA6100P: init sequence from Seeed's Tracker_T1000_E_LoRaWAN_Examples driver (MIT),
// +/-8 g, 0.977 mg/LSB, 14-bit left-aligned.
#define QMA_ADDR 0x12
static bool imu_begin() {
  pinMode(PIN_ACC_POWER_EN, OUTPUT);
  digitalWrite(PIN_ACC_POWER_EN, HIGH);
  delay(20);
  IMU_WIRE.begin();
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
  i2c_write(QMA_ADDR, 0x10, 0x00);  // bandwidth/ODR 100 Hz (we poll at 50 Hz)
  return true;
}
static bool imu_read_mg(int16_t *x, int16_t *y, int16_t *z) {
  uint8_t b[6];
  if (!i2c_read(QMA_ADDR, 0x01, b, 6)) return false;
  *x = (int16_t)(((int16_t)(b[0] | (b[1] << 8)) >> 2) * 0.977f);
  *y = (int16_t)(((int16_t)(b[2] | (b[3] << 8)) >> 2) * 0.977f);
  *z = (int16_t)(((int16_t)(b[4] | (b[5] << 8)) >> 2) * 0.977f);
  return true;
}
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
#if BOARD_XIAO_SENSE
  // XIAO nRF52840: VBAT through 1M/510k divider on PIN_VBAT, enabled by VBAT_ENABLE low.
  pinMode(VBAT_ENABLE, OUTPUT);
  digitalWrite(VBAT_ENABLE, LOW);
  analogReadResolution(12);
  uint32_t raw = 0;
  for (int i = 0; i < 4; i++) raw += analogRead(PIN_VBAT);
  float v = (raw / 4.0f) * (3.6f / 4096.0f) * (1510.0f / 510.0f);
  if (v < 2.5f) return 255;  // no battery attached (USB only)
  return lipo_pct(v);
#else
  return 255;  // T1000-E divider ratio not verified yet: report unknown rather than guess
#endif
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
static volatile bool g_dump_req = false, g_dump_stop = false;
static volatile uint32_t g_dump_from = 0;
static volatile bool g_find_me = false;
static uint32_t g_dump_idx = 0;
static bool g_dumping = false;
static uint16_t g_conn = BLE_CONN_HANDLE_INVALID;
static uint8_t g_batt = 255;
static uint32_t g_imu_errors = 0;

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
  }
}
static void connect_cb(uint16_t conn) {
  g_conn = conn;
  BLEConnection *c = Bluefruit.Connection(conn);
  c->requestMtuExchange(247);
  c->requestConnectionParameter(12, 0, 400);  // 15 ms interval while connected for fast dumps
}
static void disconnect_cb(uint16_t conn, uint8_t reason) {
  (void)conn; (void)reason;
  g_conn = BLE_CONN_HANDLE_INVALID;
  g_dumping = false;
}

static void status_update(uint32_t uptime_s) {
  uint8_t b[16];
  b[0] = OPENPAW_PROTO;
  b[1] = BOARD_ID;
  b[2] = g_core.cfg.epoch_s & 0xFF; b[3] = g_core.cfg.epoch_s >> 8;
  uint32_t v[3] = {g_core.seq, uptime_s, g_ring.count};
  for (int k = 0; k < 3; k++)
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
  chrStatus.setFixedLen(16);
  chrStatus.begin();

  Bluefruit.Advertising.addFlags(BLE_GAP_ADV_FLAGS_LE_ONLY_GENERAL_DISC_MODE);
  Bluefruit.Advertising.addService(svc);
  Bluefruit.ScanResponse.addName();
  Bluefruit.Advertising.restartOnDisconnect(true);
  Bluefruit.Advertising.setInterval(160, 1600);  // 100 ms fast for 30 s, then 1 s
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
  while (n < per && openpaw_ring_get(&g_ring, g_dump_idx + n, buf + n * OPENPAW_RECORD_SIZE)) n++;
  if (n == 0) {
    memset(buf, 0xFF, OPENPAW_RECORD_SIZE);  // end-of-dump marker
    chrLog.notify(buf, OPENPAW_RECORD_SIZE);
    return false;
  }
  if (chrLog.notify(buf, n * OPENPAW_RECORD_SIZE)) g_dump_idx += n;  // else: TX queue full, retry next loop
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
  cfg.sample_hz = SAMPLE_HZ;
  openpaw_init(&g_core, cfg);
  openpaw_ring_init(&g_ring, g_ring_store, RING_RECORDS);

  bool ok = imu_begin();
  ble_begin();
  g_batt = battery_read_pct();
  bas.write(g_batt == 255 ? 0 : g_batt);
  status_update(0);
  // boot signal: 1 long blink = OK, 5 fast blinks = IMU not found
  if (ok) { led(true); delay(600); led(false); }
  else for (int i = 0; i < 5; i++) { led(true); delay(80); led(false); delay(80); }
  Serial.printf("openpaw fw=%s board=%d imu=%s\n", OPENPAW_FW_VERSION, BOARD_ID, ok ? "ok" : "MISSING");
  Serial.println("seq,uptime_s,flags,vedba_mean_mg,vedba_max_mg,active_frac,pitch_deg,roll_deg,bursts,hr_bpm,battery_pct");
}

void loop() {
  static uint32_t next_ms = millis();
  static uint32_t last_ok_ms = millis();

  if (g_find_me) { g_find_me = false; find_me(); next_ms = millis(); }
  if (g_dump_stop) { g_dump_stop = false; g_dumping = false; }
  if (g_dump_req) { g_dump_req = false; g_dump_idx = openpaw_ring_find(&g_ring, g_dump_from); g_dumping = true; }
  if (g_dumping && g_conn != BLE_CONN_HANDLE_INVALID) g_dumping = dump_step();

  uint32_t now = millis();
  if ((int32_t)(now - next_ms) < 0) {
    if (!g_dumping) delay(next_ms - now);  // FreeRTOS delay = CPU sleeps between samples
    return;
  }
  next_ms += SAMPLE_MS;
  if ((int32_t)(now - next_ms) > 1000) next_ms = now + SAMPLE_MS;  // fell behind (e.g. find-me): resync

  int16_t x, y, z;
  openpaw_record_t rec;
  bool have = false;
  uint32_t up = now / 1000;
  if (imu_read_mg(&x, &y, &z)) {
    last_ok_ms = now;
    have = openpaw_push(&g_core, x, y, z, up, 0, g_batt, 0, &rec);
  } else {
    g_imu_errors++;
    if (now - last_ok_ms > 2000) {  // sensor stalled: close the epoch as a GAP and retry init
      have = openpaw_flush(&g_core, up, 0, g_batt, &rec);
      imu_begin();
      last_ok_ms = now;
    }
  }
  if (!have) return;

  openpaw_ring_put(&g_ring, &rec);
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
