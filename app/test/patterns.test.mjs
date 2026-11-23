import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dailySeries, findPatterns, demoHistory, spearman, benjaminiHochberg, permutationP, dayKey, minutesOfDay, TEMPLATES, slug } from '../patterns.js';

test('helpers', () => {
  assert.equal(dayKey('2026-11-23T03:00:00Z', 360), '2026-11-22', 'CST shifts to previous day');
  assert.equal(minutesOfDay('2026-11-23T18:30:00Z', 360), 12 * 60 + 30);
  assert.ok(Math.abs(spearman([1, 2, 3, 4], [10, 20, 30, 40]) - 1) < 1e-12);
  assert.ok(Math.abs(spearman([1, 2, 3, 4], [4, 3, 2, 1]) + 1) < 1e-12);
  const q = benjaminiHochberg([0.01, 0.04, 0.03, 0.5]);
  assert.ok(q[0] <= q[2] && q[2] <= q[3]);
  assert.equal(slug('Apoquel 16 mg!'), 'apoquel-16-mg');
});

test('daily series: sums, means, zero-fill only on active days, first meal time', () => {
  const mk = (ts, metric, value) => ({ timestamp: ts, event_type: 'observation', payload: { metric, value } });
  const ev = [
    mk('2026-11-01T08:00:00Z', 'track.play', 20), mk('2026-11-01T15:00:00Z', 'track.play', 10),
    mk('2026-11-01T07:10:00Z', 'track.meal', 1), mk('2026-11-01T18:00:00Z', 'track.meal', 1),
    mk('2026-11-01T20:00:00Z', 'track.energy', 4), mk('2026-11-01T21:00:00Z', 'track.energy', 2),
    mk('2026-11-03T09:00:00Z', 'track.energy', 3),
    { timestamp: '2026-11-03T17:00:00Z', event_type: 'trigger', episode_id: 'ep:a', payload: { metric: 'trigger.seen', value: '20-40' } },
    { timestamp: '2026-11-03T17:00:05Z', event_type: 'observation', episode_id: 'ep:a', payload: { metric: 'behavior.reacted', value: true } },
    { timestamp: '2026-11-03T17:01:00Z', event_type: 'observation', episode_id: 'ep:a', payload: { metric: 'behavior.calm', value: 55, time_to_calm_s: 55 } },
  ];
  const { days, series } = dailySeries(ev);
  assert.deepEqual(days, ['2026-11-01', '2026-11-02', '2026-11-03']);
  assert.deepEqual(series.play.values, [30, null, 0], 'day 2 has no logs at all -> unknown, day 3 logged other things -> 0');
  assert.deepEqual(series.energy.values, [3, null, 3]);
  assert.deepEqual(series.meal_first_time.values, [430, null, null]);
  assert.deepEqual(series.episodes.values, [0, null, 1], 'three field events of one episode = one episode');
  assert.deepEqual(series.time_to_calm.values, [null, null, 55]);
});

test('finds planted patterns in 90-day simulated histories, with honest power', () => {
  const seeds = [3, 5, 9, 12, 21];
  let play = 0, sleep = 0, energy = 0, timing = 0, negatives = 0, spuriousTrend = 0;
  for (const seed of seeds) {
    const r = findPatterns(demoHistory({ days: 90, seed }), { perms: 499 });
    const A = r.findings.filter((f) => f.kind === 'association');
    if (A.some((f) => f.target === 'episodes' && f.factor === 'play' && f.rho < 0)) play++;
    if (A.some((f) => f.target === 'episodes' && f.factor === 'sleep' && f.lag === 1 && f.rho < 0)) sleep++;
    if (A.some((f) => f.target === 'energy' && f.factor === 'walk' && f.rho > 0)) energy++;
    if (r.findings.some((f) => f.kind === 'timing' && /15:00|16:00|18:00/.test(f.title))) timing++;
    negatives += A.filter((f) => /medication|treats|meal_first_time/.test(f.factor)).length;
    spuriousTrend += r.findings.filter((f) => f.kind === 'trend').length;  // nothing trends in the simulation
  }
  assert.equal(energy, seeds.length, 'strong effect found every time');
  assert.ok(play >= 3, `play->episodes found in ${play}/5`);
  assert.ok(sleep >= 3, `sleep->next-day episodes found in ${sleep}/5`);
  assert.equal(timing, seeds.length, 'evening cluster');
  assert.equal(negatives, 0, 'negative controls (medication time, treats, meal time) never reported');
  assert.equal(spuriousTrend, 0, 'no invented trends');
});

test('too little data -> no associations claimed', () => {
  const r = findPatterns(demoHistory({ days: 10, seed: 3 }), { perms: 99 });
  assert.equal(r.findings.filter((f) => f.kind === 'association').length, 0);
});

test('deterministic', () => {
  const a = findPatterns(demoHistory({ days: 40, seed: 4 }), { perms: 199 });
  const b = findPatterns(demoHistory({ days: 40, seed: 4 }), { perms: 199 });
  assert.deepEqual(a.findings.map((f) => [f.id, f.q]), b.findings.map((f) => [f.id, f.q]));
  assert.ok(TEMPLATES.length >= 12);
  assert.ok(permutationP([1, 2, 3, 4, 5, 6], [1, 2, 3, 4, 5, 6], 1, { perms: 99 }) < 0.05);
});
