// Track's Today / Patterns / Trackers tabs told the selected tab apart only by a fill of
// --bg3 (#181815) on the bar's near-black (#0c0c0a), about 1.1:1, plus brighter text, so at a
// glance the bar read as three equal labels. The selected tab now also carries a short gold
// bar under its label (the page's one accent, like the need rings' gold start dot), drawn by
// ::after so the DOM, focus order and accessible names stay the same.
// Real-browser check: rounds/dream-r55/tab-probe.mjs (factory folder), 390 + 1440 px.
// SPDX-License-Identifier: GPL-3.0-only
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../track.html', import.meta.url), 'utf8');
const rule = (sel) => {
  const esc = sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return (html.match(new RegExp(`(?:^|[\\s}])${esc}\\s*\\{([^}]*)\\}`, 'm')) || [])[1] || '';
};

test('the selected Track tab draws a gold bar under its label', () => {
  const mark = rule('.tabs button[aria-selected="true"]::after');
  assert.match(mark, /background:\s*var\(--gold\)/);
  assert.match(mark, /content:\s*''/);
  assert.match(mark, /position:\s*absolute/);
});

test('the tab button is the positioning box for its bar, and unselected tabs draw none', () => {
  assert.match(rule('.tabs button'), /position:\s*relative/);
  assert.doesNotMatch(rule('.tabs button::after'), /background:\s*var\(--gold\)/);
});
