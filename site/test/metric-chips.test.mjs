// node --test site/test/
// Landing "protocol scoreboard": the four metric chips are role=tab, but each was its own Tab stop
// and arrow keys did nothing (real Chromium: 4 Tab stops, arrows reached 1/4 metrics, no
// aria-controls). WAI-ARIA APG Tabs pattern: one Tab stop (the selected tab), Left/Right move and
// select with wrap, Home/End jump, each tab names the element it controls.
// tab-keys.js holds the pure part (which tab a key selects); site.js wires it to the chips.
// SPDX-License-Identifier: GPL-3.0-only
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { tabStep } from '../tab-keys.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

test('Left/Right step one tab and wrap; Home/End jump; other keys do nothing', () => {
  assert.equal(tabStep(0, 'ArrowRight', 4), 1);
  assert.equal(tabStep(3, 'ArrowRight', 4), 0);
  assert.equal(tabStep(0, 'ArrowLeft', 4), 3);
  assert.equal(tabStep(2, 'ArrowLeft', 4), 1);
  assert.equal(tabStep(2, 'Home', 4), 0);
  assert.equal(tabStep(1, 'End', 4), 3);
  assert.equal(tabStep(1, 'Enter', 4), null);
  assert.equal(tabStep(1, 'ArrowDown', 4), null);
});

test('only the selected metric chip is in the Tab order and every chip names what it controls', () => {
  const html = readFileSync(join(root, 'site/index.html'), 'utf8');
  const chips = [...html.matchAll(/<button role="tab"[^>]*data-m="[^"]+"[^>]*>/g)].map((m) => m[0]);
  assert.equal(chips.length, 4);
  for (const c of chips) {
    const selected = /aria-selected="true"/.test(c);
    assert.equal(/tabindex="-1"/.test(c), !selected, `tab order wrong: ${c}`);
    const id = c.match(/aria-controls="([^"]+)"/);
    assert.ok(id, `no aria-controls: ${c}`);
    assert.match(html, new RegExp(`id="${id[1]}"`));
  }
});

test('site.js moves selection and focus with tabStep and keeps the roving tabindex in step', () => {
  const js = readFileSync(join(root, 'site/site.js'), 'utf8');
  assert.match(js, /from '\.\/tab-keys\.js'/);
  assert.match(js, /tabStep\(/);
  assert.match(js, /#proto-chips[\s\S]{0,400}tabIndex = on \? 0 : -1/);
});
