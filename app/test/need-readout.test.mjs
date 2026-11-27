// node --test app/test/
// Track "Today" need rings: the number inside a ring is the day's value, so it must read as a
// value with its unit ("0 min"), not a bare 13px mono "0" whose unit sits two lines lower
// under the label ("OF 20 MIN"). RUBRIC data clarity: every figure has units.
// SPDX-License-Identifier: GPL-3.0-only
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const js = readFileSync(join(root, 'app/track.js'), 'utf8');
const html = readFileSync(join(root, 'app/track.html'), 'utf8');
const body = js.slice(js.indexOf('function renderNeeds'), js.indexOf('\n}\n', js.indexOf('function renderNeeds')));

test('ring centre prints the unit under the value when the need has one', () => {
  assert.match(body, /<em>\$\{fmt\(v\)\}\$\{r \? `<small>\$\{r\}<\/small>` : ''\}<\/em>/,
    'renderNeeds centre is not value + <small>unit</small>');
});

test('every ring centre has a unit line, so the four figures share one baseline', () => {
  // Meals had no unit, so its figure was centred alone ~5 px below the other three.
  // It counts meals: the ring says "meals", the goal line stays "of 2" (no repeat).
  const meals = body.match(/\['Meals',[^\]]*\]/);
  assert.ok(meals, 'no Meals need item');
  assert.match(meals[0], /, '', [^,]*'meals'\]$/, `Meals ring has no ring unit: ${meals[0]}`);
  // one meal is "1 meal", not "1 meals"
  assert.match(meals[0], /=== 1 \? 'meal' : 'meals'\]$/, `Meals ring unit has no singular: ${meals[0]}`);
  assert.match(body, /\(\[label, v, goal, u, r = u\]\)/, 'items do not take a ring unit that defaults to the goal unit');
  assert.match(body, /<span>of \$\{goal\}\$\{u \? ' ' \+ u : ''\}<\/span>/, 'goal line no longer uses the goal unit');
});

test('ring value is a larger sans figure and the unit a small mono label', () => {
  const em = html.match(/\.need-wrap em\s*\{([^}]*)\}/);
  assert.ok(em, 'no .need-wrap em rule');
  const size = +(em[1].match(/font:\s*\d+\s+(\d+(?:\.\d+)?)px/) || [])[1];
  assert.ok(size >= 17, `ring value is ${size}px, want >= 17px`);
  assert.match(em[1], /var\(--sans\)/);
  const sm = html.match(/\.need-wrap em small\s*\{([^}]*)\}/);
  assert.ok(sm, 'no .need-wrap em small rule');
  assert.match(sm[1], /var\(--mono\)/);
  assert.match(sm[1], /color\s*:\s*var\(--mute\)/);
});
