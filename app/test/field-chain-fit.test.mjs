// node --test app/test/
// Field page status card: the chain row (the episode's last three marks) wrapped to a
// second row on phones once three chips existed ("0:00 Trigger 10–20 ft", "0:01 Reaction",
// "0:02 Calm again" need ~410 px; a 390 px phone has ~326). The card grew 28 px, so the
// action pad (Trigger seen / Reaction / Calm again / Treat) moved down between taps
// (rendered probe: every width <= 414). The row now keeps to one line: chipsThatFit() keeps
// the newest chips that fit and drops the oldest; the newest mark is always shown and the
// Log panel still lists every mark.
// SPDX-License-Identifier: GPL-3.0-only
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const js = readFileSync(join(root, 'app/field.js'), 'utf8');

test('chipsThatFit keeps every chip when the row is wide enough', async () => {
  const { chipsThatFit } = await import(join(root, 'app/field-chain.js'));
  assert.equal(chipsThatFit([165, 108, 122], 6, 1100), 0);
  assert.equal(chipsThatFit([165, 108, 122], 6, 407), 0); // 395 + 2 gaps = 407 exactly
});

test('chipsThatFit drops the oldest chips that do not fit, newest kept', async () => {
  const { chipsThatFit } = await import(join(root, 'app/field-chain.js'));
  assert.equal(chipsThatFit([165, 108, 122], 6, 406), 1); // one px short: drop the trigger chip
  assert.equal(chipsThatFit([165, 108, 122], 6, 236), 1); // 108 + 6 + 122
  assert.equal(chipsThatFit([165, 108, 122], 6, 235), 2);
});

test('chipsThatFit always keeps the newest chip, even if it alone overflows', async () => {
  const { chipsThatFit } = await import(join(root, 'app/field-chain.js'));
  assert.equal(chipsThatFit([165, 108, 122], 6, 50), 2);
  assert.equal(chipsThatFit([], 6, 300), 0);
});

test('render() fits the episode chips to one row, on render and on resize', () => {
  assert.match(js, /chipsThatFit/, 'field.js does not use chipsThatFit');
  assert.match(js, /function fitChain\(/, 'field.js has no fitChain()');
  assert.match(js, /addEventListener\('resize',\s*fitChain\)/, 'chain row is not re-fitted on resize');
});
