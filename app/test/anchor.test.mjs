// Time anchors: dating epochs recorded before the collar restarted.
// node --test app/test/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { encodeSetTime, PROTO_TIME_ANCHOR, decodeRecord, decodeChunk, hexToBytes, RECORD_SIZE, syncFrom, dateBacklog,
  advanceCursor, rememberAnchors } from '../openpaw-ble.js';

// Synthetic boots: n epochs of 5 s starting at seq0, uptime counting from 5 s.
const boot = (seq0, n) => Array.from({ length: n }, (_, i) => ({ seq: seq0 + i, uptime_s: 5 * (i + 1) }));
const U1 = 1795000000, U2 = 1795400000;
const iso = (unixS) => new Date(unixS * 1000).toISOString();
const bySeq = (dated) => Object.fromEntries(dated.map((d) => [d.rec.seq, d.timestamp]));

const ino = readFileSync(new URL('../../firmware/openpaw-collar/openpaw-collar.ino', import.meta.url), 'utf8');
const golden = JSON.parse(readFileSync(new URL('./golden.json', import.meta.url)));

test('decodes the golden time anchor produced by the C core', () => {
  const g = golden.find((x) => x.name === 'anchor');
  assert.ok(g, 'golden.json has an anchor packet (firmware/test/test_core.c writes it)');
  const a = decodeRecord(hexToBytes(g.hex));
  assert.equal(a.anchor, true);
  for (const k of ['seq', 'uptime_s', 'unix_s', 'boot_seq']) assert.equal(a[k], g[k], k);
});

test('a dump chunk keeps anchors apart from epoch records', () => {
  const rest = hexToBytes(golden.find((x) => x.name === 'rest').hex);
  const anc = hexToBytes(golden.find((x) => x.name === 'anchor').hex);
  const buf = new Uint8Array(RECORD_SIZE * 3);
  buf.set(rest, 0); buf.set(anc, RECORD_SIZE); buf.set(rest, 2 * RECORD_SIZE);
  const { records, anchors, done } = decodeChunk(buf);
  assert.equal(records.length, 2);
  assert.ok(records.every((r) => !r.anchor));
  assert.equal(anchors.length, 1);
  assert.equal(anchors[0].unix_s, golden.find((x) => x.name === 'anchor').unix_s);
  assert.equal(done, false);
});

test('proto 2: sync resumes at the cursor even when it lies before this boot', () => {
  const st = { proto: 2, boot_seq: 89950, next_seq: 90000 };
  assert.equal(syncFrom(89900, st), 89901, 'records from the earlier boot are fetched too');
  assert.equal(syncFrom(null, st), 0, 'first sync on this phone: everything the collar kept');
  assert.equal(syncFrom(95000, st), 0, 'cursor beyond the collar (seq restarted, e.g. RAM log): start over');
  assert.equal(syncFrom(89900, { boot_seq: 89950, next_seq: 90000 }), 89950, 'proto 1 keeps the old rule');
});

test('each boot is dated by its own anchor; uptime resets mark the restart', () => {
  const records = [...boot(0, 100), ...boot(100, 20)];
  const anchors = [
    { seq: 40, uptime_s: 203, unix_s: U1, boot_seq: 0 },     // logged by the collar when the app connected in boot 1
    { seq: 120, uptime_s: 102, unix_s: U2, boot_seq: 100 },  // the live connection now (boot 2)
  ];
  const { dated, undated } = dateBacklog({ records, anchors });
  assert.equal(undated.length, 0);
  const t = bySeq(dated);
  assert.equal(t[0], iso(U1 + 5 - 203));
  assert.equal(t[99], iso(U1 + 500 - 203));
  assert.equal(t[100], iso(U2 + 5 - 102));
  assert.equal(t[119], iso(U2 + 100 - 102));
});

test('a boot the app never connected to stays undated, and never borrows an older boot\'s anchor', () => {
  const records = [...boot(0, 50), ...boot(50, 30), ...boot(80, 20)];
  const anchors = [{ seq: 10, uptime_s: 52, unix_s: U1, boot_seq: 0 }, { seq: 100, uptime_s: 101, unix_s: U2, boot_seq: 80 }];
  const { dated, undated } = dateBacklog({ records, anchors });
  assert.deepEqual(undated.map((r) => r.seq), Array.from({ length: 30 }, (_, i) => 50 + i));
  assert.equal(dated.length, 70);
  assert.equal(bySeq(dated)[80], iso(U2 + 5 - 101));
});

