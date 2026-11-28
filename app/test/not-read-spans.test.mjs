// Quiet mode (firmware 0.5) writes no-sample epochs: the collar did not read its sensor. The collar
// page shades those stretches "not read" instead of leaving the movement line to bridge them as if
// they had been measured. notReadSpans turns stored device.no_sample events into time spans.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { notReadSpans, extendNotRead } from '../collar-analytics.js';

const T0 = Date.parse('2026-11-23T03:00:00Z');
const ev = (metric, i, { w = 5, src = 'OpenPaw-1' } = {}) => ({
  timestamp: new Date(T0 + i * w * 1000).toISOString(),
  provenance: { source_id: src, quality: { no_sample: metric === 'device.no_sample' } },
  payload: { metric, value: 1, window_s: w },
});

test('consecutive no-sample epochs merge into one span covering their windows', () => {
  const events = [1, 2, 3, 4].map((i) => ev('device.no_sample', i));
  assert.deepEqual(notReadSpans(events), [{ start: T0, end: T0 + 4 * 5000 }]);
});

test('a measured epoch between no-sample epochs splits the span (Quiet mode samples every 12th)', () => {
  const events = [1, 2, 3, 5, 6].map((i) => ev('device.no_sample', i)).concat([ev('movement.vedba_mean', 4)]);
  assert.deepEqual(notReadSpans(events), [
    { start: T0, end: T0 + 3 * 5000 },
    { start: T0 + 4 * 5000, end: T0 + 6 * 5000 },
  ]);
});

test('measurement and battery events alone give no spans; unsorted input is sorted', () => {
  assert.deepEqual(notReadSpans([ev('movement.vedba_mean', 1), ev('device.battery', 2)]), []);
  assert.deepEqual(notReadSpans([]), []);
  const events = [3, 1, 2].map((i) => ev('device.no_sample', i));
  assert.deepEqual(notReadSpans(events), [{ start: T0, end: T0 + 3 * 5000 }]);
});

test('extendNotRead adds a live no-sample epoch: touching extends the last span, a gap starts a new one', () => {
  const spans = [];
  extendNotRead(spans, T0 + 5000, 5);
  extendNotRead(spans, T0 + 10000, 5);
  assert.deepEqual(spans, [{ start: T0, end: T0 + 10000 }]);
  extendNotRead(spans, T0 + 20000, 5);  // the epoch ending at T0+15000 was measured
  assert.deepEqual(spans, [{ start: T0, end: T0 + 10000 }, { start: T0 + 15000, end: T0 + 20000 }]);
  extendNotRead(spans, Number.NaN, 5);
  assert.equal(spans.length, 2, 'an undatable record adds nothing');
});

test('the collar page shades stored and live no-sample epochs on the timeline and keys them', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /import \{[^}]*\bnotReadSpans\b[^}]*\bextendNotRead\b[^}]*\} from '\.\/collar-analytics\.js'/);
  const load = html.split('async function loadStored() {', 2)[1].split('\n}', 1)[0];
  assert.match(load, /notRead = notReadSpans\(/, 'stored no-sample events become spans');
  const show = html.split('function show(rec) {', 2)[1].split('\n}', 1)[0];
  const ns = show.indexOf('if (rec.no_sample)');
  assert.ok(ns >= 0 && show.indexOf('extendNotRead(notRead') > ns, 'a live no-sample record extends the spans');
  assert.ok(show.indexOf('epochs.push') > ns, 'and is still never pushed as a movement epoch');
  assert.match(html, /const nr = demo \? \[\] : notRead;/, 'the demo week never shows real spans');
  assert.match(html, /renderTimeline\([^;]*notRead: nr\b/);
  assert.match(html, /id="notReadKey"[^>]*hidden/, 'a legend key, hidden until there is a span');
  assert.match(html, /\$\('notReadKey'\)\.hidden = /);
});

test('malformed events and bad timestamps are skipped', () => {
  const bad = [null, {}, { payload: { metric: 'device.no_sample' }, timestamp: 'nope' }];
  assert.deepEqual(notReadSpans([...bad, ev('device.no_sample', 1)]), [{ start: T0, end: T0 + 5000 }]);
});
