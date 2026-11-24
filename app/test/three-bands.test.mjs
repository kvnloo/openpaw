// Three movement bands (research/calibration/RESULTS.md): the 15 mg "moderate" band had
// held-out F1 0.004, so the app uses still / active / vigorous.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS, levelOf, dayBudget, summary } from '../collar-analytics.js';
import { LEVEL_COLORS, renderTimeline } from '../collar-view.js';

const NOW = Date.parse('2026-11-23T20:00:00Z');

test('three bands: still < 250, active < 585, vigorous', () => {
  assert.deepEqual(LEVELS.map((l) => l.id), ['still', 'active', 'vigorous']);
  assert.deepEqual([0, 249, 250, 569, 570, 584, 585, 4000].map(levelOf), [0, 0, 1, 1, 1, 1, 2, 2]);
  assert.equal(LEVEL_COLORS.length, LEVELS.length);
});

test('day budget has one minute bucket per band and active minutes are every non-still band', () => {
  const t0 = NOW - 3600e3;
  // 12 still, 24 active (300 mg), 6 vigorous epochs of 5 s
  const ep = [...Array(42)].map((_, i) => ({ t: t0 + i * 5000, vedba: i < 12 ? 10 : i < 36 ? 300 : 900, w: 5, bursts: 0, batt: null }));
  const b = dayBudget(ep, { now: NOW, days: 1 });
  assert.equal(b[0].minutes.length, 3);
  assert.deepEqual(b[0].minutes.map((m) => Math.round(m * 60)), [60, 120, 30]);
  assert.equal(Math.round(summary(ep, { now: NOW }).activeToday * 60), 150);
});

test('every timeline band is tall enough to hold its label (>= 14 px) at desktop and phone widths', () => {
  for (const width of [1100, 340]) {
    let html = '';
    const svg = { getBoundingClientRect: () => ({ width, left: 0 }), setAttribute() {}, querySelector: () => null, set innerHTML(v) { html = v; } };
    renderTimeline(svg, {}, [], { now: NOW });
    const labels = [...html.matchAll(/<text class="band"[^>]*>([^<]+)<\/text>/g)].map((m) => m[1]);
    assert.deepEqual(labels, LEVELS.map((l) => l.label.toLowerCase()), `one label per band at ${width}`);
    const rects = [...html.matchAll(/<rect x="[\d.]+" y="([\d.]+)" width="[\d.]+" height="([\d.]+)" fill="#/g)].map((m) => Number(m[2]));
    assert.equal(rects.length, LEVELS.length);
    rects.forEach((h, i) => assert.ok(h >= 14, `${labels[i]} band is ${h.toFixed(1)} px tall at ${width}`));
  }
});
