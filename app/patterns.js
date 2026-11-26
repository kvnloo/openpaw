// OpenPaw pattern finder: turns a dog's event history into daily series and looks for
// patterns worth asking a professional about. Pure functions, no DOM, deterministic.
//
// Honesty rules baked in:
//  - associations, never causes ("on days with more play, fewer episodes"), with n and q shown;
//  - multiple-comparison control (Benjamini-Hochberg) so trying many trackers doesn't invent patterns;
//  - minimum data before anything is claimed; findings carry the evidence days.
// SPDX-License-Identifier: GPL-3.0-only

export const ENGINE_VERSION = 'openpaw-patterns/0.3';
// Benjamini-Hochberg cut, and the permutation count Track runs it with. They go together: with 499
// permutations the smallest p is 0.002, which caps how low any q can get; 1999 lifts that floor so a
// 0.07 cut keeps the real findings (measured on simulated histories, factory climb r26).
export const DEFAULT_MAX_Q = 0.07;
export const APP_PERMS = 1999;

// Default trackers. Owners can add any others ("whatever I wanna track").
// type: count | quantity | duration | scale | check
export const TEMPLATES = [
  { id: 'meal', name: 'Meal', type: 'quantity', unit: 'cups', category: 'food', quick: [0.5, 1, 1.5, 2], timing: true },
  { id: 'treats', name: 'Treats', type: 'count', unit: 'treats', category: 'food', quick: [1, 3, 5] },
  { id: 'water', name: 'Water', type: 'quantity', unit: 'cups', category: 'food', quick: [1, 2] },
  { id: 'walk', name: 'Walk', type: 'duration', unit: 'min', category: 'activity', quick: [15, 30, 45, 60] },
  { id: 'sniff', name: 'Sniff time', type: 'duration', unit: 'min', category: 'activity', quick: [10, 20, 30] },
  { id: 'play', name: 'Play', type: 'duration', unit: 'min', category: 'activity', quick: [10, 20, 30, 45] },
  { id: 'training', name: 'Training', type: 'duration', unit: 'min', category: 'activity', quick: [5, 10, 15] },
  { id: 'episode', name: 'Episode', type: 'scale', unit: 'intensity 1-5', category: 'behavior', quick: [1, 2, 3, 4, 5], count: true },
  { id: 'energy', name: 'Energy', type: 'scale', unit: '1-5', category: 'state', quick: [1, 2, 3, 4, 5] },
  { id: 'alertness', name: 'Alertness', type: 'scale', unit: '1-5', category: 'state', quick: [1, 2, 3, 4, 5] },
  { id: 'sleep', name: 'Sleep quality', type: 'scale', unit: '1-5', category: 'state', quick: [1, 2, 3, 4, 5] },
  { id: 'medication', name: 'Medication', type: 'quantity', unit: 'dose', category: 'health', quick: [1], timing: true },
  { id: 'visitors', name: 'Visitors', type: 'count', unit: 'people', category: 'context', quick: [1, 2, 4] },
];

export function slug(s) { return String(s).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'item'; }
export function metricFor(tracker) { return `track.${tracker.id}`; }

