// Drift check: in Still mode the T1000-E runs its QMA6100P at a 12.8 kHz master clock
// (10 uA instead of 38 uA, QST datasheet Rev F table 2) and falls back to 51.2 kHz when a
// rate check over the first 4 s disagrees (openpaw_qma_clock / openpaw_rate_check_* in
// openpaw_core.h, host-tested in firmware/test/test_core.c section 15c).
// node --test app/test/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ino = readFileSync(new URL('../../firmware/openpaw-collar/openpaw-collar.ino', import.meta.url), 'utf8');
const power = readFileSync(new URL('../../docs/POWER.md', import.meta.url), 'utf8');
const t1000 = ino.slice(ino.indexOf('#if BOARD_T1000E\n// QMA6100P'), ino.indexOf('// ---------------------------------------------------------------- battery'));

test('the T1000-E restarts its FIFO with the tested clock plan (PM 11h, then ODR 10h)', () => {
  assert.ok(t1000.length > 0, 'T1000-E IMU block found');
  const restart = t1000.slice(t1000.indexOf('static void imu_fifo_restart'), t1000.indexOf('static bool imu_begin'));
  assert.match(restart, /openpaw_qma_clock\(low, g_qma_slow_ok\)/);
  const pm = restart.indexOf('i2c_write(QMA_ADDR, 0x11, c.pm)');
  const odr = restart.indexOf('i2c_write(QMA_ADDR, 0x10, c.odr)');
  const fifo = restart.indexOf('i2c_write(QMA_ADDR, 0x3E, OPENPAW_QMA_FIFO_CFG0)');
  assert.ok(pm >= 0 && odr > pm && fifo > odr, 'clock, then ODR, then FIFO_CFG0 (which empties the FIFO)');
  assert.match(restart, /openpaw_rate_check_start\(/);
});

test('a failed rate check falls back to 51.2 kHz for the rest of the boot and says so', () => {
  assert.match(t1000, /openpaw_rate_check_feed\(&g_qma_rate, \*n,/);
  assert.match(t1000, /g_qma_slow_ok = false;/);
  assert.match(t1000, /Serial\.println\("qma_clock=fallback"\)/);
});

test('/verify-collar explains the qma_clock=fallback serial line as a note, not a failure', () => {
  const verify = readFileSync(new URL('../../.claude/commands/verify-collar.md', import.meta.url), 'utf8');
  const line = verify.split('\n').find((l) => l.includes('qma_clock=fallback')) || '';
  assert.ok(line, 'verify-collar.md mentions qma_clock=fallback');
  assert.match(line, /note, not a fail/);
  assert.match(line, /not yet run on hardware/);
});

test('docs/POWER.md budgets the 12.8 kHz Still clock, its assumption and the fallback', () => {
  assert.match(power, /12\.8 kHz \(Still mode, if the rate check passes\)[^\n]*10 µA/);
  assert.match(power, /~27 \/ ~32 µA/);
  assert.match(power, /qma_clock=fallback/);
  assert.match(power, /\*assumes\* the rate scales with the clock/);
  assert.doesNotMatch(power, /Whether a lower MCLK keeps 50 Hz data clean is not\s+checked/);
  assert.doesNotMatch(power, /QMA6100P adds 38 µA in both modes/);
});
