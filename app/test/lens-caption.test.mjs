// node --test app/test/
// Field "Last episode" caption: it said "Your own marks" even when the Consultant lens
// shows a "Collar movement" row, which the collar measured and the owner did not mark.
// lensCaption(rows) names the collar row only when it is there; the rest stays the same.
// SPDX-License-Identifier: GPL-3.0-only
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { lensCaption } from '../episodes.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

test('without a collar row the caption says the rows are your own marks', () => {
  const c = lensCaption([['Episode', 'x'], ['Trigger', 'y']]);
  assert.match(c, /^Your own marks, laid out the way/);
  assert.doesNotMatch(c, /collar/i);
  assert.match(c, /no validated rule for “trigger stacking”/);
});

test('with a Collar movement row the caption says that row is measured by the collar, not marked', () => {
  const c = lensCaption([['Episode', 'x'], ['Collar movement', 'Simulated · ...']]);
  assert.match(c, /^Your own marks, plus one row measured by the collar \(Collar movement, VeDBA\)/);
  assert.match(c, /not marked by you/);
  assert.match(c, /no validated rule for “trigger stacking”/);
});

test('field.html gives the caption an id and field.js writes it from lensCaption', () => {
  const html = readFileSync(join(root, 'app/field.html'), 'utf8');
  const js = readFileSync(join(root, 'app/field.js'), 'utf8');
  assert.match(html, /<p class="fine" id="epCaption">/);
  assert.match(js, /\$\('epCaption'\)\.textContent = lensCaption\(/);
});
