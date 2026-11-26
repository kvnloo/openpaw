// Learn lesson cards say what opening one gives you: each card ends in a foot row pinned to the card's
// bottom edge, "<n> sources" (the lede promises every lesson cites its sources) on the left and an
// aria-hidden "Read ->" cue on the right that turns gold on hover/focus. Cards of one row then end on
// the same line instead of leaving a void under the shorter summaries.
// SPDX-License-Identifier: GPL-3.0-only
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { lessonFoot } from '../lesson-card.js';

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

test('lessonFoot counts sources and carries an aria-hidden read cue', () => {
  const html = lessonFoot({ sources: ['https://a.example/1', 'https://b.example/2', 'https://c.example/3'] }, false);
  assert.match(html, /class="lfoot mono"/);
  assert.match(html, />3 sources</);
  assert.match(html, /<span class="go" aria-hidden="true">Read \u2192<\/span>/);
  assert.match(lessonFoot({ sources: ['https://a.example/1'] }, false), />1 source</);
  assert.match(lessonFoot({ sources: ['https://a.example/1', 'https://b.example/2'] }, true), /aria-hidden="true">Read again \u2192</);
});

test('lesson list renders the foot inside each card, pinned to the bottom edge', () => {
  assert.match(read('learn.js'), /lessonFoot\(l, readLessons\[l\.id\]\)/);
  const css = read('learn.html');
  assert.match(css, /\.lcard > \.body\s*\{[^}]*display:\s*flex[^}]*flex-direction:\s*column/);
  assert.match(css, /\.lcard\s*\{[^}]*align-items:\s*stretch/);
  assert.match(css, /\.lfoot\s*\{[^}]*margin-top:\s*auto/);
  assert.match(css, /\.lcard:hover \.go,\s*\.lcard:focus-visible \.go\s*\{[^}]*color:\s*var\(--gold\)/);
});
