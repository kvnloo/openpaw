// OpenPaw collar analytics: turns collar epochs into the views the collar page draws.
// Pure functions, no DOM, deterministic. Movement levels are measurement bands, not behaviours:
// "still" is low movement, not sleep; "vigorous" is high movement, not excitement.
// SPDX-License-Identifier: GPL-3.0-only

export const ANALYTICS_VERSION = 'openpaw-collar-analytics/0.3';

// Provisional VeDBA bands (mg), fitted to Vehkaoja et al. (10.17632/vxhx934tbn.4).
// See research/calibration/RESULTS.md: walking and sniffing overlap strongly, so they share
// one "active" band (held-out 3-band macro-F1 0.914; a separate 570-585 mg band scored F1 0.004).
export const LEVELS = [
  { id: 'still', label: 'Still', max: 250 },
  { id: 'active', label: 'Active', max: 585 },
  { id: 'vigorous', label: 'Vigorous', max: Infinity },
];
export const VIGOROUS = LEVELS.length - 1;
export function levelOf(vedba) {
  for (let i = 0; i < LEVELS.length; i++) if (vedba < LEVELS[i].max) return i;
  return VIGOROUS;
}
// Minutes in every non-still band of one dayBudget row.
export const activeMinutes = (d) => d.minutes.reduce((s, m, i) => s + (i ? m : 0), 0);

// Stored OpenPaw events -> epochs [{t, vedba, max, active, bursts, pitch, roll, hr, batt, clipped, origin, w}]
export function epochsFromEvents(events) {
  const by = new Map();
  for (const e of events) {
    const p = e && e.payload;
    if (!p || typeof p.metric !== 'string') continue;
    if (!(p.metric.startsWith('movement.') || p.metric.startsWith('posture.') || p.metric === 'device.battery' || (p.metric === 'physiology.heart_rate' && e.provenance && e.provenance.device_seq !== undefined))) continue;
    const src = (e.provenance && e.provenance.source_id) || 'collar';
    const k = `${src}|${e.timestamp}`;
    let r = by.get(k);
    if (!r) { r = { t: Date.parse(e.timestamp), vedba: null, max: null, active: null, bursts: 0, pitch: null, roll: null, hr: null, batt: null, clipped: false, origin: (e.provenance && e.provenance.origin) || 'sensor', w: p.window_s || 5 }; by.set(k, r); }
    const v = p.value;
    switch (p.metric) {
      case 'movement.vedba_mean': r.vedba = v; break;
      case 'movement.vedba_max': r.max = v; break;
      case 'movement.active_fraction': r.active = v; break;
      case 'movement.bursts': r.bursts = v || 0; break;
      case 'posture.pitch': r.pitch = v; break;
      case 'posture.roll': r.roll = v; break;
      case 'physiology.heart_rate': r.hr = v; break;
      case 'device.battery': r.batt = v; break;
      default: break;
    }
    if (e.provenance && e.provenance.quality && e.provenance.quality.clipped) r.clipped = true;
  }
  return [...by.values()].filter((r) => r.vedba !== null && Number.isFinite(r.t)).sort((a, b) => a.t - b.t);
}

const DAY_MS = 864e5;
const localDay = (t, tz) => new Date(t - tz * 60000).toISOString().slice(0, 10);
// Same day and minute as the Date versions (Date truncates fractional ms), without building a Date
// per epoch: the collar page re-buckets every stored epoch on each live record.
const dayNum = (t, tz) => Math.floor(Math.trunc(t - tz * 60000) / DAY_MS);
const minuteOfDay = (t, tz) => { const x = Math.trunc(t - tz * 60000) % DAY_MS; return Math.floor((x < 0 ? x + DAY_MS : x) / 60000) + 0; };
const quantile = (xs, q) => { if (!xs.length) return null; const s = xs.slice().sort((a, b) => a - b); const i = (s.length - 1) * q, lo = Math.floor(i); return s[lo] + (s[Math.min(s.length - 1, lo + 1)] - s[lo]) * (i - lo); };

// Personal reference: resting = median of the quietest 30% of epochs; typical active = p95.
export function baseline(epochs, { now = Date.now(), days = 7 } = {}) {
  const xs = epochs.filter((e) => e.t > now - days * 864e5).map((e) => e.vedba);
  if (xs.length < 60) return null;
  const q30 = quantile(xs, 0.3);
  return { resting: quantile(xs.filter((v) => v <= q30), 0.5), active: quantile(xs, 0.95), n: xs.length };
}

// Minutes per level per local day, newest last.
export function dayBudget(epochs, { tz = 0, now = Date.now(), days = 7 } = {}) {
  const out = [];
  for (let i = days - 1; i >= 0; i--) out.push({ day: localDay(now - i * 864e5, tz), minutes: LEVELS.map(() => 0), bursts: 0, covered: 0 });
  const idx = new Map(out.map((d, i) => [dayNum(now - (days - 1 - i) * DAY_MS, tz), i]));
  for (const e of epochs) {
    const i = idx.get(dayNum(e.t, tz)); if (i === undefined) continue;
    const m = e.w / 60;
    out[i].minutes[levelOf(e.vedba)] += m; out[i].bursts += e.bursts || 0; out[i].covered += m;
  }
  return out;
}

// Mean VeDBA per time-of-day bin: `typical` over the previous `days` days, `today` for the current day.
export function circadian(epochs, { tz = 0, now = Date.now(), days = 7, binMin = 30 } = {}) {
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
  return {
    binMin,
    pastDays: past.size,
    typical: sum.map((s, i) => (cnt[i] ? s / cnt[i] : null)),
    today: tSum.map((s, i) => (tCnt[i] ? s / tCnt[i] : null)),
    nowBin: Math.floor(minuteOfDay(now, tz) / binMin),
  };
}

