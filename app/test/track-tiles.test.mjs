// node --test app/test/
// Track tracker tiles: a tile logs on tap, so it must look tappable, not like a static info card.
// Each logging tile carries a "+" tap cue in its top-right corner (decorative, aria-hidden, the
// button's name stays the tracker name); the cue turns gold on hover and keyboard focus.
// SPDX-License-Identifier: GPL-3.0-only
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const js = readFileSync(join(root, 'app/track.js'), 'utf8');
const html = readFileSync(join(root, 'app/track.html'), 'utf8');

test('each logging tile renders an aria-hidden "+" tap cue', () => {
  const tile = js.match(/<button class="tile" data-t=[^\n]*<\/button>/);
  assert.ok(tile, 'no logging tile template in app/track.js');
  assert.match(tile[0], /<span class="tap" aria-hidden="true">\+<\/span>/);
});

test('tap cue sits top-right, quiet by default and gold on hover and focus', () => {
  const base = html.match(/\.tile \.tap\s*\{([^}]*)\}/);
  assert.ok(base, 'no .tile .tap rule in app/track.html');
  assert.match(base[1], /position\s*:\s*absolute/);
  assert.match(base[1], /top\s*:/);
  assert.match(base[1], /right\s*:/);
  assert.match(base[1], /color\s*:\s*var\(--mute\)/);
  const hot = html.match(/\.tile:hover \.tap\s*,\s*\.tile:focus-visible \.tap\s*\{([^}]*)\}/);
  assert.ok(hot, 'no hover/focus-visible rule for .tap');
  assert.match(hot[1], /color\s*:\s*var\(--gold\)/);
});
