// Differential guard for circadian(): it must return exactly what the plain per-epoch version
// below returns (the shipped algorithm before the r56 speed-up, kept verbatim as the reference):
// one Set of past local days, dayNum/minuteOfDay per epoch. Covers what a faster day counter
// could get wrong: epochs exactly on the window's start and end, after `now`, a fraction of a ms
// either side of local midnight, non-whole `days`, odd time-zone offsets, unsorted input, and
// non-number timestamps (NaN / undefined t pass the window test and the Set counts them as one
// extra "day"; that quirk is preserved, not fixed, so the chart's output can't change).
// SPDX-License-Identifier: GPL-3.0-only
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { circadian, demoWeek } from '../collar-analytics.js';

const DAY_MS = 864e5;
const dayNum = (t, tz) => Math.floor(Math.trunc(t - tz * 60000) / DAY_MS);
const minuteOfDay = (t, tz) => { const x = Math.trunc(t - tz * 60000) % DAY_MS; return Math.floor((x < 0 ? x + DAY_MS : x) / 60000) + 0; };
function refCircadian(epochs, { tz = 0, now = Date.now(), days = 7, binMin = 30 } = {}) {
  const n = Math.round(1440 / binMin);
  const today = dayNum(now, tz);
  const sum = new Array(n).fill(0), cnt = new Array(n).fill(0), tSum = new Array(n).fill(0), tCnt = new Array(n).fill(0);
  const past = new Set();
  for (const e of epochs) {
    if (e.t < now - (days + 1) * 864e5 || e.t > now) continue;
    const b = Math.min(n - 1, Math.floor(minuteOfDay(e.t, tz) / binMin));
    const d = dayNum(e.t, tz);
    if (d === today) { tSum[b] += e.vedba; tCnt[b]++; } else { sum[b] += e.vedba; cnt[b]++; past.add(d); }
  }
  return { binMin, pastDays: past.size, typical: sum.map((s, i) => (cnt[i] ? s / cnt[i] : null)), today: tSum.map((s, i) => (tCnt[i] ? s / tCnt[i] : null)), nowBin: Math.floor(minuteOfDay(now, tz) / binMin) };
}

let seed = 12345;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const NOWS = [Date.UTC(2026, 10, 20, 15, 4, 7, 250), Date.UTC(2026, 10, 21, 0, 0, 0) + 0.5, Date.UTC(2026, 10, 20, 23, 59, 59, 999)];
const TZS = [0, 360, -330, -840, 720, 45, -1, 300.5];

function history(now, tz, days, kind) {
  const start = now - (days + 1) * DAY_MS;
  const mid = Math.floor((now - tz * 60000) / DAY_MS) * DAY_MS + tz * 60000;
  const out = [];
  // window edges, exactly and a hair either side
  for (const t of [start - 1, start - 0.5, start, start + 0.5, now - 0.5, now, now + 0.5, now + 1]) out.push({ t, vedba: 50 + rnd() * 400 });
  // local midnights inside and just outside the window
  for (let d = -Math.ceil(days) - 2; d <= 1; d++) for (const off of [-1, -0.25, 0, 0.25, 1]) out.push({ t: mid + d * DAY_MS + off, vedba: rnd() * 900 });
  // random epochs, some with gaps of whole days
  const m = 200 + Math.floor(rnd() * 400);
  for (let i = 0; i < m; i++) {
    let t = start - DAY_MS + rnd() * (days + 3) * DAY_MS;
    if (kind === 'gappy' && Math.floor((t - start) / DAY_MS) % 3 === 1) continue;
    if (kind === 'ints') t = Math.round(t);
    out.push({ t, vedba: Math.round(rnd() * 1200) });
  }
  if (kind === 'odd') out.push({ t: NaN, vedba: 7 }, { vedba: 9 }, { t: NaN, vedba: 3 }, { t: Infinity, vedba: 1 }, { t: -Infinity, vedba: 1 });
  return kind === 'unsorted' || kind === 'odd' ? out : out.sort((a, b) => a.t - b.t);
}

test('circadian matches the per-epoch Set version on 480 edge-heavy random histories', () => {
  let n = 0;
  for (const now of NOWS) for (const tz of TZS) for (const kind of ['sorted', 'gappy', 'ints', 'unsorted', 'odd']) for (const days of [7, 1, 0, 2.5]) {
    const eps = history(now, tz, days, kind);
    for (const binMin of [30, 60, 7]) {
      assert.deepEqual(circadian(eps, { tz, now, days, binMin }), refCircadian(eps, { tz, now, days, binMin }), `now ${now} tz ${tz} ${kind} days ${days} bin ${binMin}`);
    }
    n++;
  }
  assert.equal(n, 480);
});

test('circadian matches the per-epoch Set version on simulated weeks', () => {
  for (const tz of [360, -330, 0]) for (const s of [3, 5, 9]) {
    const now = NOWS[0], eps = demoWeek({ now, days: 9, stepS: 30, seed: s, tz });
    assert.deepEqual(circadian(eps, { tz, now }), refCircadian(eps, { tz, now }), `tz ${tz} seed ${s}`);
  }
});

test('a non-number timestamp still counts as one extra past day (quirk preserved)', () => {
  const now = NOWS[0];
  const r = circadian([{ t: NaN, vedba: 5 }, { vedba: 5 }, { t: now - 2 * DAY_MS, vedba: 5 }], { tz: 0, now });
  assert.equal(r.pastDays, refCircadian([{ t: NaN, vedba: 5 }, { vedba: 5 }, { t: now - 2 * DAY_MS, vedba: 5 }], { tz: 0, now }).pastDays);
});
