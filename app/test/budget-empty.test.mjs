// The 7-day activity budget with no collar data at all used to print seven identical
// "no data" rows with a "–" each (the biggest empty-state block on the collar page),
// and each row's label claimed "Still 0 min, Active 0 min, Vigorous 0 min".
// Empty week: quiet tracks, one note. Some data: rows without data still say "no data".
// SPDX-License-Identifier: GPL-3.0-only
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderBudget } from '../collar-view.js';

globalThis.requestAnimationFrame ??= () => 0;
const fakeRoot = () => {
  const r = { innerHTML: '', classList: { add() {} } };
  r.insertAdjacentHTML = (_, html) => { r.innerHTML += html; };
  return r;
};
const now = Date.parse('2026-11-23T20:00:00Z');
const count = (s, re) => (s.match(re) || []).length;

test('empty week: one note instead of seven "no data" rows', () => {
  const root = fakeRoot();
  renderBudget(root, [], { tz: 0, now });
  assert.equal(count(root.innerHTML, /no data<\/em>/g), 0);
  assert.equal(count(root.innerHTML, /class="bd-empty"/g), 1);
  assert.match(root.innerHTML, /No collar data in the last 7 days/);
  assert.equal(count(root.innerHTML, /class="bd-row/g), 7, 'day axis kept');
  assert.equal(count(root.innerHTML, /<span class="bd-val">–<\/span>/g), 0);
});

test('empty week: rows do not claim 0 min of each level', () => {
  const root = fakeRoot();
  renderBudget(root, [], { tz: 0, now });
  assert.doesNotMatch(root.innerHTML, /Still 0/);
  assert.equal(count(root.innerHTML, /aria-label="[^"]*: no data"/g), 7);
});

test('partial week: days without data still say "no data"', () => {
  const root = fakeRoot();
  // synthetic: one hour of 5-s epochs earlier today
  const start = Date.parse('2026-11-23T10:00:00Z');
  const ep = Array.from({ length: 720 }, (_, i) => ({ t: start + i * 5000, w: 5, vedba: 120, bursts: 0 }));
  renderBudget(root, ep, { tz: 0, now });
  assert.equal(count(root.innerHTML, /no data<\/em>/g), 6);
  assert.equal(count(root.innerHTML, /class="bd-empty"/g), 0);
});
