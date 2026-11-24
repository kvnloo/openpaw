// node --test site/test/
// Field page contrast guard: text drawn on fixed, non-token backgrounds (the black glasses HUD,
// the gold "Trigger" button) must reach WCAG 2.x 4.5:1 for small text. Semi-transparent text is
// composited over its background before measuring, the way the browser paints it.
// SPDX-License-Identifier: GPL-3.0-only
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { ratio } from './tokens.test.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const src = readFileSync(join(root, 'app/field.html'), 'utf8');
const vars = Object.fromEntries([...src.matchAll(/--([\w-]+)\s*:\s*(#[0-9a-fA-F]{6})/g)].map((m) => [m[1], m[2].toLowerCase()]));

function rule(selector, prop) {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = src.match(new RegExp(`(?:^|\\n)\\s*${esc}\\s*\\{([^}]*)\\}`));
  assert.ok(m, `rule ${selector} not found in app/field.html`);
  const d = m[1].match(new RegExp(`(?:^|;|\\s)${prop}\\s*:\\s*([^;]+)`));
  assert.ok(d, `${selector} has no ${prop}`);
  return d[1].trim();
}
const hex = (v) => {
  const r = v.match(/var\(--([\w-]+)\)/); if (r) return vars[r[1]];
  const s = v.toLowerCase().match(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/);
  return s ? `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}` : v.toLowerCase();
};
const toHex = (rgb) => '#' + rgb.map((x) => Math.round(x).toString(16).padStart(2, '0')).join('');
const rgbOf = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
function paint(fg, bg) {
  const a = fg.match(/rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)/);
  if (!a) return hex(fg);
  const al = Number(a[4]); const b = rgbOf(bg);
  return toHex([1, 2, 3].map((i, k) => Number(a[i]) * al + b[k] * (1 - al)));
}

test('glasses HUD corner caption reaches 4.5:1 on the black HUD', () => {
  const bg = hex(rule('.hud', 'background'));
  const fg = paint(rule('.hud-corner', 'color'), bg);
  const r = ratio(fg, bg);
  assert.ok(r >= 4.5, `.hud-corner ${fg} on ${bg} is ${r.toFixed(2)}:1`);
});

test('Trigger button caption reaches 4.5:1 on gold', () => {
  const bg = hex(rule('.act.trigger', 'background'));
  const fg = paint(rule('.act.trigger .micro', 'color'), bg);
  const r = ratio(fg, bg);
  assert.ok(r >= 4.5, `.act.trigger .micro ${fg} on ${bg} is ${r.toFixed(2)}:1`);
});
