// node --test app/test/
// Field page on a phone: the phase sub-line under the big phase word ("Tap when you spot a
// trigger.", "Create distance. Tap Calm again when settled.", "Time to calm ...") is one line
// on some steps and two on others below 480 px, so the status card grew by 18 px on Reaction
// and the action pad moved between taps (field.pad_shift, factory climb-r64: 360-460 px).
// Below 480 px the whole phase block now reserves one title line + two sub-lines. The reserve
// sits on the block, not on the sub-line, so on the narrowest phones a title that wraps
// ("Trigger in view" at 340 px) can use the spare sub-line instead of adding a full line.
// Wider screens (and the 1100 px desktop column, where nothing wraps) keep their height.
// SPDX-License-Identifier: GPL-3.0-only
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const html = readFileSync(join(root, 'app/field.html'), 'utf8');
const css = html.slice(html.indexOf('<style>'), html.indexOf('</style>'));

function phoneBlocks() {
  const out = [];
  const re = /@media \(max-width:\s*(\d+)px\)\s*\{/g;
  let m;
  while ((m = re.exec(css))) {
    let depth = 1, i = re.lastIndex;
    while (depth && i < css.length) { if (css[i] === '{') depth++; else if (css[i] === '}') depth--; i++; }
    out.push({ max: Number(m[1]), body: css.slice(re.lastIndex, i - 1) });
  }
  return out;
}

// Evaluate a px length or a calc() of px numbers and + - * (no other units).
function px(expr) {
  const s = expr.trim().replace(/^calc\((.*)\)$/, '$1').replace(/px/g, '');
  assert.match(s, /^[\d.\s+\-*()]+$/, `min-height "${expr}" must be px or calc() of px`);
  return Function(`return (${s})`)();
}

const base = sel => css.match(new RegExp('\\n  ' + sel.replace('.', '\\.') + ' \\{([^}]*)\\}'));

test('below 480 px the phase block reserves one title line + 4 px + two sub-lines', () => {
  const title = base('.phase')[1].match(/font:\s*600 (\d+)px\/([\d.]+)/);
  const sub = base('.phase small')[1].match(/font:\s*500 (\d+)px\/([\d.]+)/);
  const gap = Number(base('.phase small')[1].match(/margin-top:\s*(\d+)px/)[1]);
  assert.ok(title && sub, 'phase title/sub font shorthand changed; update the reserve');
  const want = title[1] * title[2] + gap + 2 * sub[1] * sub[2]; // 29.4 + 4 + 36.4 = 69.8
  const blocks = phoneBlocks().filter(b => b.max >= 460 && b.max < 480);
  assert.ok(blocks.length, 'no @media (max-width: 460-479px) block in field.html');
  const rule = blocks.map(b => b.body.match(/\.phase\s*\{([^}]*)\}/)).find(Boolean);
  assert.ok(rule, 'no .phase rule inside the phone media query');
  const mh = rule[1].match(/min-height\s*:\s*([^;]+);/);
  assert.ok(mh, '.phase needs a min-height inside the phone media query');
  assert.ok(Math.abs(px(mh[1]) - want) < 0.05, `min-height ${px(mh[1])} px, want ${want.toFixed(1)} px`);
});

test('the sub-line itself has no reserve, so a wrapped title can use its spare line', () => {
  assert.doesNotMatch(base('.phase small')[1], /min-height/);
  for (const b of phoneBlocks()) assert.doesNotMatch(b.body, /\.phase small\s*\{[^}]*min-height/);
  assert.doesNotMatch(base('.phase')[1], /min-height/, 'wide screens keep the natural height');
});
