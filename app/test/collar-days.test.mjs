// Differential guard for the collar page's day/minute bucketing: dayBudget() and circadian() must
// return exactly what the straightforward Date versions below return (local day = ISO date of
// t - tz minutes, minute of day from getUTCHours/getUTCMinutes), across positive and negative
// time-zone offsets, epochs a millisecond either side of local midnight, fractional timestamps and
// non-whole-hour zones. A faster bucketing path must not move one epoch into another day or bin.
// SPDX-License-Identifier: GPL-3.0-only
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dayBudget, circadian, demoWeek, levelOf, LEVELS } from '../collar-analytics.js';

const localDay = (t, tz) => new Date(t - tz * 60000).toISOString().slice(0, 10);
const minuteOfDay = (t, tz) => { const d = new Date(t - tz * 60000); return d.getUTCHours() * 60 + d.getUTCMinutes(); };

function refBudget(epochs, { tz = 0, now, days = 7 }) {
  const out = [];
  for (let i = days - 1; i >= 0; i--) out.push({ day: localDay(now - i * 864e5, tz), minutes: LEVELS.map(() => 0), bursts: 0, covered: 0 });
  const idx = new Map(out.map((d, i) => [d.day, i]));
  for (const e of epochs) {
    const i = idx.get(localDay(e.t, tz)); if (i === undefined) continue;
    const m = e.w / 60;
    out[i].minutes[levelOf(e.vedba)] += m; out[i].bursts += e.bursts || 0; out[i].covered += m;
  }
  return out;
}
function refCircadian(epochs, { tz = 0, now, days = 7, binMin = 30 }) {
  const n = Math.round(1440 / binMin), today = localDay(now, tz);
  const sum = new Array(n).fill(0), cnt = new Array(n).fill(0), tSum = new Array(n).fill(0), tCnt = new Array(n).fill(0);
  const past = new Set();
  for (const e of epochs) {
    if (e.t < now - (days + 1) * 864e5 || e.t > now) continue;
    const b = Math.min(n - 1, Math.floor(minuteOfDay(e.t, tz) / binMin));
    const d = localDay(e.t, tz);
    if (d === today) { tSum[b] += e.vedba; tCnt[b]++; } else { sum[b] += e.vedba; cnt[b]++; past.add(d); }
  }
  return { binMin, pastDays: past.size, typical: sum.map((s, i) => (cnt[i] ? s / cnt[i] : null)), today: tSum.map((s, i) => (tCnt[i] ? s / tCnt[i] : null)), nowBin: Math.floor(minuteOfDay(now, tz) / binMin) };
}

const NOW = Date.UTC(2026, 10, 20, 15, 4, 7, 250);
const TZS = [0, 360, -330, -840, 720, 45, -1];

// epochs placed a millisecond (and a fraction) either side of every local midnight and bin edge
function edgeEpochs(tz) {
  const out = [];
  const mid0 = Math.floor((NOW - tz * 60000) / 864e5) * 864e5 + tz * 60000; // a local midnight
  for (let d = -9; d <= 1; d++) {
    for (const off of [-1, -0.5, 0, 0.5, 1, 30 * 60000 - 1, 30 * 60000, 12 * 3600e3 + 0.75, 864e5 - 1, 864e5 - 0.25]) {
      out.push({ t: mid0 + d * 864e5 + off, vedba: 10 + ((d * 37 + off) % 900 + 900) % 900, bursts: off === 0 ? 2 : 0, w: 5 });
    }
  }
  return out.sort((a, b) => a.t - b.t);
}

test('dayBudget buckets every epoch into the same local day as the Date version', () => {
  for (const tz of TZS) {
    const eps = [...edgeEpochs(tz), ...demoWeek({ now: NOW, days: 9, stepS: 61, seed: 5, tz })].sort((a, b) => a.t - b.t);
    for (const days of [1, 7, 8]) assert.deepEqual(dayBudget(eps, { tz, now: NOW, days }), refBudget(eps, { tz, now: NOW, days }), `tz ${tz} days ${days}`);
  }
});

test('circadian bins and counts past days exactly like the Date version', () => {
  for (const tz of TZS) {
    const eps = [...edgeEpochs(tz), ...demoWeek({ now: NOW, days: 9, stepS: 61, seed: 9, tz })].sort((a, b) => a.t - b.t);
    for (const binMin of [30, 60, 7]) assert.deepEqual(circadian(eps, { tz, now: NOW, binMin }), refCircadian(eps, { tz, now: NOW, binMin }), `tz ${tz} bin ${binMin}`);
  }
});
