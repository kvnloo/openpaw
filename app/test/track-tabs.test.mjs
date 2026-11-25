// node --test app/test/
// Track's section tabs (Today / Patterns / Trackers) are role=tab, but each was its own Tab stop
// and Home/End did nothing (real Chromium: 3 Tab stops, also after arrowing and when the page opens
// on #trackers). WAI-ARIA APG Tabs pattern: one Tab stop (the selected tab), Left/Right move and
// select with wrap, Home/End jump. app/tab-keys.js is the landing page's site/tab-keys.js (Pages
// publishes app/ and site/ to different folders, so the app carries its own copy).
// SPDX-License-Identifier: GPL-3.0-only
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { tabStep } from '../tab-keys.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

test('app/tab-keys.js is the same module as site/tab-keys.js', () => {
  assert.equal(readFileSync(join(root, 'app/tab-keys.js'), 'utf8'), readFileSync(join(root, 'site/tab-keys.js'), 'utf8'));
  assert.equal(tabStep(2, 'ArrowRight', 3), 0);
  assert.equal(tabStep(2, 'Home', 3), 0);
  assert.equal(tabStep(0, 'End', 3), 2);
});

test('only the selected Track tab is in the Tab order', () => {
  const html = readFileSync(join(root, 'app/track.html'), 'utf8');
  const tabs = [...html.matchAll(/<button role="tab"[^>]*>/g)].map((m) => m[0]);
  assert.equal(tabs.length, 3);
  for (const t of tabs) assert.equal(/tabindex="-1"/.test(t), !/aria-selected="true"/.test(t), `tab order wrong: ${t}`);
});

test('track.js selects with tabStep and moves the roving tabindex with the selection', () => {
  const js = readFileSync(join(root, 'app/track.js'), 'utf8');
  assert.match(js, /from '\.\/tab-keys\.js'/);
  assert.match(js, /tabStep\(/);
  assert.match(js, /function show\(tab\) \{[\s\S]{0,300}tabIndex = n === tab \? 0 : -1/);
});
