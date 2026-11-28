// Drift check: the sketch reads a Heart Rate strap (e.g. Polar H10) as a BLE central and
// logs its bpm in the epoch record, scanning only as openpaw_core.h's openpaw_strap_step
// allows. The host test (firmware/test/test_core.c) covers the parser and the policy.
// node --test app/test/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ino = readFileSync(new URL('../../firmware/openpaw-collar/openpaw-collar.ino', import.meta.url), 'utf8');
const power = readFileSync(new URL('../../docs/POWER.md', import.meta.url), 'utf8');
const loop = ino.slice(ino.indexOf('void loop()'));

test('the collar runs one peripheral and one central link', () => {
  assert.match(ino, /Bluefruit\.begin\(1, 1\)/);
  assert.match(ino, /BLEClientService\s+\w+\(UUID16_SVC_HEART_RATE\)/);
  assert.match(ino, /BLEClientCharacteristic\s+\w+\(UUID16_CHR_HEART_RATE_MEASUREMENT\)/);
});

test('control 0x30 pairs a strap and 0x31 forgets it', () => {
  const cb = ino.slice(ino.indexOf('static void ctrl_write_cb'), ino.indexOf('static void connect_cb'));
  assert.match(cb, /data\[0\] == 0x30/);
  assert.match(cb, /data\[0\] == 0x31/);
  assert.match(ino, /openpaw_strap_pair\(&g_strap,/);
  assert.match(ino, /openpaw_strap_forget\(&g_strap\)/);
});

test('scanning follows the core policy, filtered on the Heart Rate service, at the core duty cycle', () => {
  assert.match(loop, /strap_update\(/);
  assert.match(ino, /openpaw_strap_step\(&g_strap,/);
  assert.match(ino, /Scanner\.setInterval\(OPENPAW_STRAP_SCAN_INTERVAL, OPENPAW_STRAP_SCAN_WINDOW\)/);
  assert.match(ino, /Scanner\.filterUuid\(/);
  assert.match(ino, /Scanner\.restartOnDisconnect\(false\)/);
  assert.match(ino, /openpaw_strap_accept\(&g_strap,/);
  assert.match(ino, /Central\.setConnInterval\(OPENPAW_STRAP_CONN_MIN, OPENPAW_STRAP_CONN_MAX\)/);
  assert.doesNotMatch(ino, /Scanner\.start\(0\);[^\n]*\n[^\n]*\/\/ always/, 'no unconditional scan');
});

test('strap notifications feed the epoch heart rate; each closed epoch takes it', () => {
  const cb = ino.slice(ino.indexOf('static void hrm_notify_cb'));
  assert.match(cb.slice(0, 600), /openpaw_hrm_parse\(/);
  assert.match(cb.slice(0, 600), /openpaw_hr_feed\(&g_hr,/);
  assert.match(ino, /openpaw_push_batch\(&g_core, xyz \+ 3 \* off, n - off, now, hr_now\(\)/);
  assert.match(ino, /openpaw_flush\(&g_core, up, hr_now\(\)/);
  assert.match(ino, /hr_epoch_closed\(\)/);
  assert.match(ino, /openpaw_strap_linked\(&g_strap,/);
  assert.match(ino, /openpaw_strap_dropped\(&g_strap,/);
});

test('docs/POWER.md has the strap scan row with its estimate', () => {
  assert.match(power, /Strap scan/);
  assert.match(power, /pair strap/i);
});
