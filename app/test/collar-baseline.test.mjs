// Differential guard for the collar page's personal reference: baseline() must return exactly what
// the straightforward version below returns (copy + sort for every quantile; resting = median of
// the epochs at or below the 30th percentile; typical active = p95), on tied and untied values,
// ties straddling the 30th percentile, the 60-epoch minimum, negative and fractional values,
// unsorted epochs and the time window edge. A faster path must not move either number.
// SPDX-License-Identifier: GPL-3.0-only
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { baseline, demoWeek } from '../collar-analytics.js';

const quantile = (xs, q) => { if (!xs.length) return null; const s = xs.slice().sort((a, b) => a - b); const i = (s.length - 1) * q, lo = Math.floor(i); return s[lo] + (s[Math.min(s.length - 1, lo + 1)] - s[lo]) * (i - lo); };
function refBaseline(epochs, { now, days = 7 }) {
  const xs = epochs.filter((e) => e.t > now - days * 864e5).map((e) => e.vedba);
  if (xs.length < 60) return null;
  const q30 = quantile(xs, 0.3);
  return { resting: quantile(xs.filter((v) => v <= q30), 0.5), active: quantile(xs, 0.95), n: xs.length };
}
function rng(seed) { let s = seed >>> 0 || 1; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); }

const NOW = Date.UTC(2026, 10, 20, 15, 4, 7, 250);

test('baseline equals the copy-and-sort reference on 400 random histories', () => {
  const r = rng(35);
  for (let k = 0; k < 400; k++) {
    const n = 55 + Math.floor(r() * 3000);
    const kind = k % 5; // 0 untied floats, 1 few distinct integers (heavy ties), 2 negatives + fractions, 3 one value, 4 unsorted times
    const eps = [];
    for (let i = 0; i < n; i++) {
      let v;
      if (kind === 0) v = r() * 1500;
      else if (kind === 1) v = Math.floor(r() * 6) * 10;
      else if (kind === 2) v = (r() - 0.4) * 300 + 0.125;
      else if (kind === 3) v = 42;
      else v = Math.round(r() * 900);
      const t = kind === 4 ? NOW - Math.floor(r() * 9 * 864e5) : NOW - (n - i) * 5000;
      eps.push({ t, vedba: v });
    }
    assert.deepEqual(baseline(eps, { now: NOW }), refBaseline(eps, { now: NOW }), `history ${k} kind ${kind} n ${n}`);
  }
});

test('baseline matches the reference at the window edge, the 60-epoch minimum and on demo weeks', () => {
  const edge = [];
  for (let i = 0; i < 61; i++) edge.push({ t: NOW - 7 * 864e5 + (i === 0 ? 0 : i), vedba: i % 7 });
  assert.equal(baseline(edge, { now: NOW }).n, 60); // the epoch exactly 7 days old is outside
  assert.deepEqual(baseline(edge, { now: NOW }), refBaseline(edge, { now: NOW }));
  assert.equal(baseline(edge.slice(0, 60), { now: NOW }), null);
  for (const seed of [3, 5, 9]) {
    const ep = demoWeek({ now: NOW, days: 9, stepS: 30, seed, tz: 360 });
    assert.deepEqual(baseline(ep, { now: NOW }), refBaseline(ep, { now: NOW }), `demo seed ${seed}`);
    assert.deepEqual(baseline(ep, { now: NOW, days: 3 }), refBaseline(ep, { now: NOW, days: 3 }));
  }
});
