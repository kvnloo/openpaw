// Differential guard for the collar page's burst events: burstEvents() must return exactly what the
// straightforward version below returns (group burst epochs within gapS; peak = largest max of every
// epoch inside the event; settle = seconds until movement stays below the vigorous band for 60 s,
// looked for up to 30 min after the event), on sorted histories, duplicate timestamps, bursts at the
// first and last epoch, missing / NaN max values, clipped epochs, unsorted epochs and demo weeks.
// A faster path must not move any event, peak or settle time.
// SPDX-License-Identifier: GPL-3.0-only
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { burstEvents, demoWeek, levelOf, VIGOROUS } from '../collar-analytics.js';

function refBurstEvents(epochs, { gapS = 30 } = {}) {
  const out = [];
  for (const e of epochs) {
    if (!(e.bursts > 0)) continue;
    const last = out[out.length - 1];
    if (last && e.t - last.end <= gapS * 1000) { last.end = e.t; last.count += e.bursts; last.peak = Math.max(last.peak, e.max || 0); last.clipped ||= e.clipped; }
    else out.push({ start: e.t, end: e.t, count: e.bursts, peak: e.max || 0, clipped: e.clipped });
  }
  for (const b of out) for (const e of epochs) if (e.t >= b.start && e.t <= b.end) b.peak = Math.max(b.peak, e.max || 0);
  for (const b of out) {
    let calmSince = null;
    for (const e of epochs) {
      if (e.t <= b.end) continue;
      if (e.t - b.end > 30 * 60000) break;
      if (levelOf(e.vedba) < VIGOROUS) { calmSince ??= e.t; if (e.t - calmSince >= 60000) { b.settleS = Math.round((calmSince - b.end) / 1000); break; } }
      else calmSince = null;
    }
    b.settleS ??= null;
  }
  return out;
}
function rng(seed) { let s = seed >>> 0 || 1; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); }
const NOW = Date.UTC(2026, 10, 20, 15, 4, 7, 250);

test('burstEvents equals the full-scan reference on 300 random histories', () => {
  const r = rng(43);
  for (let k = 0; k < 300; k++) {
    const n = 1 + Math.floor(r() * 2500);
    const kind = k % 5; // 0 regular 5 s, 1 duplicate timestamps, 2 gaps + NaN/missing max, 3 dense bursts, 4 unsorted
    const eps = [];
    let t = NOW - n * 5000;
    for (let i = 0; i < n; i++) {
      if (kind === 1) t += r() < 0.3 ? 0 : 5000;
      else if (kind === 2) t += r() < 0.05 ? Math.floor(r() * 40 * 60000) : 5000;
      else t += 5000;
      const vig = r() < (kind === 3 ? 0.4 : 0.08);
      const vedba = vig ? 600 + r() * 900 : r() * 500;
      const burst = r() < (kind === 3 ? 0.3 : 0.03) || (i === 0 && k % 7 === 0) || (i === n - 1 && k % 11 === 0);
      const max = kind === 2 && r() < 0.2 ? (r() < 0.5 ? NaN : undefined) : vedba * (1 + r());
      eps.push({ t: kind === 4 ? NOW - Math.floor(r() * n * 5000) : t, vedba, max, bursts: burst ? 1 + Math.floor(r() * 3) : 0, clipped: r() < 0.02 });
    }
    for (const gapS of [30, 5]) assert.deepEqual(burstEvents(eps, { gapS }), refBurstEvents(eps, { gapS }), `history ${k} kind ${kind} n ${n} gap ${gapS}`);
  }
  assert.deepEqual(burstEvents([]), []);
});

test('burstEvents matches the reference on demo weeks, bursty included', () => {
  for (const seed of [3, 5, 9]) {
    const ep = demoWeek({ now: NOW, days: 3, stepS: 5, seed, tz: 360 });
    const bursty = ep.map((e) => (levelOf(e.vedba) === VIGOROUS && !e.bursts ? { ...e, bursts: 1 } : e));
    const a = burstEvents(ep);
    assert.ok(a.length > 0, `demo seed ${seed} has bursts`);
    assert.deepEqual(a, refBurstEvents(ep), `demo seed ${seed}`);
    assert.deepEqual(burstEvents(bursty), refBurstEvents(bursty), `bursty seed ${seed}`);
  }
});
