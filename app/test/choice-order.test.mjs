// node --test app/test/
// Learn practice shuffles each card's choices "so position is no clue". It used
// .sort(() => Math.random() - 0.5), which is not a fair shuffle: over the 19 real cards the right
// answer showed first 27% of the time and last 21% (fair: 25%), one card's slot was off by 12 points,
// and always tapping the likeliest slot scored 29% instead of 25%. choiceOrder() is a Fisher-Yates
// shuffle: every order equally likely.
// SPDX-License-Identifier: GPL-3.0-only
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { choiceOrder } from '../choice-order.js';
import { CARDS } from '../learn-content.js';
import { rng } from '../patterns.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

test('choiceOrder returns every index exactly once', () => {
  for (const n of [1, 2, 3, 4, 6]) {
    for (let t = 0; t < 50; t++) assert.deepEqual(choiceOrder(n).slice().sort((a, b) => a - b), [...Array(n).keys()]);
  }
});

test('the right answer is equally likely in every slot, for every real card', () => {
  const trials = 24000;
  for (const c of CARDS) {
    const n = c.choices.length, cnt = new Array(n).fill(0), r = rng(17);
    for (let t = 0; t < trials; t++) cnt[choiceOrder(n, r).indexOf(c.answer)]++;
    for (let s = 0; s < n; s++) assert.ok(Math.abs(cnt[s] / trials - 1 / n) < 0.015, `${c.id} slot ${s}: ${(cnt[s] / trials).toFixed(3)}`);
  }
});

test('every one of the 24 orders of four choices shows up about equally often', () => {
  const r = rng(5), seen = new Map(), trials = 48000;
  for (let t = 0; t < trials; t++) { const k = choiceOrder(4, r).join(''); seen.set(k, (seen.get(k) || 0) + 1); }
  assert.equal(seen.size, 24);
  for (const [k, v] of seen) assert.ok(Math.abs(v / trials - 1 / 24) < 0.006, `${k}: ${(v / trials).toFixed(4)}`);
});

test('Learn practice uses choiceOrder, not a random comparator', () => {
  const src = readFileSync(join(root, 'app/learn.js'), 'utf8');
  assert.match(src, /import \{ choiceOrder \} from '\.\/choice-order\.js'/);
  assert.match(src, /choiceOrder\(c\.choices\.length\)/);
  assert.doesNotMatch(src, /sort\(\(\) => Math\.random\(\)/);
});
