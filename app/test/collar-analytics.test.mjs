import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recordToEvents, makeClock } from '../openpaw-ble.js';
import { levelOf, epochsFromEvents, dayBudget, circadian, burstEvents, baseline, summary, demoWeek, longestStill, fmtMin } from '../collar-analytics.js';

const NOW = Date.parse('2026-11-23T20:00:00Z');

test('levels are measurement bands', () => {
  assert.deepEqual([0, 29, 30, 149, 150, 499, 500, 4000].map(levelOf), [0, 0, 1, 1, 2, 2, 3, 3]);
  assert.equal(fmtMin(5.4), '5 min'); assert.equal(fmtMin(135), '2 h 15');
});

test('epochs round-trip from real collar events (same decoder the page uses)', () => {
  const clock = makeClock(NOW, 1000);
  const recs = [0, 1, 2].map((i) => ({ version: 1, flags: 0, seq: i, uptime_s: 990 + i * 5, vedba_mean_mg: 20 + i * 200, vedba_max_mg: 40 + i * 900, active_frac: 128, pitch_deg: -5, roll_deg: 1, bursts: i === 2 ? 1 : 0, hr_bpm: 0, battery_pct: 80, clipped: false, gap: false }));
  const ev = recs.flatMap((r) => recordToEvents(r, { dogId: 'd', deviceId: 'OpenPaw-1', clock, epochS: 5 }));
  const ep = epochsFromEvents([...ev].reverse());
  assert.equal(ep.length, 3);
  assert.deepEqual(ep.map((e) => e.vedba), [20, 220, 420]);
  assert.equal(ep[2].bursts, 1); assert.equal(ep[0].batt, 80); assert.equal(ep[1].w, 5);
  assert.ok(Math.abs(ep[0].active - 0.502) < 0.001);
  assert.ok(ep[0].t < ep[1].t);
});

test('day budget sums minutes per band and covers each day', () => {
  const w = demoWeek({ now: NOW, days: 7 });
  const b = dayBudget(w, { now: NOW, days: 7 });
  assert.equal(b.length, 7);
  const full = b[3];
  const total = full.minutes.reduce((s, x) => s + x, 0);
  assert.ok(Math.abs(total - 1440) <= 2, `full day covers 1440 min, got ${total}`);
  assert.ok(full.minutes[0] > 600, 'nights are mostly still');
  assert.ok(full.minutes[2] + full.minutes[3] > 40, 'walks + play show up as moderate/vigorous');
});

test('circadian profile: nights quiet, walk hours busy, today split out', () => {
  const c = circadian(demoWeek({ now: NOW, days: 7 }), { now: NOW });
  assert.equal(c.typical.length, 48);
  const night = c.typical[3 * 2], evening = c.typical[17 * 2 + 1];
  assert.ok(night < 40, `03:00 quiet (${night})`);
  assert.ok(evening > 150, `17:30 active (${evening})`);
  assert.ok(c.today.slice(0, c.nowBin + 1).some((v) => v !== null));
  assert.ok(c.today.slice(c.nowBin + 1).every((v) => v === null), 'no future data');
});

test('burst events group nearby bursts and measure settle time', () => {
  const ep = [];
  for (let i = 0; i < 200; i++) ep.push({ t: NOW + i * 5000, vedba: i >= 10 && i < 14 ? 1200 : i >= 14 && i < 30 ? 400 : 15, max: i === 11 ? 3500 : 100, bursts: i === 10 || i === 12 ? 1 : 0, clipped: false, w: 5 });
  const b = burstEvents(ep);
  assert.equal(b.length, 1); assert.equal(b[0].count, 2); assert.equal(b[0].peak, 3500);
  assert.equal(b[0].settleS, 90, 'burst ends at epoch 12 (60 s), movement back in still/low from epoch 30 (150 s)');
});

test('baseline, longest still bout and summary', () => {
  const w = demoWeek({ now: NOW, days: 7 });
  const base = baseline(w, { now: NOW });
  assert.ok(base.resting < 20 && base.active > 150, JSON.stringify(base));
  const night = longestStill(w, NOW - 864e5 - 4 * 3600e3, NOW - 864e5 + 8 * 3600e3);
  assert.ok(night > 30, `a night has long still bouts (${night})`);
  const s = summary(w, { now: NOW });
  assert.ok(s.level !== null && s.battery > 60 && s.battery <= 92);
  assert.ok(s.typicalActiveSoFar > 0);
});

test('demo week is deterministic and labelled simulated', () => {
  const a = demoWeek({ now: NOW }), b = demoWeek({ now: NOW });
  assert.deepEqual(a.slice(0, 50), b.slice(0, 50));
  assert.ok(a.every((e) => e.origin === 'simulated'));
});
