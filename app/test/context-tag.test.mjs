// Field context tag "another dog in the home reacted first" (app/context-tag.js). In two-dog homes one
// dog's barking can set the other off (research/video-notes V12, 0:28-0:31: "sets him off"); the collar
// on one dog can't tell its own trigger from a follow-on reaction, so the owner marks it on the Trigger.
// Owner observation only: one Consultant "Context" row, never a score. Synthetic events only.
// SPDX-License-Identifier: GPL-3.0-only
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ownerEvent } from '../store.js';
import { CONTEXT_TAG, contextExtra } from '../context-tag.js';
import { episodesFrom, consultRows, ownerRows } from '../episodes.js';
import { reportHtml } from '../episode-report.js';

const t0 = Date.parse('2026-01-01T08:00:00Z');
const ts = (s) => new Date(t0 + s * 1000).toISOString();
const dog = 'synthetic-dog';

function episode(extra) {
  return [
    ownerEvent({ dog, kind: 'trigger', metric: 'trigger.seen', value: null, timestamp: ts(0), episodeId: 'ep-a', extra: { trigger_class: 'other', ...extra } }),
    ownerEvent({ dog, metric: 'behavior.reacted', value: true, timestamp: ts(4), episodeId: 'ep-a' }),
    ownerEvent({ dog, metric: 'behavior.calm', value: 60, timestamp: ts(60), episodeId: 'ep-a' }),
  ];
}

test('switch on: the trigger carries the context tag with its rule', () => {
  assert.deepEqual(contextExtra(true), { context: ['other_dog_first'], context_rule: CONTEXT_TAG.rule });
  assert.deepEqual(contextExtra(false), {});
});

test('a marked trigger adds one Consultant Context row, said as the owner\'s mark', () => {
  const [ep] = episodesFrom(episode(contextExtra(true)));
  assert.deepEqual(ep.context, ['other_dog_first']);
  const rows = consultRows(ep, null);
  const ctx = rows.find(([k]) => k === 'Context');
  assert.ok(ctx, 'Context row missing');
  assert.equal(ctx[1], 'Another dog in the home reacted first (owner mark; the collar can\u2019t tell)');
  assert.equal(rows.findIndex(([k]) => k === 'Context'), 1, 'Context sits right under Trigger');
});

test('unmarked episodes keep their rows unchanged, and the owner lens never shows it', () => {
  const [ep] = episodesFrom(episode(contextExtra(false)));
  assert.deepEqual(ep.context, []);
  assert.ok(!consultRows(ep, null).some(([k]) => k === 'Context'));
  const [marked] = episodesFrom(episode(contextExtra(true)));
  assert.ok(!ownerRows(marked, null).some(([, v]) => /another dog/i.test(v)));
});

test('unknown context values on record are ignored, not shown', () => {
  const [ep] = episodesFrom(episode({ context: ['made_up'] }));
  assert.deepEqual(ep.context, []);
});

test('the one-page report carries the Context row', () => {
  const html = reportHtml(episodesFrom(episode(contextExtra(true))), { generatedAt: ts(120), timeZone: 'UTC' });
  assert.match(html, /<dt>Context<\/dt><dd>Another dog in the home reacted first/);
});

test('copy has no score, feelings or blame words', () => {
  const words = `${CONTEXT_TAG.label} ${CONTEXT_TAG.row} ${CONTEXT_TAG.note}`;
  assert.doesNotMatch(words, /score|stress|anxious|fear|jealous|dominan|fault|blame/i);
});

test('Field has the switch in the Trigger sheet', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const html = readFileSync(join(here, '..', 'field.html'), 'utf8');
  const sheet = html.slice(html.indexOf('id="distSheet"'), html.indexOf('id="tagSheet"'));
  assert.match(sheet, /<input type="checkbox" id="optOtherDog">/);
  const js = readFileSync(join(here, '..', 'field.js'), 'utf8');
  assert.match(js, /contextExtra\(\$\('optOtherDog'\)\.checked\)/);
});
