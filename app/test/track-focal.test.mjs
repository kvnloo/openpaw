// node --test app/test/
// Track tiles: thirteen tiles of equal weight gave the grid no focal point. Behavior tiles
// (the Episode tracker: reactivity is OpenPaw's first use case) are the key tiles: they carry the
// same gold corner brackets as the page's cards, and every other tile stays plain.
// The brackets sit on the tile's border, so a key tile must not clip them (overflow visible),
// and the tap flash keeps the tile's rounded corners.
// SPDX-License-Identifier: GPL-3.0-only
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const js = readFileSync(join(root, 'app/track.js'), 'utf8');
const html = readFileSync(join(root, 'app/track.html'), 'utf8');

test('behavior tiles render as key tiles with corner brackets; other tiles stay plain', () => {
  const tile = js.match(/<button class="tile[^\n]*data-t=[^\n]*<\/button>/);
  assert.ok(tile, 'no logging tile template in app/track.js');
  assert.match(js, /const key = t\.category === 'behavior'/, 'key class is not tied to the behavior category');
  assert.match(tile[0], /class="tile\$\{key \? ' key' : ''\}"/);
  assert.match(tile[0], /<span class="br tl"><\/span><span class="br bR"><\/span>/);
  // brackets are conditional: plain tiles must not get them
  assert.match(tile[0], /\?[^:]*<span class="br tl">/);
});

test('key tiles do not clip their brackets and keep rounded flash corners', () => {
  const key = html.match(/\.tile\.key\s*\{([^}]*)\}/);
  assert.ok(key, 'no .tile.key rule in app/track.html');
  assert.match(key[1], /overflow\s*:\s*visible/);
  const flash = html.match(/\.tile\.flash::after\s*\{([^}]*)\}/);
  assert.ok(flash);
  assert.match(flash[1], /border-radius\s*:\s*inherit/);
});
