// node --test app/test/
// Track: the tile groups (Behavior, Energy & state, Food & water, ...) were told apart only by an
// 11 px muted mono label, so the grid read as 13 equal tiles with no sections (hierarchy).
// Each group label now sits on a hairline that runs the full width of its group, the landing
// page's section-divider pattern (border-top/bottom 1px var(--line)). The rule also shows how
// far a group reaches, so a tile that spans a row's leftover cells reads as part of its group.
// SPDX-License-Identifier: GPL-3.0-only
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const html = readFileSync(join(root, 'app/track.html'), 'utf8');

const rule = (sel) => {
  const esc = sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = html.match(new RegExp('(?:^|[\\s}])' + esc + '\\s*\\{([^}]*)\\}', 'm'));
  return m ? m[1] : null;
};

test('group label sits on a full-width hairline in the landing line colour', () => {
  const r = rule('.cat');
  assert.ok(r, 'no .cat rule in app/track.html');
  assert.match(r, /border-bottom\s*:\s*1px\s+solid\s+var\(--line\)/);
  assert.match(r, /padding-bottom\s*:\s*\d+px/);
});

test('group label still renders as a block inside its group (rule spans the group width)', () => {
  const js = readFileSync(join(root, 'app/track.js'), 'utf8');
  assert.match(js, /<div class="micro cat">\$\{label\}<\/div><div class="tiles">/);
});