test('resuming from a cursor uses the anchor the app kept for that boot', () => {
  const cursor = { seq: 49, uptime_s: 250, boot_seq: 0 };
  const stored = { seq: 10, uptime_s: 52, unix_s: U1, boot_seq: 0 };  // not in this dump: it is before the cursor
  const live = { seq: 120, uptime_s: 102, unix_s: U2, boot_seq: 100 };
  const records = [...boot(0, 100).slice(50), ...boot(100, 20)];
  const { dated, undated } = dateBacklog({ records, anchors: [stored, live], cursor });
  assert.equal(undated.length, 0);
  assert.equal(bySeq(dated)[50], iso(U1 + 255 - 52));
  assert.equal(bySeq(dated)[100], iso(U2 + 5 - 102));
});

test('a restart right after the cursor is not mistaken for the cursor\'s boot', () => {
  const cursor = { seq: 49, uptime_s: 250, boot_seq: 0 };
  const stored = { seq: 10, uptime_s: 52, unix_s: U1, boot_seq: 0 };
  const { dated, undated } = dateBacklog({ records: boot(50, 10), anchors: [stored], cursor });
  assert.equal(dated.length, 0);
  assert.equal(undated.length, 10);
});

test('dated epochs carry their boot so the next cursor knows it', () => {
  const { dated } = dateBacklog({ records: boot(100, 3), anchors: [{ seq: 103, uptime_s: 16, unix_s: U2, boot_seq: 100 }] });
  assert.deepEqual(dated.map((d) => d.boot_seq), [100, 100, 100]);
});

test('cursor only moves forward and keeps uptime + boot of the newest synced epoch', () => {
  let c = advanceCursor(null, [{ seq: 5, uptime_s: 30, boot_seq: 0 }, { seq: 7, uptime_s: 40, boot_seq: 0 }]);
  assert.deepEqual(c, { seq: 7, uptime_s: 40, boot_seq: 0 });
  c = advanceCursor(c, [{ seq: 6, uptime_s: 35, boot_seq: 0 }]);
  assert.equal(c.seq, 7, 'an older backlog chunk arriving after live data does not move it back');
  c = advanceCursor(c, [{ seq: 50, uptime_s: 5, boot_seq: null }]);
  assert.deepEqual(c, { seq: 50, uptime_s: 5, boot_seq: null }, 'undated epochs still advance it (they can never be dated)');
  assert.equal(advanceCursor(c, []), c);
});

test('the app keeps a short, de-duplicated list of anchors per collar', () => {
  const a = (boot_seq, unix_s) => ({ seq: boot_seq + 1, uptime_s: 9, unix_s, boot_seq });
  let list = rememberAnchors([], [a(0, U1), a(0, U1)]);
  assert.equal(list.length, 1);
  list = rememberAnchors(list, Array.from({ length: 100 }, (_, i) => a(10 * (i + 1), U2 + i)), 64);
  assert.equal(list.length, 64);
  assert.equal(list.at(-1).boot_seq, 1000, 'newest kept');
  assert.ok(list.every((x, i) => i === 0 || x.seq >= list[i - 1].seq), 'sorted by seq');
});

test('set-time command: 0x20 + unix seconds (u32 LE), and the firmware handles that opcode', () => {
  const b = encodeSetTime(Date.UTC(2026, 10, 23, 12, 0, 0, 900));
  assert.deepEqual([...b], [0x20, ...new Uint8Array(new Uint32Array([Date.UTC(2026, 10, 23, 12) / 1000]).buffer)]);
  assert.match(ino, /data\[0\] == 0x20 && len >= 5/, 'firmware control callback handles 0x20');
  assert.match(ino, /0x20 <unix_s u32 LE> set time/, 'firmware header documents 0x20');
});

test('firmware that understands set-time reports proto >= PROTO_TIME_ANCHOR in its status', () => {
  const m = ino.match(/#define OPENPAW_PROTO (\d+)/);
  assert.ok(m, 'OPENPAW_PROTO defined');
  assert.equal(Number(m[1]), PROTO_TIME_ANCHOR);
});
