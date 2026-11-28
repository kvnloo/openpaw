// node --test app/test/
// Field page empty panels: "Last episode" and "Log" are both open with nothing in them on a
// fresh walk. Their empty lines must start the same distance under the panel title. The log's
// empty line is an <li> in ol.log, and ol.log li carries 9px row padding meant for log rows
// (with a hairline between them), so "Nothing marked yet." sat 9px lower than "None yet."
// in the panel above it. The empty <li> drops the row padding.
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

test('the empty walk-log line has no log-row padding, so it lines up with the empty last-episode line', () => {
  const body = rule('ol.log li.empty');
  assert.match(body, /padding:\s*0(px)?\s*(;|$)/, `ol.log li.empty should set padding:0, got "${body.trim()}"`);
});

test('log rows with entries keep their 9px row padding', () => {
  assert.match(rule('ol.log li'), /padding:\s*9px 0/);
});
