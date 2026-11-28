// node --test app/test/
// Field page "Undo last" before anything is marked. It is a disabled .ghost button, and
// .ghost:disabled faded the whole button to opacity .4: the label came out about 3.3:1 on the
// page background and the button read as an empty box beside "Tag body language". The
// disabled state now keeps the label legible in --dim (the page's secondary-text token) and
// draws a dashed border, the app's empty-slot pattern (empty budget tracks, New tracker tile),
// so it reads as "not yet available" rather than missing.
// SPDX-License-Identifier: GPL-3.0-only
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const html = readFileSync(join(root, 'app/field.html'), 'utf8');

function rule(selector) {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = html.match(new RegExp(`(^|\\n)\\s*${esc}\\s*\\{([^}]*)\\}`));
  assert.ok(m, `no CSS rule for ${selector} in field.html`);
  return m[2];
}

test('a disabled ghost button is not faded with opacity, so its label stays legible', () => {
  const body = rule('.ghost:disabled');
  const op = body.match(/opacity:\s*([\d.]+)/);
  assert.ok(!op || Number(op[1]) === 1, `.ghost:disabled fades to opacity ${op && op[1]}`);
  assert.match(body, /color:\s*var\(--dim\)/, `.ghost:disabled label should use --dim, got "${body.trim()}"`);
});

test('a disabled ghost button draws a dashed border (empty-slot pattern)', () => {
  assert.match(rule('.ghost:disabled'), /border-style:\s*dashed/);
});

test('Undo last still starts disabled and the enabled ghost style is unchanged', () => {
  assert.match(html, /<button class="ghost" id="btnUndo" disabled>Undo last<\/button>/);
  const g = rule('.ghost');
  assert.match(g, /border:1px solid var\(--line2\)/);
  assert.match(g, /color:var\(--ink\)/);
});
