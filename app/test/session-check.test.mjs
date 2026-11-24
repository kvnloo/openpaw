// node --test app/test/
// Field "session check": a stop rule the owner runs during a walk. Observable signs only; any sign ->
// "stop or move further away". Guards the safety boundary (no score, no feelings, no diagnosis) and
// checks every cited evidence card exists.
// SPDX-License-Identifier: GPL-3.0-only
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { SESSION_SIGNS, SESSION_CHECK, sessionAdvice, sessionCheckPayload } from '../session-check.js';

const here = new URL('.', import.meta.url);

test('signs are observable body/behaviour descriptions from the cited sources', () => {
  for (const s of ['won\u2019t take food', 'can\u2019t look away', 'pacing', 'panting', 'shivering']) assert.ok(SESSION_SIGNS.includes(s), s);
});

test('any sign -> stop or move further away; no sign -> keep checking, never "relaxed"', () => {
  assert.match(sessionAdvice(['pacing']).text, /stop the session or move further away/i);
  assert.equal(sessionAdvice(['pacing']).stop, true);
  const none = sessionAdvice([]);
  assert.equal(none.stop, false);
  assert.match(none.text, /no stop signs marked/i);
  assert.doesNotMatch(none.text, /relaxed|calm|fine|ok\b/i);
});

test('panting alone carries the heat/exercise caveat', () => {
  assert.match(sessionAdvice(['panting']).text, /heat|exercise/i);
  assert.doesNotMatch(sessionAdvice(['pacing']).text, /heat/i);
});

test('payload is an owner observation of the chosen signs, with the rule version', () => {
  const p = sessionCheckPayload(['shivering', 'pacing']);
  assert.equal(p.metric, 'session.check');
  assert.deepEqual(p.value, ['shivering', 'pacing']);
  assert.equal(p.extra.advice_shown, sessionAdvice(['shivering', 'pacing']).text);
  assert.equal(p.extra.rule, SESSION_CHECK.rule);
  assert.throws(() => sessionCheckPayload(['anxious']), /unknown sign/);
});

test('copy has no score, feelings or diagnosis', () => {
  const words = [SESSION_CHECK.title, SESSION_CHECK.prompt, SESSION_CHECK.note, ...SESSION_SIGNS,
    sessionAdvice([]).text, sessionAdvice(['panting']).text, sessionAdvice(['pacing', 'shivering']).text].join(' ');
  for (const bad of [/stress/i, /score/i, /anxious|afraid|scared|happy|fear/i, /diagnos/i, /dominan|alpha/i]) assert.doesNotMatch(words, bad);
});

test('cites existing evidence cards and https sources', () => {
  assert.ok(SESSION_CHECK.evidence.length >= 2);
  for (const id of SESSION_CHECK.evidence) assert.ok(existsSync(new URL(`../../docs/evidence/cards/${id}.md`, here)), id);
  assert.ok(SESSION_CHECK.sources.length >= 2);
  for (const u of SESSION_CHECK.sources) assert.match(u, /^https:\/\//);
});

test('Field page has the session check panel and wires it', () => {
  const html = readFileSync(new URL('../field.html', here), 'utf8');
  assert.match(html, /id="pCheck"/);
  assert.match(html, /id="checkChips"/);
  assert.match(html, /id="checkSave"/);
  const js = readFileSync(new URL('../field.js', here), 'utf8');
  assert.match(js, /from '\.\/session-check\.js'/);
});
