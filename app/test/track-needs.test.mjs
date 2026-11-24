// node --test app/test/
// Track "Today" need rings: an empty ring (0 of goal) must still show where progress starts,
// with a gold start mark at 12 o'clock, so the row reads as a goal to fill rather than a bare "0".
// This is the page's gold accent (landing visual language: one gold accent per section).
// SPDX-License-Identifier: GPL-3.0-only
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const js = readFileSync(join(root, 'app/track.js'), 'utf8');
const html = readFileSync(join(root, 'app/track.html'), 'utf8');

test('need ring markup carries a start mark on the ring path', () => {
  const body = js.slice(js.indexOf('function renderNeeds'), js.indexOf('function', js.indexOf('function renderNeeds') + 10));
  const m = body.match(/<circle class="start"[^>]*>/);
  assert.ok(m, 'renderNeeds draws no <circle class="start">');
  // svg is rotated -90deg, so (cx = 32 + r, cy = 32) sits at 12 o'clock on the r = 26 ring
  assert.match(m[0], /cx="58"/);
  assert.match(m[0], /cy="32"/);
});

test('start mark is painted gold and hidden once the goal is met', () => {
  const rule = html.match(/\.need \.start\s*\{([^}]*)\}/);
  assert.ok(rule, 'no .need .start rule in app/track.html');
  assert.match(rule[1], /fill\s*:\s*var\(--gold\)/);
  assert.match(html, /\.need\.done \.start\s*\{[^}]*(display\s*:\s*none|opacity\s*:\s*0)/);
});
