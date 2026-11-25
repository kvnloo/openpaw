// node --test site/test/
// Landing "One episode, three lenses" tabs (#lens-tabs): arrows moved and wrapped, but Home and End
// did nothing (real Chromium at 1440 + 390). WAI-ARIA APG Tabs: Home/End jump to the first/last tab.
// site.js now asks tabStep (site/tab-keys.js, already used by the metric chips) which tab a key selects.
// SPDX-License-Identifier: GPL-3.0-only
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const js = readFileSync(join(root, 'site/site.js'), 'utf8');
const lenses = js.slice(js.indexOf('function lenses()'), js.indexOf('/* ---------------- reveals'));

test('lens tabs pick the next tab with tabStep (so Home/End work), not their own arrow-only math', () => {
  assert.ok(lenses.length > 0, 'lenses() block not found');
  assert.match(lenses, /tabStep\(i, e\.key, tabs\.length\)/);
  assert.doesNotMatch(lenses, /e\.key !== 'ArrowRight' && e\.key !== 'ArrowLeft'/);
});

test('only the selected lens tab is in the Tab order', () => {
  const html = readFileSync(join(root, 'site/index.html'), 'utf8');
  const tabs = [...html.matchAll(/<button role="tab"[^>]*data-l="[^"]+"[^>]*>/g)].map((m) => m[0]);
  assert.equal(tabs.length, 3);
  for (const t of tabs) assert.equal(/tabindex="-1"/.test(t), !/aria-selected="true"/.test(t), t);
});
