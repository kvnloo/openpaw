// OpenPaw illustrative reactivity model (v0, open, deterministic).
//
// Purpose: explain, on the landing page, how distance, trigger stacking, sleep and the
// timing of an intervention shape one reaction episode. The parameters are made up.
// The real product fits per-dog curves to recorded episodes and expert annotations;
// nothing here is a diagnosis or a claim about what a dog feels.
//
// Model: arousal a(t) in [0, 1].
//   calm c          = rest + sleep penalty (this dog's calm level today)
//   baseline b(t)   = c + residual from the previous trigger, decaying with a half-life (stacking)
//   stimulus s(t)   = logistic in distance, ramped in as the trigger approaches; 0 once removed
//   target          = min(1, b(t) + s(t))
// Recovery = time from peak until arousal is back within 0.08 of the CALM level c, so a
// stacked episode pays for the residual too.
//   da/dt           = (target - a) / tau,  tau = tauRise when rising, tauRecover when falling
// Envelope states use the same names as the OpenPaw protocol:
//   baseline < b + 0.08 <= elevated < threshold - 0.1 <= near_threshold < threshold <= over_threshold
// SPDX-License-Identifier: GPL-3.0-only

export const MODEL_VERSION = 'openpaw-illustrative-reactivity/0.1';

export const DEFAULTS = Object.freeze({
  rest: 0.12,            // calm baseline on a good day
  threshold: 0.62,       // above this the dog is "over threshold" (lunging, barking)
  d50: 28,               // ft: distance where a trigger delivers half its push
  dk: 6,                 // ft: steepness of the distance response
  push: 0.9,             // max push from a very close trigger
  tauRise: 2.2,          // s
  tauRecover: 70,        // s: slow come-down is the point
  sleepPenalty: 0.10,    // added to baseline after a short night
  stackHalfLife: 6,      // min: residual arousal from the last trigger halves every 6 min
  stackPeak: 0.42,       // residual just after a previous episode
  dt: 0.5,               // s
  duration: 600,         // s simulated
  triggerAt: 30,         // s
  approachS: 5,          // s: triggers approach; the push ramps in over this time (smoothstep)
});

export function stimulus(distanceFt, p = DEFAULTS) {
  return p.push / (1 + Math.exp((distanceFt - p.d50) / p.dk));
}

export function calmFor({ sleep = 'good' }, p = DEFAULTS) {
  return p.rest + (sleep === 'short' ? p.sleepPenalty : 0);
}

// Baseline at the moment the trigger appears (plus tSec seconds later).
export function baselineFor({ sleep = 'good', sinceLastMin = 60 }, p = DEFAULTS, tSec = 0) {
  const stack = p.stackPeak * Math.pow(0.5, (sinceLastMin + tSec / 60) / p.stackHalfLife);
  return Math.min(0.9, calmFor({ sleep }, p) + stack);
}

export function envelopeState(a, b, p = DEFAULTS) {
  if (a >= p.threshold) return 'over_threshold';
  if (a >= p.threshold - 0.1) return 'near_threshold';
  if (a >= b + 0.08) return 'elevated';
  return 'baseline';
}

// inputs: { distanceFt, sinceLastMin, interveneAfterS, sleep }
// interveneAfterS: seconds after the trigger appears when the handler creates distance
// (U-turn / break line of sight). The trigger then stops pushing.
export function simulate(inputs, params = {}) {
  const p = { ...DEFAULTS, ...params };
  const { distanceFt = 25, sinceLastMin = 60, interveneAfterS = 6, sleep = 'good' } = inputs;
  const c = calmFor({ sleep }, p);
  const b = baselineFor({ sleep, sinceLastMin }, p);  // at trigger time
  const s = stimulus(distanceFt, p);
  const n = Math.round(p.duration / p.dt) + 1;
  const t = new Float64Array(n), a = new Float64Array(n);
  const states = new Array(n);
  let x = baselineFor({ sleep, sinceLastMin }, p, -p.triggerAt), peak = x, peakT = 0, over = 0, firstOver = null;
  const removeAt = p.triggerAt + interveneAfterS;
  for (let i = 0; i < n; i++) {
    const ti = i * p.dt;
    const present = ti >= p.triggerAt && ti < removeAt;
    const bt = baselineFor({ sleep, sinceLastMin }, p, ti - p.triggerAt);
    const k = Math.min(1, Math.max(0, (ti - p.triggerAt) / p.approachS));
    const ramp = k * k * (3 - 2 * k);
    const target = Math.min(1, bt + (present ? s * ramp : 0));
    const tau = target > x ? p.tauRise : p.tauRecover;
    if (i > 0) x += (target - x) * (1 - Math.exp(-p.dt / tau));
    t[i] = ti; a[i] = x;
    states[i] = envelopeState(x, c, p);
    if (x > peak) { peak = x; peakT = ti; }
    if (x >= p.threshold) { over += p.dt; if (firstOver === null) firstOver = ti; }
  }
  // recovery: from peak until back within 0.08 of the calm level c; null if not within the window
  let recoveryS = null;
  if (peak >= c + 0.08) {
    for (let i = Math.round(peakT / p.dt); i < n; i++) {
      if (a[i] < c + 0.08) { recoveryS = t[i] - peakT; break; }
    }
  } else recoveryS = 0;
  return {
    version: MODEL_VERSION,
    params: p,
    baseline: b,
    calm: c,
    stimulus: s,
    t, a, states,
    peak, peakT,
    overThresholdS: over,
    firstOverS: firstOver === null ? null : firstOver - p.triggerAt,
    recoveryS,
    removeAt,
  };
}

export function fmtDuration(s) {
  if (s === null) return '> 10 min';
  s = Math.round(s);
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60), r = s - m * 60;
  return r ? `${m} min ${r} s` : `${m} min`;
}

// Deterministic 8-week "protocol" series (simulated) for the scoreboard.
export function protocolWeeks() {
  const weeks = [];
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let w = 1; w <= 8; w++) {
    const k = (w - 1) / 7;
    weeks.push({
      week: `W${w}`,
      thresholdFt: Math.round(32 - 15 * k + (rnd() - 0.5) * 3),       // closer is better
      recoveryS: Math.round(560 - 360 * k + (rnd() - 0.5) * 60),
      episodes: Math.max(1, Math.round(11 - 7 * k + (rnd() - 0.5) * 2)),
      stacked: Math.max(0, Math.round(4 - 3.4 * k + (rnd() - 0.5))),
    });
  }
  return weeks;
}
