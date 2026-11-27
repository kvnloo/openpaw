// node --test site/test/
// Keyboard focus guard: every page shares one focus indicator, `:focus-visible { outline: 2px solid
// var(--gold) }`. A rule may only switch that outline off for keyboard focus when it draws its own ring
// instead (a box-shadow ring on the element, its ::after, or a range thumb). The landing Evidence rows
// used to share their hover style with focus (gold text + 6 px shift, outline none), so focus looked
// exactly like the row under the mouse (WCAG 2.4.7 Focus Visible).
// SPDX-License-Identifier: GPL-3.0-only
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const FILES = ['site/style.css', 'app/index.html', 'app/track.html', 'app/field.html', 'app/learn.html'];
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');
// flat rule list: [selector, body] (one level of @media nesting is flattened)
function rules(css) {
  const out = []; const re = /([^{}]+)\{([^{}]*)\}/g; let m;
  while ((m = re.exec(strip(css)))) out.push([m[1].trim().replace(/^@media[^{]*\{/, '').trim(), m[2]]);
  return out;
}
const all = FILES.flatMap((f) => rules(readFileSync(join(root, f), 'utf8')).map(([sel, body]) => ({ f, sel, body })));
const ringFor = (sel) => {
  // the replacement ring must be declared for the same base selector in its :focus-visible state
  const bases = sel.split(',').map((s) => s.trim()).filter((s) => s.includes(':focus-visible')).map((s) => s.split(':focus-visible')[0]);
  return bases.every((b) => all.some((r) => r.sel.split(',').some((s) => s.trim().startsWith(b + ':focus-visible')) && /box-shadow\s*:\s*0 0 0/.test(r.body)));
};

test('the shared 2px gold focus ring is declared on every page', () => {
  for (const f of FILES) {
    const r = rules(readFileSync(join(root, f), 'utf8')).find(([sel]) => sel === ':focus-visible');
    assert.ok(r, `${f}: no :focus-visible rule`);
    assert.match(r[1], /outline\s*:\s*2px solid var\(--gold\)/, `${f}: focus ring is not 2px solid var(--gold)`);
  }
});

test('no rule turns the focus ring off without drawing its own ring', () => {
  const bad = all.filter((r) => r.sel.includes(':focus-visible') && /outline\s*:\s*(none|0)\b/.test(r.body) && !ringFor(r.sel));
  assert.deepEqual(bad.map((r) => `${r.f}: ${r.sel}`), []);
});
