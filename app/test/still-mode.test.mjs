// node --test app/test/
// Still mode (firmware 0.4): after 5 min lying still with no phone connected the collar
// samples at 10 Hz instead of 50 and sets record flag 0x10 (openpaw_core.h
// OPENPAW_FLAG_LOWRATE). The app must keep that fact on every event it exports.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FLAGS, hexToBytes, decodeRecord, recordToEvents, makeClock } from '../openpaw-ble.js';

const golden = JSON.parse(readFileSync(new URL('./golden.json', import.meta.url)));
const core = readFileSync(new URL('../../firmware/openpaw-collar/openpaw_core.h', import.meta.url), 'utf8');

function restWithFlags(flags) {
  const b = hexToBytes(golden.find((g) => g.name === 'rest').hex);
  b[1] = flags;
  return b;
}

test('LOWRATE flag value matches the firmware header', () => {
  const m = core.match(/#define OPENPAW_FLAG_LOWRATE (0x[0-9a-fA-F]+)/);
  assert.ok(m, 'OPENPAW_FLAG_LOWRATE defined in openpaw_core.h');
  assert.equal(FLAGS.LOWRATE, Number(m[1]));
});

test('a 10 Hz still-mode record decodes as low_rate; a full-rate one does not', () => {
  assert.equal(decodeRecord(restWithFlags(0x10)).low_rate, true);
  assert.equal(decodeRecord(restWithFlags(0)).low_rate, false);
  assert.equal(decodeRecord(restWithFlags(0x10 | 0x04)).clipped, true, 'other flags still decode');
});

test('exported events say which epochs were sampled at the low rate', () => {
  const clock = makeClock(Date.UTC(2026, 10, 23, 15, 0, 0), 100);
  const opts = { dogId: 'dog-demo', deviceId: 'OpenPaw-ABCD', clock };
  const low = recordToEvents(decodeRecord(restWithFlags(0x10)), opts);
  const full = recordToEvents(decodeRecord(restWithFlags(0)), opts);
  assert.ok(low.every((e) => e.provenance.quality.low_rate === true));
  assert.ok(full.every((e) => e.provenance.quality.low_rate === false));
});
