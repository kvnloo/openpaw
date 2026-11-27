// node --test app/test/
// No-sample Still epoch (record design, openpaw_core.h openpaw_nosample_epoch): the collar
// did not read the IMU this epoch, so the record has no movement or posture. Flag 0x20
// (OPENPAW_FLAG_NOSAMPLE); pitch/roll carry -128. The app must never export it as a
// measurement: no movement or posture events, one device.no_sample event so the epoch
// is still accounted for (no false "missing epochs"), battery kept.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FLAGS, hexToBytes, decodeRecord, recordToEvents, makeClock } from '../openpaw-ble.js';

const golden = JSON.parse(readFileSync(new URL('./golden.json', import.meta.url)));
const core = readFileSync(new URL('../../firmware/openpaw-collar/openpaw_core.h', import.meta.url), 'utf8');

// What openpaw_nosample_epoch + openpaw_encode produce: version 1, flags 0x20, seq, uptime,
// zero movement, pitch/roll int8 -128, hr 0, battery.
function noSampleBytes({ seq = 7, uptime = 4242, battery = 61 } = {}) {
  const b = new Uint8Array(20);
  const v = new DataView(b.buffer);
  v.setUint8(0, 1); v.setUint8(1, 0x20);
  v.setUint32(2, seq, true); v.setUint32(6, uptime, true);
  v.setInt8(15, -128); v.setInt8(16, -128);
  v.setUint8(19, battery);
  return b;
}

const opts = { dogId: 'dog-demo', deviceId: 'OpenPaw-ABCD', clock: makeClock(Date.UTC(2026, 10, 23, 15, 0, 0), 100) };

test('NOSAMPLE flag and posture sentinel match the firmware header', () => {
  const m = core.match(/#define OPENPAW_FLAG_NOSAMPLE (0x[0-9a-fA-F]+)/);
  assert.ok(m, 'OPENPAW_FLAG_NOSAMPLE defined in openpaw_core.h');
  assert.equal(FLAGS.NOSAMPLE, Number(m[1]));
  assert.match(core, /#define OPENPAW_NOSAMPLE_POSTURE \(-128\)/);
});

test('a no-sample record decodes as no_sample with no posture or movement values', () => {
  const r = decodeRecord(noSampleBytes());
  assert.equal(r.no_sample, true);
  assert.equal(r.seq, 7);
  assert.equal(r.battery_pct, 61);
  assert.equal(r.pitch_deg, null);
  assert.equal(r.roll_deg, null);
  assert.equal(r.vedba_mean_mg, null);
  const rest = decodeRecord(hexToBytes(golden.find((g) => g.name === 'rest').hex));
  assert.equal(rest.no_sample, false, 'a measured epoch is not no_sample');
  assert.equal(typeof rest.pitch_deg, 'number');
});

test('a no-sample epoch exports no movement or posture events, only device events', () => {
  const ev = recordToEvents(decodeRecord(noSampleBytes()), opts);
  const metrics = ev.map((e) => e.payload.metric).sort();
  assert.deepEqual(metrics, ['device.battery', 'device.no_sample']);
  assert.ok(ev.every((e) => e.provenance.quality.no_sample === true));
  const ns = ev.find((e) => e.payload.metric === 'device.no_sample');
  assert.equal(ns.payload.value, 1);
  assert.equal(ns.payload.window_s, 5);
  assert.equal(ns.provenance.device_seq, 7);
});

test('live views never draw a no-sample record as a movement value', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const field = readFileSync(new URL('../field.js', import.meta.url), 'utf8');
  const show = html.split('function show(rec) {', 2)[1].split('\n}', 1)[0];
  const onRec = field.split('async function onRecord(rec, deviceId, clock, origin) {', 2)[1].split('\n}', 1)[0];
  assert.match(show, /if \(rec\.no_sample\) return;/, 'collar page show() skips no-sample records');
  const guard = onRec.indexOf('if (!rec.no_sample)');
  assert.ok(guard >= 0 && guard < onRec.indexOf("$('vVal')"), 'Field live readout skips no-sample records');
  assert.ok(onRec.indexOf('recordToEvents') >= 0, 'but still stores its device events');
});

test('measured epochs say no_sample false on every event', () => {
  const ev = recordToEvents(decodeRecord(hexToBytes(golden.find((g) => g.name === 'rest').hex)), opts);
  assert.ok(ev.length >= 6);
  assert.ok(ev.every((e) => e.provenance.quality.no_sample === false));
  assert.ok(!ev.some((e) => e.payload.metric === 'device.no_sample'));
});
