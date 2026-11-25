// node --test app/test/
// Track: the "New tracker" tile sits in the same grid as the logging tiles, so it uses the same
// anatomy: name top-left, mono meta line at the bottom, "+" cue top-right (decorative, aria-hidden).
// Before, it centred "+ New tracker" with the meta glued under it, so its name sat lower than every
// neighbour's name and its meta higher than every neighbour's unit line. The dashed border stays:
// it is the one tile that creates instead of logs.
// SPDX-License-Identifier: GPL-3.0-only
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const js = readFileSync(join(root, 'app/track.js'), 'utf8');
const html = readFileSync(join(root, 'app/track.html'), 'utf8');

test('New tracker tile carries the same aria-hidden "+" cue and a plain name', () => {
  const add = js.match(/<button class="tile add"[^']*<\/button>/);
  assert.ok(add, 'no New tracker tile template in app/track.js');
  assert.match(add[0], /<span class="tap" aria-hidden="true">\+<\/span>/);
  assert.match(add[0], /<span class="nm">New tracker<\/span>/);
  // logging tiles wrap the meta line in a plain <span> (it swaps with today's total); the add tile
  // does the same so its meta sits on the same line box (unwrapped it sat 2.9 px lower in Chromium)
  assert.match(add[0], /<span><span class="meta">anything you like<\/span><\/span>/);
});

test('New tracker tile keeps the tile column layout (name top, meta bottom) and its dashed border', () => {
  const rule = html.match(/\.tile\.add\s*\{([^}]*)\}/);
  assert.ok(rule, 'no .tile.add rule in app/track.html');
  assert.match(rule[1], /border-style\s*:\s*dashed/);
  assert.doesNotMatch(rule[1], /justify-content\s*:\s*center/);
});
