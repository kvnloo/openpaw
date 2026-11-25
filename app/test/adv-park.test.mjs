// Drift check: the sketch must drive advertising from openpaw_core.h's openpaw_adv_step
// (100 ms / 1 s normally, 2 s once no phone has connected for 10 min). The host test
// (firmware/test/test_core.c section 14) covers the state machine itself.
// node --test app/test/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ino = readFileSync(new URL('../../firmware/openpaw-collar/openpaw-collar.ino', import.meta.url), 'utf8');
const core = readFileSync(new URL('../../firmware/openpaw-collar/openpaw_core.h', import.meta.url), 'utf8');
const power = readFileSync(new URL('../../docs/POWER.md', import.meta.url), 'utf8');

test('the sketch sets the advertising intervals from the core constants, not literals', () => {
  assert.match(ino, /Advertising\.setInterval\(OPENPAW_ADV_FAST, OPENPAW_ADV_SLOW\)/);
  assert.doesNotMatch(ino, /Advertising\.setInterval\(\s*\d/, 'no hard-coded interval numbers left');
});

test('loop() calls the advertising step so the collar can park at 2 s', () => {
  assert.match(core, /openpaw_adv_step\(/);
  const loop = ino.slice(ino.indexOf('void loop()'));
  assert.match(loop, /adv_update\(/);
  assert.match(ino, /openpaw_adv_step\(&g_adv,/);
  assert.match(ino, /OPENPAW_ADV_PARKED/);
});

test('docs/POWER.md describes parked advertising with its estimate', () => {
  assert.match(power, /Advertising every 2 s/);
  assert.match(power, /10 min/);
});
