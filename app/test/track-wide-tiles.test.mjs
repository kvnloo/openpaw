// node --test app/test/
// Track, phone layout: an odd last tile in a two-column group spans the whole row (Sleep quality,
// Water, New tracker with no custom trackers). At the logging-tile height (88 px) that made a
// 350 x 88 px slab with the name top-left, the unit bottom-left and nothing in between.
// A full-row tile is now one compact row: name, then the unit on the same baseline, "+" cue
// vertically centred, 56 px tall. The key tile (Episode, the page's focal tile) keeps its size,
// and the desktop grid is untouched (the rule lives in the phone media query only).
// SPDX-License-Identifier: GPL-3.0-only
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const html = readFileSync(join(root, 'app/track.html'), 'utf8');

const phone = (() => {
  const i = html.indexOf('@media (max-width:560px)');
  assert.ok(i >= 0, 'no phone media query in app/track.html');
  let depth = 0, j = html.indexOf('{', i);
  for (let k = j; k < html.length; k++) {
    if (html[k] === '{') depth++;
    else if (html[k] === '}' && --depth === 0) return html.slice(j + 1, k);
  }
  return '';
})();

const SEL = '.grp:not(.pair) .tiles > .tile:last-child:nth-child(odd):not(.key)';
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

test('phone: a full-row tile (not the key tile) is one compact row', () => {
  const rule = phone.match(new RegExp(esc(SEL) + '\\s*\\{([^}]*)\\}'));
  assert.ok(rule, `no "${SEL}" rule in the phone media query`);
  assert.match(rule[1], /flex-direction\s*:\s*row/);
  assert.match(rule[1], /align-items\s*:\s*baseline/);
  const mh = rule[1].match(/min-height\s*:\s*(\d+)px/);
  assert.ok(mh && +mh[1] < 88, 'full-row tile must be shorter than the 88 px logging tile');
});

test('phone: the "+" cue of a full-row tile is vertically centred', () => {
  const rule = phone.match(new RegExp(esc(SEL) + '\\s+\\.tap\\s*\\{([^}]*)\\}'));
  assert.ok(rule, 'no centred .tap rule for full-row tiles');
  assert.match(rule[1], /top\s*:\s*50%/);
  assert.match(rule[1], /translateY\(-50%\)/);
});

test('desktop: no compact-row rule outside the phone media query', () => {
  const outside = html.replace(phone, '');
  assert.ok(!outside.includes(SEL), 'compact full-row rule leaked outside the phone media query');
});
