// Collar "Right now" stat chips. With no data the sub-lines repeated their own labels
// ("HEAD PITCH / head pitch", "BATTERY / collar battery", "ACTIVE TODAY / ... today"), and the
// battery ring was drawn as an empty circle with no reading behind it. Sub-lines now say what
// the number means (unit, sign, source) instead of restating the label, and the ring only shows
// once the collar has reported a battery level.
// Real-browser check: page-shot collar (factory folder), empty + demo week.
// SPDX-License-Identifier: GPL-3.0-only
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderNow } from '../collar-view.js';

// minimal stand-in for the Right now card: only what renderNow touches
function fakeRoot() {
  const els = new Map();
  const make = () => {
    const kids = { b: { textContent: '–' }, small: { textContent: '' } };
    const props = {};
    return { textContent: '', innerHTML: '', hidden: false, kids, props,
      style: { setProperty: (k, v) => { props[k] = String(v); } },
      querySelector: (sel) => kids[sel] };
  };
  return { els, querySelector: (sel) => {
    const k = sel.match(/data-k=(\w+)/)[1];
    if (!els.has(k)) els.set(k, make());
    return els.get(k);
  } };
}
const LABELS = { active: 'Active today', bursts: 'Bursts today', pose: 'Head pitch', batt: 'Battery' };
const words = (s) => s.toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 2);
const NOW = Date.parse('2026-11-27T18:00:00Z');

test('no data: no chip sub-line repeats a word of its own label', () => {
  const r = fakeRoot();
  renderNow(r, [], { tz: 0, now: NOW, simulated: false });
  for (const [k, label] of Object.entries(LABELS)) {
    const sub = r.els.get(k).kids.small.textContent;
    assert.ok(sub.length > 0, `${k} has a sub-line`);
    for (const w of words(label)) assert.ok(!words(sub).includes(w), `${k} sub "${sub}" repeats "${w}"`);
  }
});

test('no data: head pitch says its unit and sign, battery says where it comes from', () => {
  const r = fakeRoot();
  renderNow(r, [], { tz: 0, now: NOW, simulated: false });
  assert.match(r.els.get('pose').kids.small.textContent, /\+.*nose up/);
  assert.match(r.els.get('batt').kids.small.textContent, /collar/);
});

// a 1440 chip holds ~17 characters of 12 px text per line; the first wording wrapped to an
// orphaned "mg" / "up" (looked at the native crop), so empty sub-lines stay at 15 or fewer
test('no data: every sub-line fits one line of a desktop chip', () => {
  const r = fakeRoot();
  renderNow(r, [], { tz: 0, now: NOW, simulated: false });
  for (const k of Object.keys(LABELS)) {
    const sub = r.els.get(k).kids.small.textContent;
    assert.ok(sub.length <= 15, `${k} sub "${sub}" is ${sub.length} chars`);
  }
});

test('battery ring hidden with no reading, shown with the level once reported', () => {
  const r = fakeRoot();
  renderNow(r, [], { tz: 0, now: NOW, simulated: false });
  assert.equal(r.els.get('battring').hidden, true);
  const ep = [{ t: NOW - 5000, w: 5, vedba: 40, max: 1000, active: 0.1, bursts: 0, pitch: -3, roll: 0, hr: null, batt: 77, clipped: false, origin: 'sensor' }];
  const r2 = fakeRoot();
  renderNow(r2, ep, { tz: 0, now: NOW, simulated: false });
  assert.equal(r2.els.get('battring').hidden, false);
  assert.equal(r2.els.get('battring').props['--p'], '77');
  assert.equal(r2.els.get('batt').kids.b.textContent, '77%');
});
