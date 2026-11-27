// "Left Still after the trigger" (app/stood-up.js): when the collar was in the Still band for the
// 30 s before an episode's Trigger mark, say whether the movement band left Still within 10 s.
// Trainers use getting up as an early sign the step was too big (research/video-notes V7, V11, V12);
// this is their rule of thumb, not a measured finding, so it is one line in Consultant Precursors,
// never a score, and only shown when the collar data can answer it. Synthetic epochs only.
// SPDX-License-Identifier: GPL-3.0-only
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recordToEvents, makeClock } from '../openpaw-ble.js';
import { ownerEvent } from '../store.js';
import { stoodUpFrom, stoodUpText, STOOD_UP_VERSION } from '../stood-up.js';
import { episodesFrom, consultRows, lensCaption } from '../episodes.js';
import { reportHtml } from '../episode-report.js';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const wall0 = Date.parse('2026-01-01T07:30:00Z');

// mg: one VeDBA value per 5 s epoch from wall0; trigger at tS seconds.
function walk(mg, tS, { clippedAt = new Set(), origin = 'sensor' } = {}) {
  const clock = makeClock(wall0, 0);
  const events = [];
  mg.forEach((v, seq) => events.push(...recordToEvents({
    seq, uptime_s: seq * 5, vedba_mean_mg: v, vedba_max_mg: v + 40, active_frac: 10,
    pitch_deg: 2, roll_deg: -4, bursts: 0, hr_bpm: 0, battery_pct: 255,
    clipped: clippedAt.has(seq), gap: false, low_rate: false,
  }, { dogId: 'synthetic-dog', deviceId: 'sim-collar', clock, origin })));
  if (tS != null) {
    const e = ownerEvent({ dog: 'synthetic-dog', kind: 'trigger', metric: 'trigger.seen', value: '10-20',
      timestamp: new Date(wall0 + tS * 1000).toISOString(), episodeId: 'ep:a', origin, sourceId: 'openpaw-field' });
    events.push(e);
  }
  return events;
}
const lying = Array(12).fill(30);   // 60 s in the Still band (< 250 mg)

test('still for the 30 s before the trigger, Active 5 s after -> left Still at +5 s', () => {
  const [d] = stoodUpFrom(walk([...lying, 30, 400, 420, 300], 60));
  assert.equal(d.episode_id, 'ep:a');
  assert.equal(d.status, 'left');
  assert.equal(d.after_s, 5);
  assert.equal(d.algorithm_version, STOOD_UP_VERSION);
  assert.equal(stoodUpText(d), 'left Still 5\u00a0s after the trigger (collar)');
});

test('still before and still for the 10 s after -> stayed Still', () => {
  const [d] = stoodUpFrom(walk([...lying, 30, 40, 35, 40], 60));
  assert.equal(d.status, 'stayed');
  assert.equal(stoodUpText(d), 'stayed Still for the 10\u00a0s after the trigger (collar)');
});

test('not still before the trigger -> no line (the rule only applies to a dog lying or sitting still)', () => {
  assert.deepEqual(stoodUpFrom(walk([...Array(12).fill(400), 30, 500, 500], 60)), []);
});

test('a clipped epoch in the 30 s before, or no epochs after -> no line, never a guess', () => {
  assert.deepEqual(stoodUpFrom(walk([...lying, 30, 400, 400], 60, { clippedAt: new Set([10]) })), []);
  assert.deepEqual(stoodUpFrom(walk([...lying], 60)), []);
  assert.deepEqual(stoodUpFrom(walk([...lying, 30, 400], null)), []);
});

test('simulated epochs are labelled simulated', () => {
  const [d] = stoodUpFrom(walk([...lying, 30, 400, 400], 60, { origin: 'simulated' }));
  assert.equal(stoodUpText(d), 'left Still 5\u00a0s after the trigger (collar, simulated)');
});

test('Consultant Precursors carries the collar line; the caption names it a trainer rule of thumb', () => {
  const events = walk([...lying, 30, 400, 420, 300], 60);
  const [ep] = episodesFrom(events);
  const rows = consultRows(ep, null, [], stoodUpFrom(events));
  const pre = Object.fromEntries(rows).Precursors;
  assert.equal(pre, 'left Still 5\u00a0s after the trigger (collar)');
  const cap = lensCaption(rows);
  assert.match(cap, /a trainer.s rule of thumb \(getting up = the step may be too big\), not a measured finding/);
  for (const bad of [/stress/i, /score/i, /anxious|afraid|scared|fear/i, /diagnos/i]) {
    assert.doesNotMatch(pre, bad);
    assert.doesNotMatch(cap, bad);
  }
});

test('the one-page report carries the same Precursors line and the rule-of-thumb note', () => {
  const events = walk([...lying, 30, 400, 420, 300], 60);
  const html = reportHtml(episodesFrom(events), { stoodUp: stoodUpFrom(events), generatedAt: '2026-01-01T08:00:00Z', timeZone: 'UTC' });
  assert.match(html, /left Still 5\u00a0s after the trigger \(collar\)/);
  assert.match(html, /rule of thumb \(getting up = the step may be too big\), not a measured finding/);
  assert.doesNotMatch(reportHtml(episodesFrom(events), { timeZone: 'UTC' }), /rule of thumb/);
});

test('Field has an owner switch to hide the collar Still line, on by default, remembered on this device', () => {
  const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
  const html = readFileSync(join(ROOT, 'field.html'), 'utf8');
  assert.match(html, /<label class="switch"[^>]*><input type="checkbox" id="optStoodUp" checked>[^<]*Still[^<]*<\/label>/);
  const js = readFileSync(join(ROOT, 'field.js'), 'utf8');
  assert.match(js, /optStoodUp/);
  assert.match(js, /stoodUpFrom\(/);
});

test('hidden or absent: Precursors and caption are unchanged', () => {
  const events = walk([...lying, 30, 400, 420, 300], 60);
  const [ep] = episodesFrom(events);
  const rows = consultRows(ep, null, []);
  assert.equal(Object.fromEntries(rows).Precursors, 'None marked');
  assert.doesNotMatch(lensCaption(rows), /rule of thumb/);
});
