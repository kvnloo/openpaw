// node --test app/test/
// Field page on a wide screen: the marking controls (status card, action pad, undo/tag row,
// voice) sit in a left column that stays in view, and the panels (session check, glasses
// preview, collar, camera, last episode, log) fill a right column, instead of one 520 px
// column with ~900 px of empty black beside it at 1440. The phone layout and the DOM/focus
// order are unchanged: the two groups are only wrappers around the existing elements.
// SPDX-License-Identifier: GPL-3.0-only
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const html = readFileSync(join(root, 'app/field.html'), 'utf8');
const body = html.slice(html.indexOf('<main>'), html.indexOf('</main>'));

test('marking controls are grouped in a cockpit wrapper, panels in a panels wrapper, in that order', () => {
  const c = body.indexOf('<div class="cockpit">');
  const p = body.indexOf('<div class="panels">');
  assert.ok(c > 0, 'no <div class="cockpit"> in field.html <main>');
  assert.ok(p > c, 'no <div class="panels"> after the cockpit');
  const cockpit = body.slice(c, p);
  for (const id of ['id="status"', 'id="aTrigger"', 'id="btnUndo"', 'id="btnMic"']) assert.ok(cockpit.includes(id), `${id} not in the cockpit`);
  const panels = body.slice(p);
  for (const id of ['id="pCheck"', 'id="pHud"', 'id="pCollar"', 'id="pCam"', 'id="pEpisode"', 'id="pLog"']) assert.ok(panels.includes(id), `${id} not in the panels group`);
});

test('wide screens get two columns with a sticky cockpit; phone CSS keeps one column', () => {
  const mq = html.match(/@media \(min-width:\s*(\d+)px\)\s*\{([\s\S]*?)\n  \}/);
  assert.ok(mq, 'no min-width media query in field.html');
  assert.ok(Number(mq[1]) >= 900 && Number(mq[1]) <= 1200, `breakpoint ${mq[1]} px should be between 900 and 1200`);
  assert.match(mq[2], /main\s*\{[^}]*max-width\s*:\s*(1[0-9]{3})px/);
  assert.match(mq[2], /\.layout\s*\{[^}]*display\s*:\s*grid[^}]*grid-template-columns/);
  assert.match(mq[2], /\.cockpit\s*\{[^}]*position\s*:\s*sticky/);
  const base = html.match(/\n  main \{([^}]*)\}/);
  assert.match(base[1], /max-width\s*:\s*520px/, 'phone main width must stay 520px');
});
