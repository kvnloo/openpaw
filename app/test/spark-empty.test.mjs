// The "last 10 minutes" strip on the collar page must read as a chart even before any data arrives:
// an empty strip was a blank gap between "Waiting" and the "−10 min … now" axis labels.
// SPDX-License-Identifier: GPL-3.0-only
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderNow } from '../collar-view.js';

globalThis.matchMedia ??= () => ({ matches: true });

function fakeRoot() {
  const els = {};
  const el = () => { const o = { textContent: '', innerHTML: '', style: { setProperty() {} } }; o.querySelector = () => el(); return o; };
  return { els, querySelector(sel) { const k = /data-k=(\w+)/.exec(sel)[1]; return (els[k] ??= el()); } };
}
const now = Date.parse('2026-11-23T20:00:00Z');

test('empty live strip draws a baseline and says no samples yet', () => {
  const root = fakeRoot();
  renderNow(root, [], { tz: 0, now, simulated: false });
  const sp = root.els.spark.innerHTML;
  assert.match(sp, /<line[^>]*class="base"/, 'baseline drawn');
  assert.match(sp, /<text[^>]*class="empty"[^>]*>No samples in the last 10 min<\/text>/);
});

test('live strip with data draws the line and no empty label', () => {
  const root = fakeRoot();
  const epochs = Array.from({ length: 24 }, (_, i) => ({ t: now - (23 - i) * 5000, vedba: 120 + i * 10, bursts: 0, pitch: 0, battery: 80 }));
  renderNow(root, epochs, { tz: 0, now, simulated: false });
  const sp = root.els.spark.innerHTML;
  assert.match(sp, /stroke="#d7b986"/);
  assert.doesNotMatch(sp, /class="empty"/);
});