// ---------- daily series ----------
export function dayKey(ts, tzOffsetMin = 0) {
  const d = new Date(Date.parse(ts) - tzOffsetMin * 60000);
  return d.toISOString().slice(0, 10);
}
export function minutesOfDay(ts, tzOffsetMin = 0) {
  const d = new Date(Date.parse(ts) - tzOffsetMin * 60000);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

// One episode = one episode_id (Field mode groups trigger/reaction/calm under one id). Logged
// "track.episode" entries without an id each count once. Other episode-linked events are not separate episodes.
const isEpisode = (e) => !!e.payload && e.payload.metric === 'track.episode';
const episodeKey = (e) => (e.episode_id ? `id:${e.episode_id}` : (isEpisode(e) ? `ev:${e.event_id || e.timestamp}` : null));

// Returns { days: [YYYY-MM-DD...], series: { key: { label, values: (number|null)[] , type } } }
// tzOffsetMin follows Date.getTimezoneOffset() (minutes behind UTC, e.g. 360 for CST).
export function dailySeries(events, { trackers = TEMPLATES, tzOffsetMin = 0, from = null, to = null } = {}) {
  const ev = events.filter((e) => e && e.timestamp && e.payload);
  if (!ev.length) return { days: [], series: {} };
  const keys = ev.map((e) => dayKey(e.timestamp, tzOffsetMin)).sort();
  const start = from || keys[0], end = to || keys[keys.length - 1];
  const days = [];
  for (let d = new Date(`${start}T00:00:00Z`); d.toISOString().slice(0, 10) <= end; d.setUTCDate(d.getUTCDate() + 1)) days.push(d.toISOString().slice(0, 10));
  const idx = new Map(days.map((d, i) => [d, i]));
  const byMetric = new Map(trackers.map((t) => [metricFor(t), t]));
  const acc = {};
  const add = (key, label, type, i, v, how) => {
    if (!acc[key]) acc[key] = { label, type, how, sum: new Array(days.length).fill(null), n: new Array(days.length).fill(0) };
    const a = acc[key];
    a.sum[i] = (a.sum[i] ?? 0) + v; a.n[i] += 1;
  };
  const activeDays = new Array(days.length).fill(false);
  const seenEp = new Set();
  for (const e of ev) {
    const i = idx.get(dayKey(e.timestamp, tzOffsetMin));
    if (i === undefined) continue;
    activeDays[i] = true;
    const m = e.payload.metric, v = e.payload.value;
    const ek = episodeKey(e);
    if (ek) {
      if (!seenEp.has(ek)) { seenEp.add(ek); add('episodes', 'Episodes', 'count', i, 1, 'sum'); }
      if (typeof v === 'number' && m === 'track.episode') add('episode_intensity', 'Episode intensity', 'scale', i, v, 'mean');
      if (typeof e.payload.time_to_calm_s === 'number') add('time_to_calm', 'Time to calm (s)', 'duration', i, e.payload.time_to_calm_s, 'mean');
      continue;
    }
    const t = byMetric.get(m);
    if (t && typeof v === 'number') {
      const how = t.type === 'scale' ? 'mean' : 'sum';
      add(t.id, t.name, t.type, i, t.type === 'check' ? (v ? 1 : 0) : v, how);
      if (t.timing) add(`${t.id}_first_time`, `${t.name} time (first)`, 'time', i, minutesOfDay(e.timestamp, tzOffsetMin), 'min');
      continue;
    }
    if (m === 'movement.vedba_mean' && typeof v === 'number') add('collar_activity', 'Collar movement', 'sensor', i, v, 'mean');
    else if (m === 'movement.bursts' && typeof v === 'number') add('collar_bursts', 'Collar bursts', 'sensor', i, v, 'sum');
  }
  const series = {};
  for (const [key, a] of Object.entries(acc)) {
    const values = a.sum.map((s, i) => {
      if (a.how === 'mean') return a.n[i] ? s / a.n[i] : null;
      if (a.how === 'min') return a.n[i] ? s / a.n[i] : null;
      // sums: a logged day with no entry of this kind counts as 0 only if the owner logged anything that day
      return a.n[i] ? s : (activeDays[i] ? 0 : null);
    });
    if (a.how === 'min') { // first time of day: recompute as true minimum
      values.forEach((_, i) => { values[i] = null; });
    }
    series[key] = { label: a.label, type: a.type, values };
  }
  // first-time-of-day series need the min, not the mean
  for (const t of trackers.filter((x) => x.timing)) {
    const key = `${t.id}_first_time`;
    if (!series[key]) continue;
    const vals = new Array(days.length).fill(null);
    for (const e of ev) {
      if (e.payload.metric !== metricFor(t)) continue;
      const i = idx.get(dayKey(e.timestamp, tzOffsetMin)); if (i === undefined) continue;
      const mm = minutesOfDay(e.timestamp, tzOffsetMin);
      vals[i] = vals[i] === null ? mm : Math.min(vals[i], mm);
    }
    series[key].values = vals;
  }
  return { days, series };
}

// ---------- statistics ----------
export function rng(seed = 1) { let s = seed >>> 0 || 1; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); }

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
export function spearman(x, y) { return pearson(ranks(x), ranks(y)); }

