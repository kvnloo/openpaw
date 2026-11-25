// With no bursts the Bursts card printed one sentence and left most of the card empty
// beside the 7-day budget (the largest void on the collar page at 1440). The empty state
// now shows the anatomy of a burst row (a dashed, aria-hidden key row on the same grid)
// and says what each column will hold, using the definitions burstEvents() really uses.
// SPDX-License-Identifier: GPL-3.0-only
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderBursts } from '../collar-view.js';

const root = () => ({ innerHTML: '' });
const count = (s, re) => (s.match(re) || []).length;

test('no bursts: one aria-hidden key row on the burst grid, no invented values', () => {
  const r = root();
  renderBursts(r, []);
  assert.equal(count(r.innerHTML, /<li class="bu-key" aria-hidden="true">/g), 1);
  assert.equal(count(r.innerHTML, /<li[\s>](?![^>]*class="bu-(key|note)")/g), 0, 'no real burst rows');
  assert.doesNotMatch(r.innerHTML, /<p/, 'only <li> children inside the <ul>');
  assert.doesNotMatch(r.innerHTML, /\d(\.\d)? g peak/, 'no numeric peak in the key row');
  assert.doesNotMatch(r.innerHTML, /settled in \d/, 'no numeric settle in the key row');
});

test('no bursts: the note keeps the definition and explains each column', () => {
  const r = root();
  renderBursts(r, []);
  assert.match(r.innerHTML, /No bursts recorded/);
  assert.match(r.innerHTML, /not a reaction by itself/);
  assert.match(r.innerHTML, /1 min before to 5 min after/);
  assert.match(r.innerHTML, /below the vigorous band for 60 s/);
});

test('with a burst: normal row, no key row', () => {
  const r = root();
  const t0 = Date.parse('2026-11-23T10:00:00Z');
  const ep = Array.from({ length: 120 }, (_, i) => ({ t: t0 + i * 5000, w: 5, vedba: i === 20 ? 1800 : 60, max: i === 20 ? 1900 : 1000, bursts: i === 20 ? 1 : 0 }));
  renderBursts(r, ep);
  assert.equal(count(r.innerHTML, /bu-key/g), 0);
  assert.equal(count(r.innerHTML, /<li>/g), 1);
  assert.match(r.innerHTML, /1\.9 g peak/);
});
