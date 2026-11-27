// Track's intro paragraph left "days." alone on its last line on a 390 px phone (and at 320),
// the first text a visitor reads. The lede uses text-wrap: pretty, which lets the browser
// rebalance the last lines so a single word is not left on its own; browsers without it fall
// back to normal wrapping.
// Real-browser check: tools/lede-orphan.mjs (factory folder), 320-1440 px.
// SPDX-License-Identifier: GPL-3.0-only
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../track.html', import.meta.url), 'utf8');
const rule = (sel) => {
  const esc = sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return (html.match(new RegExp(`(?:^|[\\s}])${esc}\\s*\\{([^}]*)\\}`, 'm')) || [])[1] || '';
};

test('the Track intro paragraph wraps with text-wrap: pretty so its last line is not one word', () => {
  assert.match(rule('.lede'), /text-wrap:\s*pretty/);
});
