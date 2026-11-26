// Empty 7-day budget at 1440: the dashed day tracks stopped ~110 px short of the card
// edge (the blank value + burst columns kept their width), and the header "active min"
// labelled a column with nothing in it. Empty week: each track runs to the card edge,
// the row holds no blank value/burst cells, and the unit header is hidden.
// Weeks with data keep the 4-column row and the visible header.
// SPDX-License-Identifier: GPL-3.0-only
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderBudget } from '../collar-view.js';

globalThis.requestAnimationFrame ??= () => 0;
const fakeRoot = () => {
  const unit = { hidden: false };
  const r = { innerHTML: '', classList: { add() {} }, unit };
  r.insertAdjacentHTML = (_, html) => { r.innerHTML += html; };
  r.closest = (sel) => (sel === '.card' ? { querySelector: (q) => (q === '.bd-unit' ? unit : null) } : null);
  return r;
};
const now = Date.parse('2026-11-23T20:00:00Z');
const count = (s, re) => (s.match(re) || []).length;
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('empty week: rows carry no blank value/burst cells and the track spans to the edge', () => {
  const root = fakeRoot();
  renderBudget(root, [], { tz: 0, now });
  assert.equal(count(root.innerHTML, /class="bd-row[^"]*\bbd-none\b/g), 7);
  assert.equal(count(root.innerHTML, /class="bd-val"/g), 0);
  assert.equal(count(root.innerHTML, /class="bd-b"/g), 0);
  assert.match(html, /\.bd-row\.bd-none \.bd-bar\s*\{[^}]*grid-column:\s*2\s*\/\s*-1/);
});

test('empty week hides the "active min" header; a week with data shows it', () => {
  assert.match(html, /<span class="micro bd-unit"[^>]*>active<br>min<\/span>/);
  const root = fakeRoot();
  renderBudget(root, [], { tz: 0, now });
  assert.equal(root.unit.hidden, true);
  const start = Date.parse('2026-11-23T10:00:00Z');
  const ep = Array.from({ length: 720 }, (_, i) => ({ t: start + i * 5000, w: 5, vedba: 120, bursts: 0 }));
  renderBudget(root, ep, { tz: 0, now });
  assert.equal(root.unit.hidden, false);
  assert.equal(count(root.innerHTML, /\bbd-none\b/g), 0);
  assert.equal(count(root.innerHTML, /class="bd-val"/g), 7);
});
