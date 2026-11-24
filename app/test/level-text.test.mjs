// Band label text on the collar timeline must be readable on the card (WCAG 4.5:1 for small text).
// SPDX-License-Identifier: GPL-3.0-only
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS } from '../collar-analytics.js';
import { renderTimeline } from '../collar-view.js';

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const lum = (c) => { const f = (x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }; const [r, g, b] = c.map(f); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const ratio = (a, b) => { const [x, y] = [lum(hex(a)), lum(hex(b))].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const CARD = '#121210'; // --bg2, the timeline card (lighter than --bg, so the harder case)

test('every timeline band label is >= 4.5:1 against the card background', () => {
  let html = '';
  const svg = { getBoundingClientRect: () => ({ width: 1100, left: 0 }), setAttribute() {}, querySelector: () => null, set innerHTML(v) { html = v; } };
  renderTimeline(svg, {}, [], { now: Date.parse('2026-11-23T20:00:00Z') });
  const fills = [...html.matchAll(/<text class="band"[^>]*fill="(#[0-9a-f]{6})"[^>]*>([^<]+)<\/text>/gi)];
  assert.equal(fills.length, LEVELS.length);
  for (const [, fill, label] of fills) assert.ok(ratio(fill, CARD) >= 4.5, `${label} label ${fill} is ${ratio(fill, CARD).toFixed(2)}:1`);
});
