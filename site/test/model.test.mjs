// node --test site/test/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulate, stimulus, baselineFor, envelopeState, fmtDuration, protocolWeeks, DEFAULTS } from '../reactivity-model.js';

test('closer triggers push harder (monotone in distance)', () => {
  for (let d = 5; d < 80; d += 5) assert.ok(stimulus(d) > stimulus(d + 5));
  assert.ok(Math.abs(stimulus(DEFAULTS.d50) - DEFAULTS.push / 2) < 1e-9);
});

test('far trigger on a good day stays under threshold and recovers', () => {
  const r = simulate({ distanceFt: 60, sinceLastMin: 120, interveneAfterS: 10, sleep: 'good' });
  assert.ok(r.peak < DEFAULTS.threshold, `peak ${r.peak}`);
  assert.equal(r.overThresholdS, 0);
  assert.ok(r.recoveryS !== null);
});

test('close trigger crosses threshold', () => {
  const r = simulate({ distanceFt: 12, sinceLastMin: 120, interveneAfterS: 8, sleep: 'good' });
  assert.ok(r.peak >= DEFAULTS.threshold);
  assert.ok(r.overThresholdS > 0);
  assert.ok(r.firstOverS >= 0 && r.firstOverS < 8);
});

test('creating distance sooner lowers peak and shortens recovery', () => {
  const late = simulate({ distanceFt: 22, sinceLastMin: 60, interveneAfterS: 20 });
  const early = simulate({ distanceFt: 22, sinceLastMin: 60, interveneAfterS: 3 });
  assert.ok(early.peak < late.peak);
  assert.ok(early.overThresholdS < late.overThresholdS);
  assert.ok(early.recoveryS <= late.recoveryS);
});

test('trigger stacking raises baseline and makes the same trigger worse', () => {
  assert.ok(baselineFor({ sinceLastMin: 2 }) > baselineFor({ sinceLastMin: 60 }));
  const fresh = simulate({ distanceFt: 30, sinceLastMin: 90, interveneAfterS: 6 });
  const stacked = simulate({ distanceFt: 30, sinceLastMin: 3, interveneAfterS: 6 });
  assert.ok(stacked.peak > fresh.peak);
  assert.ok(stacked.overThresholdS >= fresh.overThresholdS);
  assert.ok(stacked.recoveryS === null || stacked.recoveryS > fresh.recoveryS, `stacked ${stacked.recoveryS} vs fresh ${fresh.recoveryS}`);
});

test('short sleep raises baseline', () => {
  assert.ok(baselineFor({ sleep: 'short', sinceLastMin: 60 }) > baselineFor({ sleep: 'good', sinceLastMin: 60 }));
});

test('envelope states are ordered and named like the protocol', () => {
  const b = 0.12;
  assert.equal(envelopeState(0.13, b), 'baseline');
  assert.equal(envelopeState(0.3, b), 'elevated');
  assert.equal(envelopeState(0.55, b), 'near_threshold');
  assert.equal(envelopeState(0.7, b), 'over_threshold');
});

test('simulation is deterministic and arrays line up', () => {
  const x = simulate({ distanceFt: 20 }), y = simulate({ distanceFt: 20 });
  assert.deepEqual([...x.a], [...y.a]);
  assert.equal(x.t.length, x.a.length);
  assert.equal(x.states.length, x.a.length);
});

test('formatting and protocol series', () => {
  assert.equal(fmtDuration(42), '42 s');
  assert.equal(fmtDuration(260), '4 min 20 s');
  assert.equal(fmtDuration(null), '> 10 min');
  assert.equal(fmtDuration(59.6), '1 min');
  const w = protocolWeeks();
  assert.equal(w.length, 8);
  assert.ok(w[7].thresholdFt < w[0].thresholdFt, 'dog tolerates closer triggers by week 8');
  assert.ok(w[7].recoveryS < w[0].recoveryS);
  assert.deepEqual(protocolWeeks(), w, 'deterministic');
});
