// Bench: findPatterns wall time, reference vs candidate patterns.js, alternating ABAB arms.
// usage: node tools/bench-patterns.mjs <ref/patterns.js> <cand/patterns.js> [--gate 0.7] [--rounds 7]
// Sizes are 30, 90 and 365-day simulated histories (seeds 3,5,9,12,21) at Track's settings
// (APP_PERMS, DEFAULT_MAX_Q). Every call's output is compared between the arms: any difference is an
// error and the run exits 1. With --gate R it also exits 1 unless the 90-day candidate median is
// <= R x the reference median.
// SPDX-License-Identifier: GPL-3.0-only
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
const flag = (name, dflt) => { const i = args.indexOf(name); return i >= 0 ? Number(args[i + 1]) : dflt; };
const [refPath, candPath] = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
if (!refPath || !candPath) { console.error('usage: node tools/bench-patterns.mjs <ref/patterns.js> <cand/patterns.js> [--gate R] [--rounds N]'); process.exit(2); }
const gate = flag('--gate', null), rounds = flag('--rounds', 7);
const load = (p) => import(pathToFileURL(resolve(p)).href + `?arm=${encodeURIComponent(p)}`);
const A = await load(refPath), B = await load(candPath);
const opts = { perms: A.APP_PERMS, maxQ: A.DEFAULT_MAX_Q };
const sizes = [30, 90, 365], seeds = [3, 5, 9, 12, 21];
const med = (a) => { const s = a.slice().sort((x, y) => x - y); const h = s.length >> 1; return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2; };
const out = { opts, rounds, sizes: {}, error_count: 0 };
for (const days of sizes) {
  const hs = seeds.map((seed) => A.demoHistory({ days, seed }));
  const t = { ref: [], cand: [] }; let work = 0;
  for (let r = 0; r < rounds; r++) {
    for (const arm of r % 2 ? ['cand', 'ref'] : ['ref', 'cand']) {
      const lib = arm === 'ref' ? A : B;
      const s = performance.now();
      const res = hs.map((h) => lib.findPatterns(h, opts));
      t[arm].push(performance.now() - s);
      if (arm === 'cand') work += res.reduce((n, x) => n + x.tested, 0);
      if (r === 0 && arm === 'cand') {
        const ref = hs.map((h) => JSON.stringify(A.findPatterns(h, opts)));
        res.forEach((x, k) => { if (JSON.stringify(x) !== ref[k]) { out.error_count++; console.error(`output differs: ${days} days seed ${seeds[k]}`); } });
      }
    }
  }
  const ref = med(t.ref) / seeds.length, cand = med(t.cand) / seeds.length;
  out.sizes[days] = { ref_ms: +ref.toFixed(2), cand_ms: +cand.toFixed(2), ratio: +(cand / ref).toFixed(3), work_count: work };
}
console.log(JSON.stringify(out, null, 1));
let fail = out.error_count > 0;
if (gate !== null && !(out.sizes[90].ratio <= gate)) { console.error(`gate: 90-day ratio ${out.sizes[90].ratio} > ${gate}`); fail = true; }
process.exit(fail ? 1 : 0);
