// Differential guard for permutationP: the shipped function must return exactly the p-values of the
// straightforward version below (shuffle, then a full Pearson on the ranks every permutation).
// Ranks are multiples of 0.5, so the centred sums are exact in doubles and a faster rank path can
// match bit for bit; the yRanked (rank residual) path must match too.
// SPDX-License-Identifier: GPL-3.0-only
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { permutationP, spearman, rng, findPatterns, demoHistory, APP_PERMS, DEFAULT_MAX_Q } from '../patterns.js';

function ranks(xs) {
  const o = xs.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
  const r = new Array(xs.length);
  for (let i = 0; i < o.length;) {
    let j = i; while (j + 1 < o.length && o[j + 1][0] === o[i][0]) j++;
    const avg = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) r[o[k][1]] = avg;
    i = j + 1;
  }
  return r;
}
function pearson(a, b) {
  const n = a.length; let ma = 0, mb = 0;
  for (let i = 0; i < n; i++) { ma += a[i]; mb += b[i]; }
  ma /= n; mb /= n;
  let sab = 0, saa = 0, sbb = 0;
  for (let i = 0; i < n; i++) { const da = a[i] - ma, db = b[i] - mb; sab += da * db; saa += da * da; sbb += db * db; }
  return saa && sbb ? sab / Math.sqrt(saa * sbb) : 0;
}
function refP(x, y, rho, { perms = 999, seed = 7, yRanked = false } = {}) {
  const rx = ranks(x), ry = (yRanked ? y : ranks(y)).slice(), r = rng(seed);
  let hits = 0;
  for (let p = 0; p < perms; p++) {
    for (let i = ry.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [ry[i], ry[j]] = [ry[j], ry[i]]; }
    if (Math.abs(pearson(rx, ry)) >= Math.abs(rho) - 1e-12) hits++;
  }
  return (hits + 1) / (perms + 1);
}

// Inputs with heavy ties (counts, 1-5 scales), constant series and lengths 14..365.
function cases() {
  const r = rng(2026), out = [];
  for (let k = 0; k < 160; k++) {
    const n = 14 + Math.floor(r() * 352), levels = [2, 3, 5, 8, 60][k % 5];
    const x = Array.from({ length: n }, () => Math.floor(r() * levels));
    const y = x.map((v) => (k % 7 === 0 ? 3 : Math.floor(r() * levels) + (k % 2 ? v : 0)));
    out.push({ x, y, seed: 101 + k });
  }
  return out;
}

test('permutationP matches the full-Pearson reference exactly on 160 tied and untied inputs', () => {
  let diffs = 0;
  for (const { x, y, seed } of cases()) {
    const rho = spearman(x, y);
    if (permutationP(x, y, rho, { perms: 199, seed }) !== refP(x, y, rho, { perms: 199, seed })) diffs++;
  }
  assert.equal(diffs, 0);
});

test('permutationP yRanked path (rank residual) matches the reference exactly', () => {
  let diffs = 0;
  for (const { x, y, seed } of cases().slice(0, 60)) {
    const e = ranks(y).map((v, i) => v * 0.731 - (i % 5) * 0.137);
    const rho = pearson(ranks(x), e);
    if (permutationP(x, e, rho, { perms: 199, seed, yRanked: true }) !== refP(x, e, rho, { perms: 199, seed, yRanked: true })) diffs++;
  }
  assert.equal(diffs, 0);
});

// sha-free golden: tested count + every finding id and q, recorded from main 62d11d9 before the change.
const GOLDEN = {
  3: { tested: 42, findings: ['assoc:energy:walk:0 q=0.0105', 'timing:episodes:15 q=-', 'assoc:episodes:sleep:1 q=0.0105'] },
  5: { tested: 42, findings: ['assoc:energy:walk:0 q=0.007', 'timing:episodes:15 q=-', 'assoc:episodes:play:0 q=0.007', 'assoc:episodes:sleep:1 q=0.007'] },
  9: { tested: 42, findings: ['assoc:energy:walk:0 q=0.0105', 'timing:episodes:15 q=-', 'assoc:episodes:play:0 q=0.0105'] },
  12: { tested: 42, findings: ['assoc:energy:walk:0 q=0.021', 'timing:episodes:15 q=-', 'assoc:episodes:sleep:1 q=0.042'] },
  21: { tested: 42, findings: ['assoc:energy:walk:0 q=0.007', 'timing:episodes:15 q=-', 'assoc:episodes:play:0 q=0.007', 'assoc:episodes:sleep:1 q=0.007'] },
};
test('findPatterns output on the 5 frozen 90-day histories is unchanged (Track settings)', () => {
  for (const seed of [3, 5, 9, 12, 21]) {
    const r = findPatterns(demoHistory({ days: 90, seed }), { perms: APP_PERMS, maxQ: DEFAULT_MAX_Q });
    const got = { tested: r.tested, findings: r.findings.map((f) => `${f.id} q=${f.q === undefined ? '-' : f.q}`) };
    assert.deepEqual(got, GOLDEN[seed], `seed ${seed}`);
  }
});
