// node --test app/test/
// Track Today card label: the card's micro-label said "Today" directly under the selected
// "Today" tab, so the page said the same word twice and never said which day "today" is (the
// card's day ends at local midnight). The label now carries the local date, in English, built
// from the same local Date the card filters on.
// SPDX-License-Identifier: GPL-3.0-only
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { dayLabel } from '../today-list.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

test('dayLabel names the local weekday, day and month', () => {
  assert.equal(dayLabel(new Date(2026, 10, 26, 0, 5)), 'Thursday 26 November');
  assert.equal(dayLabel(new Date(2026, 0, 1, 23, 59)), 'Thursday 1 January');
  assert.equal(dayLabel(new Date(2027, 1, 28, 12)), 'Sunday 28 February');
});

test('Today card label shows the date instead of repeating the tab name', () => {
  const html = readFileSync(join(root, 'app/track.html'), 'utf8');
  const card = html.slice(html.indexOf('id="needs"'), html.indexOf('id="timeline"'));
  assert.doesNotMatch(card, /<span>Today<\/span>/);
  assert.match(card, /id="todayDate"/);
  const js = readFileSync(join(root, 'app/track.js'), 'utf8');
  assert.match(js, /\$\('#todayDate'\)\.textContent = dayLabel\(/);
});
