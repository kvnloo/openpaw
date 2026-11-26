// app/episode-movement.js must give the same per-episode movement as tools/collar_derive.py
// (differential test on simulated exports built with the app's own code), and the
// Consultant lens must show it as one "Collar movement" row: measurements only, simulated
// data labelled, a cut-short follow-up called incomplete, never "recovery".
// SPDX-License-Identifier: GPL-3.0-only
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { recordToEvents, makeClock, toJsonl } from '../openpaw-ble.js';
import { ownerEvent } from '../store.js';
import { deriveMovement, movementText } from '../episode-movement.js';
import { episodesFrom, consultRows } from '../episodes.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const wall0 = Date.parse('2026-01-01T07:30:00Z');

function exportOf(mg, marks, { clippedAt = new Set(), origin = 'simulated' } = {}) {
  const clock = makeClock(wall0, 0);
  const opts = { dogId: 'synthetic-dog', deviceId: 'sim-collar', clock, origin };
  const events = [];
  mg.forEach((v, seq) => events.push(...recordToEvents({
    seq, uptime_s: seq * 5, vedba_mean_mg: v, vedba_max_mg: v + 40, active_frac: v > 120 ? 0.8 : 0.1,
    pitch_deg: 2, roll_deg: -4, bursts: v > 500 ? 1 : 0, hr_bpm: 0, battery_pct: 255,
    clipped: clippedAt.has(seq), gap: false, low_rate: false,
  }, opts)));
  let n = 0;
  for (const [s, metric, ep, value] of marks) {
    const e = ownerEvent({ dog: 'synthetic-dog', kind: metric === 'trigger.seen' ? 'trigger' : 'observation', metric, value,
      timestamp: new Date(wall0 + s * 1000).toISOString(), episodeId: ep, origin, sourceId: 'openpaw-field' });
    e.event_id = `mark-${n++}`;   // stable ids so both sides can be compared
    events.push(e);
  }
  return events;
}

function python(events) {
  const dir = mkdtempSync(join(tmpdir(), 'op-move-'));
  const f = join(dir, 'export.jsonl');
  writeFileSync(f, toJsonl(events));
  return JSON.parse(execFileSync('python3', [join(ROOT, 'tools', 'collar_derive.py'), f, '--json'], { encoding: 'utf8' }));
}

const strip = (ds) => ds.map((d) => ({ ...d, provenance: { ...d.provenance, source_id: null } }));
const quiet = [40, 55, 60, 45, 70, 50, 65, 80, 35, 50];
const burst = [600, 750, 900, 700, 500, 300, 200, 150];

const CASES = {
  'one episode, back in band': exportOf(
    [...Array.from({ length: 360 }, (_, i) => quiet[i % 10]), ...burst, ...Array(60).fill(50)],
    [[1800, 'trigger.seen', 'ep:a', '10-20'], [1808, 'behavior.reacted', 'ep:a', true], [1890, 'behavior.calm', 'ep:a', 90]]),
  'second episode cuts the first short': exportOf(
    [...Array.from({ length: 360 }, (_, i) => quiet[i % 10]), ...burst, 400, 350, ...burst, ...Array(60).fill(50)],
    [[1800, 'trigger.seen', 'ep:a', '10-20'], [1850, 'trigger.seen', 'ep:b', '<10']]),
  'band unknown (under a minute before)': exportOf(
    [...Array(8).fill(50), ...burst, ...Array(20).fill(50)],
    [[40, 'trigger.seen', 'ep:a', '20-40']]),
  'clipped epochs left out of the band, data ends first': exportOf(
    [...Array.from({ length: 120 }, (_, i) => quiet[i % 10]), ...burst, ...Array(4).fill(50)],
    [[600, 'trigger.seen', 'ep:a', '10-20']], { clippedAt: new Set([3, 7, 11]) }),
};

for (const [name, events] of Object.entries(CASES)) {
  test(`same result as tools/collar_derive.py: ${name}`, () => {
    const py = python(events);
    assert.ok(py.length >= 1);
    assert.deepEqual(strip(deriveMovement(events)), strip(py));
  });
}

test('the clipped case really leaves epochs out (not a vacuous comparison)', () => {
  const [d] = deriveMovement(CASES['clipped epochs left out of the band, data ends first']);
  assert.equal(d.payload.baseline.excluded.quality, 3);
  assert.equal(d.payload.back_in_band.ended_by.reason, 'end of data');
  const [u] = deriveMovement(CASES['band unknown (under a minute before)']);
  assert.equal(u.payload.baseline.status, 'unknown');
});

test('Consultant lens shows a "Collar movement" row, simulated data labelled', () => {
  const events = CASES['one episode, back in band'];
  const eps = episodesFrom(events);
  const rows = consultRows(eps[0], null, deriveMovement(events));
  const row = rows.find(([k]) => k === 'Collar movement');
  assert.ok(row, 'no Collar movement row');
  assert.match(row[1], /^Simulated · /);
  assert.match(row[1], /band \d+(\.\d+)? mg median, upper \d+ mg/);
  assert.match(row[1], /peak 900 mg at \+\d+\u00a0s/);
  assert.match(row[1], /back in band \d+\u00a0s after the trigger/);
  assert.doesNotMatch(row[1], /recover|stress|calm/i);
});

test('cut-short follow-up reads incomplete, never a slow settle', () => {
  const ds = deriveMovement(CASES['second episode cuts the first short']);
  const t = movementText(ds.find((d) => d.episode_id === 'ep:a'));
  assert.match(t, /not observed in 45\u00a0s of follow-up/);   // last epoch before the next trigger
  assert.match(t, /incomplete: the next episode began 50\u00a0s after the trigger/);
});

test('no collar epochs: no Collar movement row (marks-only rows unchanged)', () => {
  const events = CASES['one episode, back in band'].filter((e) => e.event_type !== 'measurement');
  const eps = episodesFrom(events);
  assert.deepEqual(consultRows(eps[0], null, deriveMovement(events)), consultRows(eps[0], null));
  assert.equal(consultRows(eps[0], null).some(([k]) => k === 'Collar movement'), false);
});
