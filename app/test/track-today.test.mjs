// node --test app/test/
// Track Today log: the card listing what was logged today sat after all thirteen tiles, so on a
// phone its "Tap a tile to log it" hint and the day's record were ~2,500 px below the first tile.
// The card now sits between the needs rings and the tiles, and shows the newest three entries with
// a "Show all N" button, so a busy day does not push the tiles down. Nothing is hidden for good:
// the button reveals every entry (up to the same 40 as before), each with its Delete button.
// SPDX-License-Identifier: GPL-3.0-only
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { todayRows } from '../today-list.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const html = readFileSync(join(root, 'app/track.html'), 'utf8');

test('Today card sits between the needs rings and the tiles', () => {
  const panel = html.slice(html.indexOf('id="v-today"'), html.indexOf('id="v-patterns"'));
  const needs = panel.indexOf('id="needs"'), log = panel.indexOf('id="timeline"'), tiles = panel.indexOf('id="tiles"');
  assert.ok(needs > 0 && log > 0 && tiles > 0, 'needs, timeline and tiles all in the Today panel');
  assert.ok(needs < log && log < tiles, `order needs ${needs} < timeline ${log} < tiles ${tiles}`);
});

test('newest three entries show; the rest wait behind "Show all N"', () => {
  assert.deepEqual(todayRows(0, false), { shown: 0, more: 0 });
  assert.deepEqual(todayRows(3, false), { shown: 3, more: 0 });
  assert.deepEqual(todayRows(7, false), { shown: 3, more: 4 });
  assert.deepEqual(todayRows(7, true), { shown: 7, more: 0 });
});

test('expanded list keeps the old 40-entry cap', () => {
  assert.deepEqual(todayRows(55, true), { shown: 40, more: 0 });
  assert.deepEqual(todayRows(55, false), { shown: 3, more: 37 });
});

test('empty hint points at the tiles below it', () => {
  const js = readFileSync(join(root, 'app/track.js'), 'utf8');
  assert.match(js, /Nothing yet today\. Tap a tile below to log it\./);
  assert.match(js, /todayRows\(/);
  assert.match(js, /Show all \$\{/);
});
