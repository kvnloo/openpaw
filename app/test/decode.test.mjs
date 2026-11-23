// node --test app/test/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  hexToBytes, decodeRecord, decodeChunk, decodeStatus, encodeDumpFrom, parseHeartRate,
  recordToEvents, heartRateToEvents, makeClock, toJsonl, RECORD_SIZE,
} from '../openpaw-ble.js';

const golden = JSON.parse(readFileSync(new URL('./golden.json', import.meta.url)));
const schema = JSON.parse(readFileSync(new URL('../../schema/openpaw-event.schema.json', import.meta.url)));

test('decodes every golden packet produced by the C core exactly', () => {
  assert.ok(golden.length >= 6);
  for (const g of golden) {
    const r = decodeRecord(hexToBytes(g.hex));
    for (const k of ['version', 'flags', 'seq', 'uptime_s', 'vedba_mean_mg', 'vedba_max_mg', 'active_frac', 'pitch_deg', 'roll_deg', 'bursts', 'hr_bpm', 'battery_pct']) {
      assert.equal(r[k], g[k], `${g.name}.${k}`);
    }
  }
});

test('lunge has one burst and trot is far more active than rest', () => {
  const by = Object.fromEntries(golden.map((g) => [g.name, decodeRecord(hexToBytes(g.hex))]));
  assert.equal(by.lunge.bursts, 1);
  assert.ok(by.trot.vedba_mean_mg > 10 * by.rest.vedba_mean_mg);
  assert.ok(by.clip.clipped);
});

test('log chunks: multiple records then end marker', () => {
  const recs = golden.slice(0, 3).map((g) => hexToBytes(g.hex));
  const end = new Uint8Array(RECORD_SIZE).fill(0xff);
  const buf = new Uint8Array(RECORD_SIZE * 4);
  recs.forEach((r, i) => buf.set(r, i * RECORD_SIZE));
  buf.set(end, 3 * RECORD_SIZE);
  const { records, done } = decodeChunk(buf);
  assert.equal(records.length, 3);
  assert.equal(done, true);
  assert.throws(() => decodeChunk(new Uint8Array(21)));
});

test('status and control encoding', () => {
  const s = new Uint8Array(16);
  const dv = new DataView(s.buffer);
  s[0] = 1; s[1] = 2; dv.setUint16(2, 5, true); dv.setUint32(4, 1234, true); dv.setUint32(8, 6170, true); dv.setUint32(12, 1234, true);
  assert.deepEqual(decodeStatus(s), { proto: 1, board: 't1000-e', epoch_s: 5, next_seq: 1234, uptime_s: 6170, stored: 1234 });
  assert.deepEqual([...encodeDumpFrom(0x01020304)], [1, 4, 3, 2, 1]);
});

test('heart rate measurement with RR intervals (Polar H10 style)', () => {
  // flags: uint8 bpm, contact supported+detected, RR present -> 0x16; bpm 92; RR 650 ms = 666/1024 s
  const hr = parseHeartRate(Uint8Array.of(0x16, 92, 666 & 0xff, 666 >> 8, 700 & 0xff, 700 >> 8));
  assert.equal(hr.bpm, 92);
  assert.equal(hr.contact, true);
  assert.deepEqual(hr.rr_ms, [650, 684]);
  const hr16 = parseHeartRate(Uint8Array.of(0x01, 0x2c, 0x01));
  assert.equal(hr16.bpm, 300);
  assert.equal(hr16.contact, null);
});

// Minimal validator for the parts of the v0.1 schema the app produces.
function validate(ev) {
  for (const k of schema.required) assert.ok(k in ev, `missing ${k}`);
  for (const k of Object.keys(ev)) assert.ok(k in schema.properties, `unexpected top-level key ${k}`);
  assert.equal(ev.schema_version, schema.properties.schema_version.const);
  assert.ok(schema.properties.event_type.enum.includes(ev.event_type));
  assert.ok(schema.$defs.provenance.properties.origin.enum.includes(ev.provenance.origin));
  assert.ok(ev.provenance.source_id.length > 0);
  assert.ok(!Number.isNaN(Date.parse(ev.timestamp)));
}

test('records become schema-valid OpenPaw measurement events with provenance', () => {
  const clock = makeClock(Date.UTC(2026, 10, 23, 15, 0, 0), 100);
  const rec = decodeRecord(hexToBytes(golden.find((g) => g.name === 'trot').hex));
  const events = recordToEvents(rec, { dogId: 'dog-demo', deviceId: 'OpenPaw-ABCD', clock });
  assert.ok(events.length >= 6);
  events.forEach(validate);
  const ids = new Set(events.map((e) => e.event_id));
  assert.equal(ids.size, events.length, 'event ids unique');
  assert.equal(events[0].timestamp, new Date(Date.UTC(2026, 10, 23, 15, 0, 0) + (rec.uptime_s - 100) * 1000).toISOString());
  assert.equal(events[0].provenance.algorithm_version, 'openpaw-collar-core/1');
  const hrEv = heartRateToEvents({ bpm: 88, rr_ms: [680, 690], contact: true }, { dogId: 'dog-demo', deviceId: 'Polar-H10', timestamp: '2026-11-23T15:00:00.000Z', seq: 1 });
  hrEv.forEach(validate);
  const lines = toJsonl(events).trim().split('\n');
  assert.equal(lines.length, events.length);
  lines.forEach((l) => validate(JSON.parse(l)));
});
