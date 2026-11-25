// The 24-hour rhythm dial's centre must say how many past days the "typical" ring is built from.
// It used to read "Typical day · 7 days · hover a slice" with no data at all (static text).
// SPDX-License-Identifier: GPL-3.0-only
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderRhythm } from '../collar-view.js';
import { circadian } from '../collar-analytics.js';

const fakeSvg = () => ({ innerHTML: '', querySelector: () => ({ setAttribute() {} }) });
const now = Date.parse('2026-11-23T20:00:00Z');
const day = 864e5;
// one 5-s epoch every 30 min on each of `n` past days (synthetic)
const midnight = Date.parse('2026-11-23T00:00:00Z');
const pastDays = (n) => Array.from({ length: n * 48 }, (_, i) => ({ t: midnight - (Math.floor(i / 48) + 1) * day + (i % 48) * 1800e3, vedba: 200, bursts: 0 }));

test('circadian counts the past days that feed the typical ring', () => {
  assert.equal(circadian([], { tz: 0, now }).pastDays, 0);
  assert.equal(circadian(pastDays(3), { tz: 0, now }).pastDays, 3);
});

test('empty dial says no past days yet, not "7 days"', () => {
  const center = { innerHTML: '<span class="micro">Typical day</span><b>7 days</b>' };
  renderRhythm(fakeSvg(), center, [], { tz: 0, now });
  assert.doesNotMatch(center.innerHTML, /7 days/);
  assert.doesNotMatch(center.innerHTML, /hover a slice/);
  assert.match(center.innerHTML, /<b class="none">No data yet<\/b>/);
});

test('dial with 3 past days says 3 days', () => {
  const center = { innerHTML: '' };
  renderRhythm(fakeSvg(), center, pastDays(3), { tz: 0, now });
  assert.match(center.innerHTML, /<b>3 days<\/b>/);
  assert.match(center.innerHTML, /hover a slice/);
});

test('dial with 1 past day uses the singular', () => {
  const center = { innerHTML: '' };
  renderRhythm(fakeSvg(), center, pastDays(1), { tz: 0, now });
  assert.match(center.innerHTML, /<b>1 day<\/b>/);
});
