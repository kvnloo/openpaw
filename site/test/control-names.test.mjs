// node --test site/test/
// Accessible-name guard: every visible form control in the static pages has a name a screen
// reader can announce. A wrapping <label> does NOT count when it also wraps an <output>: the
// label's control is its first labelable descendant, so the label names the <output> and the
// range slider after it stays unnamed (HTML spec, "labeled control").
// SPDX-License-Identifier: GPL-3.0-only
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const FILES = ['site/index.html', 'app/index.html', 'app/track.html', 'app/field.html', 'app/learn.html'];
const attr = (tag, a) => (tag.match(new RegExp(`\\s${a}="([^"]*)"`)) || [])[1];
const textOfId = (src, id) => {
  const m = src.match(new RegExp(`<(\\w+)[^>]*\\sid="${id}"[^>]*>([\\s\\S]*?)</\\1>`));
  return m ? m[2].replace(/<[^>]+>/g, '').trim() : '';
};

function unnamed(src) {
  const bad = [];
  for (const m of src.matchAll(/<input\b[^>]*>/g)) {
    const tag = m[0];
    if (/type="hidden"/.test(tag)) continue;
    if ((attr(tag, 'aria-label') || '').trim()) continue;
    const by = attr(tag, 'aria-labelledby');
    if (by && by.split(/\s+/).map((id) => textOfId(src, id)).join(' ').trim()) continue;
    const id = attr(tag, 'id');
    if (id && new RegExp(`<label[^>]*\\sfor="${id}"`).test(src)) continue;
    // wrapping label: only names this input if no other labelable element precedes it inside the label
    const before = src.slice(0, m.index);
    const open = before.lastIndexOf('<label');
    if (open > before.lastIndexOf('</label>')) {
      const inside = before.slice(open);
      if (!/<(output|input|select|textarea|button|meter|progress)\b/.test(inside.replace(/^<label[^>]*>/, ''))) continue;
    }
    bad.push(tag);
  }
  return bad;
}

for (const f of FILES) {
  test(`${f}: every input has an accessible name`, () => {
    assert.deepEqual(unnamed(readFileSync(join(root, f), 'utf8')), []);
  });
}

test('guard catches a slider whose wrapping label names an <output> first', () => {
  const src = '<label><span>Distance</span><output for="x">5</output><input type="range" id="x"></label>';
  assert.equal(unnamed(src).length, 1);
  assert.equal(unnamed('<label><span id="l">Distance</span><input type="range" aria-labelledby="l"></label>').length, 0);
});
