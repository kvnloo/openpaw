// node --test app/test/
// Track Today card day ruler: the gold now dot had no label, and with the brighter elapsed
// segment from 00 it read like a slider handle rather than "the time now". The ruler's labels
// now include a gold mono "now" under the dot; an hour label it would collide with is left out,
// and at the ends of the day the now label aligns inward like the 00 / 24 labels do.
// SPDX-License-Identifier: GPL-3.0-only
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { rulerLabels } from '../today-list.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

test('rulerLabels keeps the 5 hour labels and adds a centred now label away from them', () => {
  const ls = rulerLabels(0.375); // 09:00
  assert.deepEqual(ls.filter((l) => !l.now).map((l) => l.text), ['00', '06', '12', '18', '24']);
  const n = ls.find((l) => l.now);
  assert.deepEqual(n, { text: 'now', f: 0.375, align: 'c', now: true });
});

test('rulerLabels drops an hour label the now label would collide with', () => {
  const ls = rulerLabels(0.52); // 12:29
  assert.deepEqual(ls.filter((l) => !l.now).map((l) => l.text), ['00', '06', '18', '24']);
  assert.equal(ls.find((l) => l.now).align, 'c');
});

test('rulerLabels aligns the now label inward at the ends of the day', () => {
  const early = rulerLabels(0.01);
  assert.equal(early.find((l) => l.now).align, 'l');
  assert.ok(!early.some((l) => l.text === '00'));
  const late = rulerLabels(0.99);
  assert.equal(late.find((l) => l.now).align, 'r');
  assert.ok(!late.some((l) => l.text === '24'));
});

test('rulerLabels keeps the inward 00 / 24 labels farther from now than the centred ones', () => {
  // 00 and 24 hang off one side of their tick, so they need more room (320 px phone: ruler ~251 px)
  assert.ok(!rulerLabels(0.1).some((l) => l.text === '00'));
  assert.ok(!rulerLabels(0.9).some((l) => l.text === '24'));
  assert.ok(!rulerLabels(0.33).some((l) => l.text === '06'));
  assert.ok(rulerLabels(0.12).some((l) => l.text === '00'));
});

test('track.js renders rulerLabels and the now label is gold', () => {
  const js = readFileSync(join(root, 'app/track.js'), 'utf8');
  assert.match(js, /rulerLabels\(/);
  const html = readFileSync(join(root, 'app/track.html'), 'utf8');
  assert.match(html, /\.ruler \.lb\.nw\s*\{[^}]*color:var\(--gold\)/);
});
