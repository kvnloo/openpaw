// Collar "Right now" card at desktop widths: it shares a grid row with the taller 24-hour rhythm
// card, so its content (gauge + state, then the four stat chips) ended ~100 px above the card's
// bottom edge, leaving a dead band. The card is now a flex column: the stat chips sit on the
// bottom edge and the gauge/state block is centred in the space above them. Stacked (phone)
// layout has no extra height, so nothing moves there.
// Real-browser check: tools/now-fill.mjs (factory folder).
// SPDX-License-Identifier: GPL-3.0-only
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const rule = (sel, src = html) => {
  const esc = sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return (src.match(new RegExp(`(?:^|[\\s}])${esc}\\s*\\{([^}]*)\\}`, 'm')) || [])[1] || '';
};

test('the Right now card is a flex column whose gauge block takes the spare height', () => {
  assert.match(rule('#now'), /display:\s*flex/);
  assert.match(rule('#now'), /flex-direction:\s*column/);
  assert.match(rule('.now'), /flex:\s*1/);
  assert.match(rule('.now'), /align-items:\s*center/);
});
