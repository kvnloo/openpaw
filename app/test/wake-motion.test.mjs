// Drift check: wake on motion (BACKLOG Power item c). The interrupt wiring is checked from Seeed's
// own sources (core 1.1.13 variants), not on a real board:
//   XIAO nRF52840 Sense: variant.h PIN_LSM6DS3TR_C_INT1 (18); variant.cpp "D18 is P0.11 (6D_INT1)".
//   T1000-E: variant.h PIN_ACC_INTERRUPT (34); variant.cpp "P1.02 Accelerator Interrupt"
//   (Meshtastic's T1000-E variant agrees: QMA_6100P_INT_PIN (32 + 2)).
// The trap: the core's attachInterrupt() uses a GPIOTE IN channel (WInterrupts.c), which the
// nRF52840 PS v1.5 table ION_RAMON_GPIOTE puts at 17.37 uA asleep, against 2.36 uA for the
// PORT event (ION_RAMON_GPIOTEPORT). That is more than the whole Still-mode CPU line (~7 uA,
// docs/POWER.md), so the sketch must not call attachInterrupt for this.
// node --test app/test/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ino = readFileSync(new URL('../../firmware/openpaw-collar/openpaw-collar.ino', import.meta.url), 'utf8');
const power = readFileSync(new URL('../../docs/POWER.md', import.meta.url), 'utf8');
const todo = power.slice(power.indexOf('## What else costs power'), power.indexOf('## Sources'));

test('POWER.md names both boards\' accelerometer interrupt pins from the Seeed variants', () => {
  assert.match(todo, /PIN_LSM6DS3TR_C_INT1/);
  assert.match(todo, /P0\.11/);
  assert.match(todo, /PIN_ACC_INTERRUPT/);
  assert.match(todo, /P1\.02/);
  assert.match(todo, /not checked on a real board/i);
  assert.doesNotMatch(power, /That needs the interrupt pin wiring checked\s+on real boards\./);
});

test('POWER.md records the GPIOTE IN vs PORT sleep current from the nRF52840 PS', () => {
  assert.match(todo, /17\.37 µA/);
  assert.match(todo, /2\.36 µA/);
  assert.match(todo, /ION_RAMON_GPIOTE\b/);
  assert.match(todo, /ION_RAMON_GPIOTEPORT/);
  assert.match(todo, /attachInterrupt/);
});

test('POWER.md says why longer FIFO drains alone save little (same bytes on the wire)', () => {
  assert.match(todo, /same (number of )?bytes/i);
});

test('the sketch does not use attachInterrupt (GPIOTE IN channel = +15 µA asleep)', () => {
  assert.doesNotMatch(ino, /attachInterrupt\s*\(/,
    'an IMU interrupt must use the low-power PORT event (GPIO SENSE), see docs/POWER.md "Wake on motion"');
});
