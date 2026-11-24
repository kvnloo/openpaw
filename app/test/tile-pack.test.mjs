// node --test app/test/
// Track Today tiles: category groups flow through one 4-column grid (same columns as the needs row).
// A row the next group does not fit into used to end in an empty cell (1440: after Water, after
// "+ New tracker"). packGroups gives that row's leftover cells to its last group, whose last tile
// spans them, so every desktop row is full. Pure layout math; DOM order is unchanged.
// SPDX-License-Identifier: GPL-3.0-only
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { packGroups } from '../tile-pack.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

test('default tracker groups fill every 4-column row', () => {
  // Behavior 1, Energy & state 3, Food & water 3, Activity 4, Health 1, Context 1, Your trackers 1 (+ New)
  const p = packGroups([1, 3, 3, 4, 1, 1, 1]);
  assert.deepEqual(p.map((g) => g.span), [1, 3, 4, 4, 1, 1, 2]);
  assert.deepEqual(p.map((g) => g.last), [1, 1, 2, 1, 1, 1, 2]);
});

test('rows that are already full are left alone', () => {
  assert.deepEqual(packGroups([4, 2, 2]), [{ span: 4, last: 1 }, { span: 2, last: 1 }, { span: 2, last: 1 }]);
});

test('a lone group takes the whole row and its last tile the leftover', () => {
  assert.deepEqual(packGroups([3]), [{ span: 4, last: 2 }]);
  assert.deepEqual(packGroups([1, 2], 4), [{ span: 1, last: 1 }, { span: 3, last: 2 }]);
});

test('track.js uses the packing and the desktop CSS spans the last tile', () => {
  const js = readFileSync(join(root, 'app/track.js'), 'utf8');
  const html = readFileSync(join(root, 'app/track.html'), 'utf8');
  assert.match(js, /import \{ packGroups \} from '\.\/tile-pack\.js'/);
  assert.match(js, /--last:/);
  assert.match(html, /\.tiles > \.tile:last-child\s*\{\s*grid-column:\s*span var\(--last,\s*1\)/);
});
