// node --test site/test/
// Landing "protocol scoreboard": the week card only changed on pointermove, so a phone tap or a
// keyboard user could never leave "This week" (real Chromium: 1/8 weeks reachable either way).
// week-nav.js holds the pure part: which week a point or a key selects. site.js wires it to
// pointerdown + pointermove and to keydown on the focusable plot.
// SPDX-License-Identifier: GPL-3.0-only
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { nearestIndex, stepIndex } from '../week-nav.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const xs = Array.from({ length: 8 }, (_, i) => 18 + (i / 7) * 864);

test('a point picks the nearest week, clamped at both ends', () => {
  assert.equal(nearestIndex(xs, xs[3]), 3);
  assert.equal(nearestIndex(xs, xs[3] + 50), 3);
  assert.equal(nearestIndex(xs, xs[3] + 80), 4);
  assert.equal(nearestIndex(xs, -500), 0);
  assert.equal(nearestIndex(xs, 5000), 7);
});

test('arrow keys step one week and stop at the ends; Home/End jump; other keys do nothing', () => {
  assert.equal(stepIndex(7, 'ArrowLeft', 8), 6);
  assert.equal(stepIndex(0, 'ArrowLeft', 8), 0);
  assert.equal(stepIndex(6, 'ArrowRight', 8), 7);
  assert.equal(stepIndex(7, 'ArrowRight', 8), 7);
  assert.equal(stepIndex(4, 'Home', 8), 0);
  assert.equal(stepIndex(2, 'End', 8), 7);
  assert.equal(stepIndex(3, 'Enter', 8), null);
  assert.equal(stepIndex(3, 'Tab', 8), null);
});

test('the chart plot is focusable and named, and site.js selects weeks on tap and keys', () => {
  const html = readFileSync(join(root, 'site/index.html'), 'utf8');
  const plot = html.match(/<div class="proto-plot"[^>]*>/);
  assert.ok(plot, 'no .proto-plot');
  assert.match(plot[0], /tabindex="0"/);
  assert.match(plot[0], /aria-label="[^"]*arrow keys[^"]*"/i);
  const js = readFileSync(join(root, 'site/site.js'), 'utf8');
  assert.match(js, /from '\.\/week-nav\.js'/);
  assert.match(js, /addEventListener\('pointerdown'/);
  assert.match(js, /addEventListener\('keydown', \(e\) => \{[^\n]*stepIndex/);
});
