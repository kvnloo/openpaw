// node --test app/test/
// Track Today card day ruler: with nothing logged the card was one line of text in a full-width
// box (at 1440 about 600 px of empty card to its right). It now carries a 24-hour local-day
// ruler: ticks at 00 / 06 / 12 / 18 / 24, a gold "now" mark, and one mark per entry logged
// today at its time of day, so the card shows where in the day things happened.
// SPDX-License-Identifier: GPL-3.0-only
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { dayRuler } from '../today-list.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

test('dayRuler places now and each entry on the local day (0 = midnight, 1 = next midnight)', () => {
  const now = new Date(2026, 10, 26, 18, 0);
  const r = dayRuler([new Date(2026, 10, 26, 12, 0).getTime(), new Date(2026, 10, 26, 6, 0).getTime()], now);
  assert.equal(r.now, 0.75);
  assert.deepEqual(r.marks, [0.25, 0.5]);
});

test('dayRuler drops entries from other days and from the future', () => {
  const now = new Date(2026, 10, 26, 9, 0);
  const r = dayRuler([
    new Date(2026, 10, 25, 23, 59).getTime(),
    new Date(2026, 10, 26, 0, 0).getTime(),
    new Date(2026, 10, 26, 10, 0).getTime(),
  ], now);
  assert.deepEqual(r.marks, [0]);
});

test('dayRuler counts a DST day by its real length', () => {
  // whatever the host zone, fractions stay inside [0, 1] and now is after every mark
  const now = new Date(2026, 2, 29, 23, 30);
  const r = dayRuler([new Date(2026, 2, 29, 1, 0).getTime(), new Date(2026, 2, 29, 23, 0).getTime()], now);
  for (const f of [...r.marks, r.now]) assert.ok(f >= 0 && f <= 1, String(f));
  assert.ok(r.marks.every((f) => f <= r.now));
});

test('Today card holds an aria-hidden day ruler that track.js renders', () => {
  const html = readFileSync(join(root, 'app/track.html'), 'utf8');
  const card = html.slice(html.indexOf('id="needs"'), html.indexOf('id="tiles"'));
  assert.match(card, /<div class="ruler" id="dayRuler" aria-hidden="true">/);
  assert.ok(card.indexOf('id="dayRuler"') < card.indexOf('id="timeline"'), 'ruler sits above the list');
  assert.match(html, /\.ruler\s*\{/);
  const js = readFileSync(join(root, 'app/track.js'), 'utf8');
  assert.match(js, /dayRuler\(/);
  assert.match(js, /\$\('#dayRuler'\)/);
});