// Burst epochs grouped into events (bursts within `gapS` seconds belong together).
export function burstEvents(epochs, { gapS = 30 } = {}) {
  const out = [];
  for (const e of epochs) {
    if (!(e.bursts > 0)) continue;
    const last = out[out.length - 1];
    if (last && e.t - last.end <= gapS * 1000) { last.end = e.t; last.count += e.bursts; last.peak = Math.max(last.peak, e.max || 0); last.clipped ||= e.clipped; }
    else out.push({ start: e.t, end: e.t, count: e.bursts, peak: e.max || 0, clipped: e.clipped });
  }
  for (const b of out) for (const e of epochs) if (e.t >= b.start && e.t <= b.end) b.peak = Math.max(b.peak, e.max || 0);
  // settle: seconds from the burst until movement is back below the vigorous band for 60 s straight
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

// Longest unbroken still bout in a window (minutes).
export function longestStill(epochs, from, to) {
  let best = 0, run = 0, prev = null;
  for (const e of epochs) {
    if (e.t < from || e.t > to) continue;
    if (levelOf(e.vedba) === 0 && (prev === null || e.t - prev <= e.w * 1000 * 2.5)) run += e.w / 60; else run = levelOf(e.vedba) === 0 ? e.w / 60 : 0;
    best = Math.max(best, run); prev = e.t;
  }
  return best;
}

export function summary(epochs, { tz = 0, now = Date.now() } = {}) {
  const last = epochs[epochs.length - 1] || null;
  const budget = dayBudget(epochs, { tz, now, days: 8 });
  const today = budget[budget.length - 1];
  const prev = budget.slice(0, -1).filter((d) => d.covered > 60);
  const typicalActive = prev.length ? prev.reduce((s, d) => s + activeMinutes(d), 0) / prev.length : null;
  // compare today so far against the same part of a typical day
  const frac = Math.max(0.05, minuteOfDay(now, tz) / 1440);
  const bursts = burstEvents(epochs);
  const lastBurst = bursts[bursts.length - 1] || null;
  return {
    last, level: last ? levelOf(last.vedba) : null,
    activeToday: activeMinutes(today), typicalActiveSoFar: typicalActive === null ? null : typicalActive * frac,
    burstsToday: today.bursts, minutesSinceBurst: lastBurst ? Math.round((now - lastBurst.end) / 60000) : null,
    base: baseline(epochs, { now }),
    battery: [...epochs].reverse().find((e) => e.batt !== null)?.batt ?? null,
    hr: last && last.hr ? last.hr : null,
  };
}

// ---------- simulated week (labelled SIMULATED wherever it is shown; never stored) ----------
function rng(seed) { let s = seed >>> 0 || 1; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); }
export function demoWeek({ now = Date.now(), days = 7, stepS = 60, seed = 11, tz = 0 } = {}) {
  const r = rng(seed), out = [];
  const start = now - days * 864e5;
  const dayPlans = [];
  for (let d = 0; d <= days + 1; d++) {
    dayPlans.push({
      wake: 6 * 60 + 15 + Math.floor(r() * 60), sleep: 22 * 60 + Math.floor(r() * 70),
      walk1: 7 * 60 + Math.floor(r() * 50), walk1Len: 30 + Math.floor(r() * 25),
      play: 12 * 60 + Math.floor(r() * 120), playLen: 10 + Math.floor(r() * 25),
      walk2: 17 * 60 + Math.floor(r() * 60), walk2Len: 35 + Math.floor(r() * 30),
      trigger: r() < 0.75 ? Math.floor(r() * 0.8 * 40) : null,
    });
  }
  for (let t = start; t <= now; t += stepS * 1000) {
    const m = minuteOfDay(t, tz), dIdx = Math.floor((t - start) / 864e5), P = dayPlans[dIdx];
    let v, pitch = 2, burst = 0, max;
    const inWin = (a, len) => m >= a && m < a + len;
    if (m < P.wake || m >= P.sleep) { v = 6 + r() * 8 + (r() < 0.02 ? 60 + r() * 120 : 0); pitch = 8; }
    else if (inWin(P.walk1, P.walk1Len) || inWin(P.walk2, P.walk2Len)) {
      v = 260 + 140 * Math.sin(m / 3) + r() * 120; pitch = -14;
      if (P.trigger !== null && inWin(P.walk2 + P.trigger, 1)) { burst = 1 + Math.floor(r() * 3); v = 900 + r() * 400; }
      else if (P.trigger !== null && inWin(P.walk2 + P.trigger + 1, 3)) v = 520 + r() * 200;
    }
    else if (inWin(P.play, P.playLen)) { v = 600 + r() * 450; pitch = -6; }
    else { v = (r() < 0.25 ? 40 + r() * 110 : 10 + r() * 22); }
    max = burst ? 1600 + r() * 2200 : v * (1.6 + r());
    out.push({ t, vedba: Math.round(v), max: Math.round(max), active: Math.min(1, v / 400), bursts: burst, pitch, roll: 0, hr: null, batt: Math.round(92 - ((t - start) / (days * 864e5)) * 21), clipped: max > 3900, origin: 'simulated', w: stepS });
  }
  return out;
}

export function fmtMin(m) {
  if (m === null || m === undefined) return '–';
  m = Math.round(m);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`;
}