// Ranks of y with the linear effect of c's ranks removed (rank partial: y | c).
function rankResidual(y, c) {
  const ry = ranks(y), rc = ranks(c), n = y.length;
  let mc = 0, my = 0;
  for (let i = 0; i < n; i++) { mc += rc[i]; my += ry[i]; }
  mc /= n; my /= n;
  let scy = 0, scc = 0;
  for (let i = 0; i < n; i++) { scy += (rc[i] - mc) * (ry[i] - my); scc += (rc[i] - mc) ** 2; }
  const b = scc ? scy / scc : 0;
  return ry.map((v, i) => v - my - b * (rc[i] - mc));
}

// Two-sided permutation p-value for Spearman's rho (deterministic seed).
// yRanked: y is already a rank residual (partial test), use it as is.
export function permutationP(x, y, rho, { perms = 999, seed = 7, yRanked = false } = {}) {
  const rx = ranks(x), ry = (yRanked ? y : ranks(y)).slice(), r = rng(seed);
  let hits = 0;
  for (let p = 0; p < perms; p++) {
    for (let i = ry.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [ry[i], ry[j]] = [ry[j], ry[i]]; }
    if (Math.abs(pearson(rx, ry)) >= Math.abs(rho) - 1e-12) hits++;
  }
  return (hits + 1) / (perms + 1);
}

export function benjaminiHochberg(ps) {
  const m = ps.length, o = ps.map((p, i) => [p, i]).sort((a, b) => a[0] - b[0]);
  const q = new Array(m); let prev = 1;
  for (let k = m - 1; k >= 0; k--) { const [p, i] = o[k]; prev = Math.min(prev, (p * m) / (k + 1)); q[i] = prev; }
  return q;
}

