// node --test site/test/
// Design-token guard: every page declares the same text tokens, and each text token is readable
// (WCAG 2.x contrast >= 4.5:1 for body text) on every page background token.
// SPDX-License-Identifier: GPL-3.0-only
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const FILES = ['site/style.css', 'app/index.html', 'app/track.html', 'app/field.html', 'app/learn.html'];

function tokens(file) {
  const src = readFileSync(join(root, file), 'utf8');
  const out = {};
  for (const m of src.matchAll(/--(bg\d?|ink|mute|dim)\s*:\s*(#[0-9a-fA-F]{6})/g)) out[m[1]] ??= m[2].toLowerCase();
  return out;
}
const lum = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
export const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

test('contrast helper matches WCAG reference values', () => {
  assert.equal(ratio('#000000', '#ffffff').toFixed(2), '21.00');
  assert.equal(ratio('#777777', '#ffffff').toFixed(2), '4.48');
});

test('every page declares the same text and background tokens', () => {
  const ref = tokens(FILES[0]);
  for (const f of FILES.slice(1)) {
    const t = tokens(f);
    for (const k of ['bg', 'bg2', 'ink', 'mute', 'dim']) assert.equal(t[k], ref[k], `${f} --${k}`);
  }
});

test('every text token reaches 4.5:1 on every background token', () => {
  for (const f of FILES) {
    const t = tokens(f);
    for (const fg of ['ink', 'mute', 'dim']) for (const bg of ['bg', 'bg2', 'bg3']) {
      if (!t[bg]) continue;
      const r = ratio(t[fg], t[bg]);
      assert.ok(r >= 4.5, `${f}: --${fg} ${t[fg]} on --${bg} ${t[bg]} is ${r.toFixed(2)}:1`);
    }
  }
});
