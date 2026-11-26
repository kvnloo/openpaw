// node --test app/test/
// Field "Won't walk on" mark: the owner logs that the dog stopped, turned back or pulled home, with an
// optional place note. A vet or consultant can then see whether refusals sit at one place (place-generalised
// fear after a scare, lopesfagundes2018) or happen on every route. Owner observation only: counts per place
// as written, no inference, no score.
// SPDX-License-Identifier: GPL-3.0-only
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { WALK_REFUSAL, refusalPayload, refusalPlaces, refusalText } from '../walk-refusal.js';
import { vetRows } from '../episodes.js';

const here = new URL('.', import.meta.url);
const ev = (ts, place, id = `e-${ts}`) => ({ event_id: id, timestamp: ts, payload: { metric: WALK_REFUSAL.metric, value: 'refused', place } });

test('payload is an owner observation with a trimmed, optional place note and the rule version', () => {
  const p = refusalPayload('  corner by the school  ');
  assert.equal(p.metric, 'behavior.walk_refusal');
  assert.equal(p.value, 'refused');
  assert.equal(p.extra.place, 'corner by the school');
  assert.equal(p.extra.rule, 'openpaw-walk-refusal/1');
  assert.equal(refusalPayload('   ').extra.place, null);
  assert.equal(refusalPayload(undefined).extra.place, null);
  assert.equal(refusalPayload('x'.repeat(200)).extra.place.length, WALK_REFUSAL.placeMax);
});

test('places group case- and space-insensitively, keep the first spelling, most marks first', () => {
  const evs = [ev('2026-11-20T10:00:00Z', 'Park gate'), ev('2026-11-21T10:00:00Z', 'park  gate '), ev('2026-11-22T10:00:00Z', null),
    ev('2026-11-23T10:00:00Z', 'bridge')];
  assert.deepEqual(refusalPlaces(evs), [['Park gate', 2], ['bridge', 1], [null, 1]]);
  assert.equal(refusalText(evs), '4 marked: Park gate ×2, bridge ×1, no place noted ×1');
  assert.equal(refusalText([]), 'None marked');
});

test('first spelling is the earliest mark by time, whatever order the store returns', () => {
  // IndexedDB returns events in key (uuid) order; found in the Field walk at 1440 (rounds/build-refuse/).
  const evs = [ev('2026-11-21T10:00:00Z', 'park gate', 'a'), ev('2026-11-20T10:00:00Z', 'Park gate', 'b')];
  assert.deepEqual(refusalPlaces(evs), [['Park gate', 2]]);
});

test('retracted marks and other metrics do not count', () => {
  const a = ev('2026-11-20T10:00:00Z', 'bridge', 'a');
  const undo = { event_id: 'u', timestamp: '2026-11-20T10:00:05Z', payload: { metric: 'owner.retract', value: 'a' } };
  const other = { event_id: 'o', timestamp: '2026-11-20T10:01:00Z', payload: { metric: 'behavior.reacted', value: true } };
  assert.equal(refusalText([a, undo, other]), 'None marked');
});

test('vet view adds a row for refusals in its 7-day window only when given refusal events', () => {
  const eps = [{ start: '2026-11-26T10:00:00Z', precursors: [], timeToCalmS: null, sincePreviousMin: null }];
  assert.equal(vetRows(eps).some(([k]) => k === 'Won\u2019t walk on'), false);
  const rows = vetRows(eps, [ev('2026-11-25T09:00:00Z', 'bridge'), ev('2026-11-10T09:00:00Z', 'old place')]);
  const row = rows.find(([k]) => k === 'Won\u2019t walk on');
  assert.deepEqual(row, ['Won\u2019t walk on', '1 marked: bridge ×1']);
});

test('copy has no score, feelings, diagnosis or inference', () => {
  const words = [WALK_REFUSAL.title, WALK_REFUSAL.prompt, WALK_REFUSAL.note, refusalText([ev('2026-11-20T10:00:00Z', 'x')])].join(' ');
  for (const bad of [/stress/i, /score/i, /anxious|afraid|scared|happy|fear|stubborn/i, /diagnos/i, /dominan|alpha/i, /cluster|pattern/i]) assert.doesNotMatch(words, bad);
});

test('cites existing evidence cards', () => {
  assert.ok(WALK_REFUSAL.evidence.includes('lopesfagundes2018-noise-sensitivities-in-dogs-an-exploration-of-signs'));
  for (const id of WALK_REFUSAL.evidence) assert.ok(existsSync(new URL(`../../docs/evidence/cards/${id}.md`, here)), id);
});

test('Field page has the panel, wires it, and passes refusals to the vet view', () => {
  const html = readFileSync(new URL('../field.html', here), 'utf8');
  for (const id of ['pRefuse', 'refusePlace', 'refuseSave', 'refuseSummary']) assert.match(html, new RegExp(`id="${id}"`), id);
  assert.match(html, /<label[^>]*for="refusePlace"/);
  const js = readFileSync(new URL('../field.js', here), 'utf8');
  assert.match(js, /from '\.\/walk-refusal\.js'/);
  assert.match(js, /vetRows\(eps, /);
  assert.match(js, /'behavior\.walk_refusal'/);
});
