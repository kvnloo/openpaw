// node --test app/test/
// Track tiles before anything is logged today. The empty tile used to print only the tracker's
// unit ("Treats / treats", "Walk / min"), which did not say what the line was. The empty line now
// has the same shape as the line a logged tile shows ("2 cups", "3× today", "avg 3"), at zero:
// "0 cups today", "0× today"; a rating scale says it has no rating yet and keeps its range;
// a counted scale (Episode) says "none today". Short enough for one line on a 320 px phone.
// SPDX-License-Identifier: GPL-3.0-only
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { TEMPLATES } from '../patterns.js';
import { emptyLine } from '../tile-meta.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const byId = Object.fromEntries(TEMPLATES.map((t) => [t.id, t]));

test('amount trackers show zero in the logged form plus "today"', () => {
  assert.equal(emptyLine(byId.meal), '0 cups today');
  assert.equal(emptyLine(byId.treats), '0 treats today');
  assert.equal(emptyLine(byId.walk), '0 min today');
  assert.equal(emptyLine(byId.visitors), '0 people today');
  assert.equal(emptyLine(byId.medication), '0 dose today');
});

test('rating scales say there is no rating yet and keep the range', () => {
  assert.equal(emptyLine(byId.energy), 'no rating · 1-5');
  assert.equal(emptyLine(byId.sleep), 'no rating · 1-5');
});

test('Episode, a counted scale, says none today', () => {
  assert.equal(emptyLine(byId.episode), 'none today');
});

test('custom trackers: check, no unit, other types', () => {
  assert.equal(emptyLine({ type: 'check' }), '0× today');
  assert.equal(emptyLine({ type: 'count', unit: null }), '0 today');
  assert.equal(emptyLine({ type: 'scale', unit: null }), 'no rating');
  assert.equal(emptyLine({ type: 'scale', unit: '0-10' }), 'no rating · 0-10');
});

test('every built-in empty line fits one line on a 320 px phone tile (<= 15 chars)', () => {
  for (const t of TEMPLATES) assert.ok(emptyLine(t).length <= 15, `${t.id}: "${emptyLine(t)}"`);
});

test('track.js renders the empty tile line from emptyLine()', () => {
  const js = readFileSync(join(root, 'app/track.js'), 'utf8');
  assert.match(js, /import \{[^}]*emptyLine[^}]*\} from '\.\/tile-meta\.js'/);
  assert.match(js, /<span class="meta">\$\{esc\(emptyLine\(t\)\)\}<\/span>/);
});
