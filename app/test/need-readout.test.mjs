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
  assert.match(body, /<em>\$\{fmt\(v\)\}\$\{u \? `<small>\$\{u\}<\/small>` : ''\}<\/em>/,
    'renderNeeds centre is not value + <small>unit</small>');
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
