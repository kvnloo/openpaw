// Drift check: the T1000-E's QMA6100P batches samples in its own 64-frame FIFO (STREAM mode)
// and the CPU drains it in bursts, like the XIAO's LSM6DS3TR-C, instead of waking 50x/s.
// Register facts: QST QMA6100P datasheet Rev F, 7.8 and 9.7/9.9/9.48/9.49.
// node --test app/test/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ino = readFileSync(new URL('../../firmware/openpaw-collar/openpaw-collar.ino', import.meta.url), 'utf8');
const power = readFileSync(new URL('../../docs/POWER.md', import.meta.url), 'utf8');
const t1000 = ino.slice(ino.indexOf('#if BOARD_T1000E\n// QMA6100P'), ino.indexOf('// ---------------------------------------------------------------- battery'));

test('the T1000-E block uses the QMA6100P FIFO, not 50 Hz polling', () => {
  assert.ok(t1000.length > 0, 'T1000-E IMU block found');
  assert.match(t1000, /#define IMU_HAS_FIFO 1/);
  assert.doesNotMatch(t1000, /#define IMU_HAS_FIFO 0/);
  assert.match(t1000, /OPENPAW_QMA_FIFO_CFG0/, 'FIFO_CFG0 written from the tested constant');
  assert.match(t1000, /openpaw_qma_(odr|clock)\(/, 'ODR from a tested helper');
  assert.match(t1000, /openpaw_qma_fifo_plan\(/);
  assert.match(t1000, /openpaw_qma_frame_mg\(/);
  assert.match(t1000, /i2c_read\(QMA_ADDR, 0x0B, st, 4\)/, 'status burst 0Bh..0Eh (FIFO_OR + frame counter)');
  assert.match(t1000, /i2c_read\(QMA_ADDR, 0x3F,/, 'frames read from FIFO_DATA 3Fh');
  assert.match(t1000, /#define IMU_LOW_HZ 12\.5f/, 'still mode = 12.5 Hz ODR on the sensor itself');
});

test('both boards drain at their own read interval', () => {
  assert.match(ino, /IMU_FIFO_READ_MS/);
  assert.match(t1000, /#define IMU_FIFO_READ_MS OPENPAW_QMA_FIFO_READ_MS/);
});

test('docs/POWER.md no longer says the T1000-E is polled', () => {
  assert.doesNotMatch(power, /QMA6100P polled at 50 Hz/);
  assert.doesNotMatch(power, /it is still polled/);
  assert.match(power, /QMA6100P[^\n]*FIFO/);
});
