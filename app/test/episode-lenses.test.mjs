// Owner + Veterinarian lens rows from the same episodesFrom() the consultant lens uses.
// Synthetic fixtures only. Marks and measured minutes only: no stacking rule, no score, no feelings.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { episodesFrom, ownerRows, vetRows } from '../episodes.js';

let n = 0;
const ev = (ts, metric, kind, episode, value = null, extra = {}) => ({
  schema_version: '0.1', event_id: `l:${n++}`, dog_id: 'test-dog', timestamp: ts, episode_id: episode, event_type: kind,
  provenance: { origin: 'owner', source_id: 'openpaw-field', algorithm_version: null, confidence: null, evidence_event_ids: [] },
  payload: { metric, value, unit: null, note: null, ...extra },
});

// A: person 10-20 ft, U-turn 6 s, treat 30 s, calm 1:52.  B: 8 min after A's calm, never calm.
// C: dog 20-40 ft, calm at 0:40, two days later.  OLD: 10 days before C (outside the 7-day window).
const walk = [
  ev('2026-11-10T09:00:00.000Z', 'trigger.seen', 'trigger', 'ep:old', '40+', { trigger_class: 'bike' }),
  ev('2026-11-10T09:01:00.000Z', 'behavior.calm', 'observation', 'ep:old', 60),
  ev('2026-11-20T14:02:00.000Z', 'trigger.seen', 'trigger', 'ep:a', '10-20', { trigger_class: 'person' }),
  ev('2026-11-20T14:02:02.000Z', 'body_language.tags', 'observation', 'ep:a', ['freeze', 'hard stare']),
  ev('2026-11-20T14:02:04.000Z', 'behavior.reacted', 'observation', 'ep:a', true),
  ev('2026-11-20T14:02:06.000Z', 'intervention.distance', 'intervention', 'ep:a', 'u-turn'),
  ev('2026-11-20T14:02:30.000Z', 'intervention.reward', 'intervention', 'ep:a', 'treat'),
  ev('2026-11-20T14:03:52.000Z', 'behavior.calm', 'observation', 'ep:a', 112),
  ev('2026-11-20T14:11:52.000Z', 'trigger.seen', 'trigger', 'ep:b', null, { trigger_class: null }),
  ev('2026-11-20T14:11:55.000Z', 'behavior.reacted', 'observation', 'ep:b', true),
  ev('2026-11-22T08:00:00.000Z', 'trigger.seen', 'trigger', 'ep:c', '20-40', { trigger_class: 'dog' }),
  ev('2026-11-22T08:00:03.000Z', 'body_language.tags', 'observation', 'ep:c', ['hard stare']),
  ev('2026-11-22T08:00:40.000Z', 'behavior.calm', 'observation', 'ep:c', 40),
];
const eps = episodesFrom(walk);
const [old, a, b, c] = eps;

test('owner rows speak plainly about one episode', () => {
  assert.deepEqual(ownerRows(a, old), [
    ['What set it off', 'A person, 10–20 ft away'],
    ['What you did', 'U-turn after 6\u00a0s, treat after 30\u00a0s'],
    ['Back to calm', '1:52 (your Calm again mark)'],
    ['Worth knowing', 'Came 10 days after the previous episode'], // 14701 min: long gaps read in days
  ]);
  assert.equal(ownerRows(c, b).at(-1)[1], 'Came 42 h after the previous episode'); // 2508 min
  assert.deepEqual(ownerRows(b, a), [
    ['What set it off', 'Not recorded'],
    ['What you did', 'Nothing marked'],
    ['Back to calm', 'Not marked yet'],
    ['Worth knowing', 'Came 8 min after the previous episode'],
  ]);
  assert.deepEqual(ownerRows(old, null).at(-1), ['Worth knowing', 'First episode on record']);
});

test('vet rows summarise the 7 days before the latest episode from marks only', () => {
  assert.deepEqual(vetRows(eps), [
    ['Episodes, 7 days', '3 (owner-marked)'],
    ['Shortest gap', '8 min between two episodes'],
    ['Time to Calm again', 'median 1:16 · 2 of 3 marked'],
    ['Body tags', 'hard stare ×2, freeze ×1'],
    ['Raw export', 'JSONL from the collar page'],
  ]);
});

test('vet rows with one episode and nothing marked never guess', () => {
  assert.deepEqual(vetRows([b]), [
    ['Episodes, 7 days', '1 (owner-marked)'],
    ['Shortest gap', 'Only one episode in the window'],
    ['Time to Calm again', 'Not marked (0 of 1)'],
    ['Body tags', 'None marked'],
    ['Raw export', 'JSONL from the collar page'],
  ]);
  assert.deepEqual(vetRows([]), []);
});

test('owner and vet rows never label stacking, a score or a feeling', () => {
  const words = JSON.stringify([...eps.map((e, i) => ownerRows(e, eps[i - 1] || null)), vetRows(eps)]);
  for (const bad of [/stack/i, /stress/i, /anxious|fear|happy|calm dog/i, /score/i, /diagnos/i]) assert.doesNotMatch(words, bad);
});

test('the field page offers Owner / Consultant / Vet views of the last episode', () => {
  const html = readFileSync(new URL('../field.html', import.meta.url), 'utf8');
  const js = readFileSync(new URL('../field.js', import.meta.url), 'utf8');
  assert.match(html, /id="epLens"/);
  for (const l of ['owner', 'consult', 'vet']) assert.match(html, new RegExp(`data-lens="${l}"`));
  assert.match(js, /ownerRows/);
  assert.match(js, /vetRows/);
});
