// Drift check: the IMU bus runs at fast-mode 400 kHz on both boards. The Seeed core's
// TwoWire::begin() (Wire_nRF52.cpp, core 1.1.13) writes FREQUENCY = K100 every time, and the
// sketch re-runs imu_begin() after a sensor stall, so setClock must follow every begin().
// node --test app/test/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ino = readFileSync(new URL('../../firmware/openpaw-collar/openpaw-collar.ino', import.meta.url), 'utf8');
const core = readFileSync(new URL('../../firmware/openpaw-collar/openpaw_core.h', import.meta.url), 'utf8');
const power = readFileSync(new URL('../../docs/POWER.md', import.meta.url), 'utf8');

test('openpaw_core.h names the IMU bus clock: 400 kHz fast mode', () => {
  assert.match(core, /#define OPENPAW_I2C_HZ 400000u?\b/);
});

test('each board\'s imu_begin() sets the clock right after IMU_WIRE.begin(), before any transfer', () => {
  const bodies = [...ino.matchAll(/static bool imu_begin\(\) \{([\s\S]*?)\n\}/g)].map((m) => m[1]);
  assert.equal(bodies.length, 2, 'one imu_begin per board (XIAO + T1000-E)');
  for (const body of bodies) {
    const begin = body.indexOf('IMU_WIRE.begin();');
    const clock = body.indexOf('IMU_WIRE.setClock(OPENPAW_I2C_HZ);');
    const firstIo = Math.min(...['i2c_read(', 'i2c_write('].map((s) => body.indexOf(s)).filter((i) => i >= 0));
    assert.ok(begin >= 0, 'imu_begin calls IMU_WIRE.begin()');
    assert.ok(clock > begin, 'setClock comes after begin() (begin resets the bus to 100 kHz)');
    assert.ok(clock < firstIo, 'setClock comes before the first transfer');
  }
  assert.doesNotMatch(ino, /setClock\(\s*\d/, 'no hard-coded clock numbers');
});

test('docs/POWER.md budgets the FIFO read at 400 kHz and drops it from the to-do list', () => {
  assert.match(power, /400 kHz/);
  assert.doesNotMatch(power, /\*\*I²C at 400 kHz\.\*\* Both sensors support fast mode\. It would/);
  assert.match(power, /OPENPAW_I2C_HZ/);
});