const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
const median = (a) => { const s = a.slice().sort((x, y) => x - y); const h = s.length >> 1; return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2; };
const fmtNum = (v) => (Math.abs(v) >= 10 ? Math.round(v).toString() : (Math.round(v * 10) / 10).toString());
const fmtClock = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(Math.round(m % 60)).padStart(2, '0')}`;

// ---------- findings ----------
// targets: series keys we try to explain (episodes, energy, alertness ...). Every other series is a candidate factor,
// same day and previous day ("lag 1").
export function findPatterns(events, opts = {}) {
  const { minDays = 14, maxQ = DEFAULT_MAX_Q, minAbsRho = 0.3, perms = 999, tzOffsetMin = 0, trackers = TEMPLATES } = opts;
  const { days, series } = dailySeries(events, { trackers, tzOffsetMin });
  const targets = (opts.targets || ['episodes', 'energy', 'alertness', 'episode_intensity', 'time_to_calm']).filter((k) => series[k]);
  const findings = [];
  const tests = [];
  const sameDay = new Set(); // a same-day pair of two targets is one question: test (and report) it once
  for (const tk of targets) {
    for (const [fk, f] of Object.entries(series)) {
      if (fk === tk || ((tk.startsWith('episode') || tk === 'time_to_calm') && (fk.startsWith('episode') || fk === 'time_to_calm'))) continue;
      for (const lag of [0, 1]) {
        if (lag === 0) {
          const pair = [tk, fk].sort().join('|');
          if (sameDay.has(pair)) continue;
          sameDay.add(pair);
        }
        const xs = [], ys = [], used = [];
        for (let i = lag; i < days.length; i++) {
          const xv = f.values[i - lag], yv = series[tk].values[i];
          if (xv === null || yv === null) continue;
          xs.push(xv); ys.push(yv); used.push(days[i]);
        }
        if (xs.length < minDays) continue;
        if (new Set(xs).size < 3 || new Set(ys).size < 2) continue;
        const rho = spearman(xs, ys);
        tests.push({ tk, fk, lag, xs, ys, used, rho });
      }
    }
  }
  tests.forEach((t, k) => { t.p = permutationP(t.xs, t.ys, t.rho, { perms, seed: 101 + k }); });
  let qs = benjaminiHochberg(tests.map((t) => t.p));
  tests.forEach((t, k) => { t.q = qs[k]; });
  // A strong factor can hide a weaker one (lots of play on a day swamps last night's sleep). Per target,
  // hold the strongest factor that already passes fixed and re-test the others on the target's rank
  // residual. Only factors already visible unadjusted (p <= .05, same direction) are re-tested, so a
  // factor can't appear only after adjustment; the family size (BH) stays the same.
  const control = new Map();
  for (const t of tests) {
    if (t.q > maxQ || Math.abs(t.rho) < minAbsRho) continue;
    if (!control.has(t.tk) || Math.abs(control.get(t.tk).rho) < Math.abs(t.rho)) control.set(t.tk, t);
  }
  if (control.size) {
    const dayIdx = new Map(days.map((d, i) => [d, i]));
    tests.forEach((t, k) => {
      const c = control.get(t.tk);
      if (!c || c.fk === t.fk || t.p > 0.05) return;
      const xs = [], ys = [], cs = [], used = [];
      t.used.forEach((d, j) => {
        const i = dayIdx.get(d) - c.lag, cv = i >= 0 ? series[c.fk].values[i] : null;
        if (cv === null || cv === undefined) return;
        xs.push(t.xs[j]); ys.push(t.ys[j]); cs.push(cv); used.push(d);
      });
      if (xs.length < minDays || new Set(cs).size < 2) return;
      const e = rankResidual(ys, cs);
      const rho = pearson(ranks(xs), e);
      if (Math.sign(rho) !== Math.sign(t.rho)) return;
      const p = permutationP(xs, e, rho, { perms, seed: 101 + k, yRanked: true });
      Object.assign(t, { xs, ys, used, rho, p, adjustedFor: { factor: c.fk, lag: c.lag } });
    });
    qs = benjaminiHochberg(tests.map((t) => t.p));
    tests.forEach((t, k) => { t.q = qs[k]; });
  }
  // keep the stronger lag per (target, factor) pair
  const best = new Map();
  for (const t of tests) {
    if (t.q > maxQ || Math.abs(t.rho) < minAbsRho) continue;
    const key = `${t.tk}|${t.fk}`;
    if (!best.has(key) || best.get(key).q > t.q) best.set(key, t);
  }
  for (const t of best.values()) {
    const fl = series[t.fk].label, tl = series[t.tk].label;
    const med = median(t.xs);
    const hi = [], lo = [];
    t.xs.forEach((x, i) => (x > med ? hi : lo).push(t.ys[i]));
    if (!hi.length || !lo.length) continue;
    const mh = mean(hi), ml = mean(lo);
    const when = t.lag ? 'the day after' : 'on';
    const isTime = series[t.fk].type === 'time';
    const factorHi = isTime ? `${fl.toLowerCase()} later than ${fmtClock(med)}` : `${fl.toLowerCase()} above ${fmtNum(med)}${unitOf(t.fk, trackers)}`;
    findings.push({
      id: `assoc:${t.tk}:${t.fk}:${t.lag}`,
      kind: 'association',
      target: t.tk, factor: t.fk, lag: t.lag,
      title: `${tl} ${t.rho < 0 ? 'lower' : 'higher'} ${when} days with ${factorHi}`,
      detail: `${tl}: ${fmtNum(mh)} vs ${fmtNum(ml)} per day (${hi.length} vs ${lo.length} days). Spearman ρ = ${t.rho.toFixed(2)}${t.adjustedFor ? ` allowing for ${series[t.adjustedFor.factor].label.toLowerCase()} ${t.adjustedFor.lag ? 'the day before' : 'on the same day'}` : ''}, q = ${t.q.toFixed(3)}.`,
      rho: t.rho, q: t.q, n: t.xs.length, days: t.used,
      ...(t.adjustedFor ? { adjustedFor: t.adjustedFor } : {}),
      split: { high: mh, low: ml, nHigh: hi.length, nLow: lo.length, cut: med },
      strength: Math.abs(t.rho) * (1 - t.q),
      caveat: 'An association in your own logs, not proof of cause. Try changing one thing for two weeks and see if it holds.',
    });
  }
  findings.push(...timingFindings(events, { tzOffsetMin }));
  findings.push(...trendFindings(days, series, targets));
  findings.sort((a, b) => b.strength - a.strength);
  return { version: ENGINE_VERSION, days, series, tested: tests.length, findings };
}

function unitOf(key, trackers) {
  const t = trackers.find((x) => x.id === key);
  if (!t || !t.unit) return '';
  if (t.type === 'scale') return '';
  return ` ${t.unit}`;
}

// Episodes clustered in a time-of-day window (3-hour blocks, binomial tail vs uniform over waking hours 06-24).
export function timingFindings(events, { tzOffsetMin = 0, minEpisodes = 10 } = {}) {
  const first = new Map();
  for (const e of events) { const k = e && e.payload ? episodeKey(e) : null; if (k && (!first.has(k) || first.get(k).timestamp > e.timestamp)) first.set(k, e); }
  const eps = [...first.values()];
  if (eps.length < minEpisodes) return [];
  const blocks = new Array(6).fill(0); // 06-09, 09-12, ... 21-24
  let inWaking = 0;
  for (const e of eps) { const m = minutesOfDay(e.timestamp, tzOffsetMin); if (m >= 360) { blocks[Math.floor((m - 360) / 180)]++; inWaking++; } }
  if (inWaking < minEpisodes) return [];
  const maxB = blocks.indexOf(Math.max(...blocks));
  const k = blocks[maxB], n = inWaking, p0 = 1 / 6;
  const tail = binomTail(n, k, p0) * 6; // Bonferroni over 6 blocks
  if (tail > 0.05 || k < 5) return [];
  const startH = 6 + maxB * 3;
  return [{
    id: `timing:episodes:${startH}`,
    kind: 'timing',
    title: `Episodes cluster between ${String(startH).padStart(2, '0')}:00 and ${String(startH + 3).padStart(2, '0')}:00`,
    detail: `${k} of ${n} daytime episodes (${Math.round((k / n) * 100)}%) fall in this 3-hour window; an even spread would put about ${Math.round(n / 6)} there. p ≈ ${Math.min(1, tail).toFixed(3)} (adjusted).`,
    blocks, n, strength: (k / n) * (1 - Math.min(1, tail)),
    caveat: 'Check what usually happens then (walk route, school traffic, deliveries).',
  }];
}
function binomTail(n, k, p) { // P(X >= k)
  let s = 0, c = 1;
  for (let i = 0; i <= n; i++) { if (i > 0) c = (c * (n - i + 1)) / i; if (i >= k) s += c * Math.pow(p, i) * Math.pow(1 - p, n - i); }
  return s;
}

// Week-over-week trend for targets (first 2 weeks vs last 2 weeks, Mann-Whitney style via ranks).
export function trendFindings(days, series, targets) {
  const out = [];
  if (days.length < 28) return out;
  for (const tk of targets) {
    const v = series[tk].values;
    const a = v.slice(0, 14).filter((x) => x !== null), b = v.slice(-14).filter((x) => x !== null);
    if (a.length < 8 || b.length < 8) continue;
    const ma = mean(a), mb = mean(b);
    if (Math.abs(mb - ma) < 0.15 * Math.max(Math.abs(ma), 0.5)) continue;
    const all = a.concat(b), r = ranks(all);
    const ra = r.slice(0, a.length).reduce((s, x) => s + x, 0);
    const u = ra - (a.length * (a.length + 1)) / 2, mu = (a.length * b.length) / 2;
    const sd = Math.sqrt((a.length * b.length * (a.length + b.length + 1)) / 12);
    const z = Math.abs(u - mu) / sd;
    if (z < 2.81) continue; // ~ p < .005 two-sided: Bonferroni-safe across a handful of targets
    out.push({
      id: `trend:${tk}`, kind: 'trend',
      title: `${series[tk].label} ${mb < ma ? 'down' : 'up'}: ${fmtNum(ma)} → ${fmtNum(mb)} per day`,
      detail: `First two weeks vs last two weeks of your log (z = ${z.toFixed(1)}).`,
      strength: Math.min(1, z / 4) * 0.8,
      caveat: 'Trends mix many changes at once; your notes say what changed.',
    });
  }
  return out;
}

// ---------- synthetic demo history (labelled simulated) ----------
// Planted: less play -> more episodes the same day; poor sleep -> more episodes the next day;
// more walking -> higher energy-at-rest... Medication timing and treats are planted as NO effect (negative controls).
export function demoHistory({ days = 70, seed = 3, dog = 'demo-dog', start = '2026-09-01', tzOffsetMin = 0 } = {}) {
  const r = rng(seed), ev = [];
  let n = 0;
  const at = (d, minutes) => new Date(Date.parse(`${d}T00:00:00Z`) + (minutes + tzOffsetMin) * 60000).toISOString();
  const push = (d, minutes, metric, value, kind = 'observation', unit = null) => ev.push({
    schema_version: '0.1', event_id: `sim:${seed}:${n++}`, dog_id: dog, timestamp: at(d, minutes), episode_id: null, event_type: kind,
    provenance: { origin: 'simulated', source_id: 'demo-history', algorithm_version: ENGINE_VERSION, confidence: null, evidence_event_ids: [] },
    payload: { metric, value, unit, note: null },
  });
  const poisson = (lam) => { let L = Math.exp(-lam), k = 0, p = 1; do { k++; p *= r(); } while (p > L); return k - 1; };
  let prevSleep = 4;
  for (let i = 0; i < days; i++) {
    const d = new Date(Date.parse(`${start}T00:00:00Z`) + i * 86400000).toISOString().slice(0, 10);
    const sleep = 1 + Math.floor(r() * 5);
    const play = Math.round(5 + r() * 55);
    const walk = Math.round(20 + r() * 50);
    const treats = Math.floor(r() * 8);
    push(d, 7 * 60 + Math.floor(r() * 30), 'track.sleep', sleep);
    push(d, 7 * 60 + 15 + Math.floor(r() * 45), 'track.meal', 1.5, 'context', 'cups');
    push(d, 17 * 60 + 30 + Math.floor(r() * 90), 'track.meal', 1.5, 'context', 'cups');
    push(d, 8 * 60 + Math.floor(r() * 240), 'track.medication', 1, 'intervention', 'dose'); // random time, no effect
    push(d, 9 * 60 + Math.floor(r() * 300), 'track.play', play, 'context', 'min');
    push(d, 16 * 60 + Math.floor(r() * 60), 'track.walk', walk, 'context', 'min');
    if (treats) push(d, 12 * 60, 'track.treats', treats, 'context', 'treats');
    const energy = Math.max(1, Math.min(5, Math.round(1.5 + walk / 25 + (r() - 0.5) * 1.2)));
    push(d, 20 * 60, 'track.energy', energy);
    const lam = 0.5 + (play < 25 ? 1.6 : 0) + (prevSleep <= 2 ? 1.1 : 0);
    const k = poisson(lam);
    for (let j = 0; j < k; j++) {
      const evening = r() < 0.7;
      push(d, evening ? 16 * 60 + Math.floor(r() * 180) : 7 * 60 + Math.floor(r() * 600), 'track.episode', 1 + Math.floor(r() * 5));
    }
    prevSleep = sleep;
  }
  return ev;
}
