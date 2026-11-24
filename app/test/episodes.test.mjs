// Owner-marked Field events -> the Episode shape the landing page's "three lenses" section shows.
// Synthetic fixtures only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { episodesFrom, consultRows } from '../episodes.js';

let n = 0;
const ev = (ts, metric, kind, episode, value = null, extra = {}) => ({
  schema_version: '0.1', event_id: `t:${n++}`, dog_id: 'test-dog', timestamp: ts, episode_id: episode, event_type: kind,
  provenance: { origin: 'owner', source_id: 'openpaw-field', algorithm_version: null, confidence: null, evidence_event_ids: [] },
  payload: { metric, value, unit: null, note: null, ...extra },
});

// Episode A: stranger at 10-20 ft, body tags before the reaction, U-turn at 6 s, calm at 1:52.
// Episode B: starts 8 min after A's Calm again mark, never marked calm (walk ended).
const A = 'ep:aaaa', B = 'ep:bbbb';
const walk = [
  ev('2026-11-20T14:02:00.000Z', 'trigger.seen', 'trigger', A, '10-20', { trigger_class: 'person', distance_band_ft: [10, 20] }),
  ev('2026-11-20T14:02:02.000Z', 'body_language.tags', 'observation', A, ['freeze', 'hard stare']),
  ev('2026-11-20T14:02:04.000Z', 'behavior.reacted', 'observation', A, true),
  ev('2026-11-20T14:02:06.000Z', 'intervention.distance', 'intervention', A, 'u-turn'),
  ev('2026-11-20T14:02:30.000Z', 'intervention.reward', 'intervention', A, 'treat'),
  ev('2026-11-20T14:03:52.000Z', 'behavior.calm', 'observation', A, 112, { time_to_calm_s: 112, reaction_to_calm_s: 108 }),
  ev('2026-11-20T14:11:52.000Z', 'trigger.seen', 'trigger', B, null, { trigger_class: null }),
  ev('2026-11-20T14:11:55.000Z', 'behavior.reacted', 'observation', B, true),
  ev('2026-11-20T09:00:00.000Z', 'track.meal', 'observation', null, 1), // not part of any episode
];

test('groups owner marks by episode_id into episodes, oldest first', () => {
  const eps = episodesFrom(walk.slice().reverse());
  assert.deepEqual(eps.map((e) => e.id), [A, B]);
  const a = eps[0];
  assert.equal(a.start, '2026-11-20T14:02:00.000Z');
  assert.deepEqual(a.trigger, { cls: 'person', band: '10-20' });
  assert.deepEqual(a.precursors, ['freeze', 'hard stare'], 'body tags marked before the reaction');
  assert.equal(a.reactionAfterS, 4);
  assert.deepEqual(a.interventions, [{ type: 'u-turn', afterS: 6 }, { type: 'treat', afterS: 30 }]);
  assert.equal(a.timeToCalmS, 112);
  assert.equal(a.recovery, 'observed');
  assert.equal(a.evidence.length, 6, 'every event of the episode is cited');
});

test('an episode without a Calm again mark reports recovery as not observed, never a guess', () => {
  const b = episodesFrom(walk)[1];
  assert.equal(b.timeToCalmS, null);
  assert.equal(b.recovery, 'not observed');
  assert.equal(b.sincePreviousMin, 8, 'minutes from the previous Calm again mark to this trigger');
});

test('retracted (undone) marks are left out', () => {
  const undo = ev('2026-11-20T14:02:07.000Z', 'owner.retract', 'observation', null, walk[3].event_id);
  const a = episodesFrom([...walk, undo])[0];
  assert.deepEqual(a.interventions, [{ type: 'treat', afterS: 30 }]);
});

test('consultant rows use the lens labels and plain measured values', () => {
  const [a, b] = episodesFrom(walk);
  assert.deepEqual(consultRows(a, null), [
    ['Trigger', 'Person, 10–20 ft'],
    ['Precursors', 'freeze, hard stare (owner tags)'],
    ['Intervention', 'U-turn at 6\u00a0s, treat at 30\u00a0s'], // number and unit never split across lines (390 px render)
    ['Recovery', '1:52 to Calm again (owner-marked)'],
    ['Since previous', 'No earlier episode on record'],
  ]);
  assert.deepEqual(consultRows(b, a), [
    ['Trigger', 'Not recorded, distance not recorded'],
    ['Precursors', 'None marked'],
    ['Intervention', 'None marked'],
    ['Recovery', 'Not observed (no Calm again mark)'],
    ['Since previous', '8 min after the previous episode'],
  ]);
});

test('lens rows never label stacking by a rule, a stress score or a feeling', () => {
  const words = JSON.stringify(episodesFrom(walk).map((e, i, all) => consultRows(e, all[i - 1] || null)));
  for (const bad of [/stacked/i, /stress/i, /anxious|fear|happy|calm dog/i, /score/i]) assert.doesNotMatch(words, bad);
});

test('the field page shows the last episode in lens form', () => {
  const html = readFileSync(new URL('../field.html', import.meta.url), 'utf8');
  const js = readFileSync(new URL('../field.js', import.meta.url), 'utf8');
  assert.match(html, /id="pEpisode"/);
  assert.match(html, /id="epRows"/);
  assert.match(js, /from '\.\/episodes\.js'/);
});
