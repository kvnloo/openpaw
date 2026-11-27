// Bench: the analytics work of one collar-page render, reference vs candidate collar-analytics.js,
// alternating ABAB arms.
// usage: node tools/bench-collar.mjs <ref/collar-analytics.js> <cand/collar-analytics.js> [--gate 0.7] [--rounds 7]
// The collar page re-renders on every live record (every 5 s) and each render runs summary(),
// circadian(), dayBudget(7 days) and burstEvents() over every stored epoch. Inputs are simulated
// 5 s epochs (demoWeek, stepS 5, seeds 3,5,9) covering 7, 14 and 30 days; the "bursty" size marks
// every vigorous epoch of a 7-day history as a burst (a dog with many reactions). Every output is
// compared between the arms: any difference is an error and the run exits 1. With --gate R it also
// exits 1 unless the 7-day candidate median is <= R x the reference median.
// SPDX-License-Identifier: GPL-3.0-only
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
const flag = (name, dflt) => { const i = args.indexOf(name); return i >= 0 ? Number(args[i + 1]) : dflt; };
const [refPath, candPath] = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
if (!refPath || !candPath) { console.error('usage: node tools/bench-collar.mjs <ref/collar-analytics.js> <cand/collar-analytics.js> [--gate R] [--rounds N]'); process.exit(2); }
const gate = flag('--gate', null), rounds = flag('--rounds', 7);
const load = (p) => import(pathToFileURL(resolve(p)).href + `?arm=${encodeURIComponent(p)}`);
const A = await load(refPath), B = await load(candPath);
const NOW = Date.UTC(2026, 10, 20, 15, 4, 7), TZ = 360, seeds = [3, 5, 9];
const med = (a) => { const s = a.slice().sort((x, y) => x - y); const h = s.length >> 1; return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2; };
const render = (lib, ep) => ({
  s: lib.summary(ep, { tz: TZ, now: NOW }),
  c: lib.circadian(ep, { tz: TZ, now: NOW }),
  d: lib.dayBudget(ep, { tz: TZ, now: NOW, days: 7 }),
  b: lib.burstEvents(ep),
});
const sets = {
  '7d': seeds.map((seed) => A.demoWeek({ now: NOW, days: 7, stepS: 5, seed, tz: TZ })),
  '14d': seeds.map((seed) => A.demoWeek({ now: NOW, days: 14, stepS: 5, seed, tz: TZ })),
  '30d': seeds.map((seed) => A.demoWeek({ now: NOW, days: 30, stepS: 5, seed, tz: TZ })),
  bursty: seeds.map((seed) => A.demoWeek({ now: NOW, days: 7, stepS: 5, seed, tz: TZ })
    .map((e) => (A.levelOf(e.vedba) === A.VIGOROUS && !e.bursts ? { ...e, bursts: 1 } : e))),
};
const out = { tz: TZ, now: new Date(NOW).toISOString(), rounds, sizes: {}, error_count: 0 };
for (const [name, eps] of Object.entries(sets)) {
  const t = { ref: [], cand: [] };
  const ref = eps.map((ep) => JSON.stringify(render(A, ep)));
  for (let r = 0; r < rounds; r++) {
    for (const arm of r % 2 ? ['cand', 'ref'] : ['ref', 'cand']) {
      const lib = arm === 'ref' ? A : B;
      const s = performance.now();
      const res = eps.map((ep) => render(lib, ep));
      t[arm].push(performance.now() - s);
      if (r === 0 && arm === 'cand') res.forEach((x, k) => { if (JSON.stringify(x) !== ref[k]) { out.error_count++; console.error(`output differs: ${name} seed ${seeds[k]}`); } });
    }
  }
  const bursts = eps.reduce((n, ep) => n + A.burstEvents(ep).length, 0) / eps.length;
  const r = med(t.ref) / eps.length, c = med(t.cand) / eps.length;
  out.sizes[name] = { epochs: eps[0].length, burst_events: +bursts.toFixed(1), ref_ms: +r.toFixed(2), cand_ms: +c.toFixed(2), ratio: +(c / r).toFixed(3), work_count: eps.length * rounds };
}
console.log(JSON.stringify(out, null, 1));
let fail = out.error_count > 0;
if (gate !== null && !(out.sizes['7d'].ratio <= gate)) { console.error(`gate: 7-day ratio ${out.sizes['7d'].ratio} > ${gate}`); fail = true; }
process.exit(fail ? 1 : 0);
