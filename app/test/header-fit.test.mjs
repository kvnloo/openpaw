// Collar header on phones: the five-entry nav plus the "Not connected" pill need ~391 px, more
// than a 390 px phone has, so "Learn" fell onto its own row and the pill text broke over two
// lines. The pill never wraps its text, the nav never wraps, and below 600 px the header wraps
// on purpose: nav on one full row, the pill on the row under it.
// Real-browser check: tools/header-fit.mjs (factory folder).
// SPDX-License-Identifier: GPL-3.0-only
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const rule = (sel, src = html) => {
  const esc = sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return (src.match(new RegExp(`(?:^|[\\s}])${esc}\\s*\\{([^}]*)\\}`, 'm')) || [])[1] || '';
};
const phone = (html.match(/@media \(max-width:600px\) \{([\s\S]*?)\n  \}/) || [])[1] || '';

test('the status pill keeps its text on one line and the nav never wraps', () => {
  assert.match(rule('.status'), /white-space:\s*nowrap/);
  assert.match(rule('.top nav'), /flex-wrap:\s*nowrap/);
});

test('on phones the header wraps: nav takes the full first row, the pill sits below it', () => {
  assert.match(rule('.top', phone), /flex-wrap:\s*wrap/);
  assert.match(rule('.top nav', phone), /flex-basis:\s*100%|width:\s*100%/);
});
