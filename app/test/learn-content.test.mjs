// node --test app/test/
// Guards the trainer's safety boundary: every lesson and card is sourced, answers are valid,
// and the copy avoids emotion-as-fact and diagnosis wording.
// SPDX-License-Identifier: GPL-3.0-only
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LESSONS, CARDS, SOURCE_NAMES, SRC } from '../learn-content.js';

test('8 to 12 lessons, each with at least two named https sources', () => {
  assert.ok(LESSONS.length >= 8 && LESSONS.length <= 12);
  for (const l of LESSONS) {
    assert.ok(l.sources.length >= 2, l.id);
    for (const u of l.sources) {
      assert.match(u, /^https:\/\//, `${l.id} ${u}`);
      assert.ok(SOURCE_NAMES[u], `${l.id}: unnamed source ${u}`);
    }
    assert.ok(l.figs.length >= 1, l.id);
  }
});

test('every practice card has one valid answer, sources and an existing lesson', () => {
  const ids = new Set(LESSONS.map((l) => l.id));
  for (const c of CARDS) {
    assert.ok(c.choices.length >= 3 && c.choices.length <= 4, c.id);
    assert.ok(Number.isInteger(c.answer) && c.answer >= 0 && c.answer < c.choices.length, c.id);
    assert.ok(ids.has(c.lesson), c.id);
    assert.ok(c.sources.length >= 1 && c.sources.every((u) => SOURCE_NAMES[u]), c.id);
  }
  assert.equal(new Set(CARDS.map((c) => c.id)).size, CARDS.length);
});

test('all registered sources are used and named', () => {
  const used = new Set([...LESSONS.flatMap((l) => l.sources), ...CARDS.flatMap((c) => c.sources)]);
  for (const u of Object.values(SRC)) assert.ok(used.has(u), `unused source ${u}`);
});

test('copy hedges interpretations and never diagnoses', () => {
  const text = JSON.stringify({ LESSONS, CARDS });
  for (const bad of [/\bis (happy|angry|guilty|jealous|dominant)\b/i, /\bdiagnos(is|ed|e) (of|with)\b/i, /\balpha\b/i, /\bcorrection collar\b/i]) {
    assert.doesNotMatch(text, bad);
  }
  assert.ok(LESSONS.filter((l) => l.contested).length >= 4, 'contested topics are marked');
});
