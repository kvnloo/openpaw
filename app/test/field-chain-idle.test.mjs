// node --test app/test/
// Field page status card before any episode. The chain row (the last three marks of the
// episode) keeps a 24 px min-height so the action pad does not jump when the first mark
// lands, but while idle it was an empty 36 px band under "Tap when you spot a trigger."
// It now shows the chain's steps as dashed, dim placeholder chips ("Trigger", "Reaction",
// "Calm again"), the app's empty-slot pattern (collar Bursts key row, empty budget tracks):
// what will fill in, and in what order. They are aria-hidden (the row's real
// content is the episode's marks), and real chips replace them as soon as one exists.
// SPDX-License-Identifier: GPL-3.0-only
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const html = readFileSync(join(root, 'app/field.html'), 'utf8');
const js = readFileSync(join(root, 'app/field.js'), 'utf8');

function rule(selector) {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = html.match(new RegExp(`(^|\\n)\\s*${esc}\\s*\\{([^}]*)\\}`));
  assert.ok(m, `no CSS rule for ${selector} in field.html`);
  return m[2];
}

test('idle render fills the chain row with the three placeholder steps, in order', async () => {
  const mod = await import(join(root, 'app/field-chain.js'));
  // The pad's own button names, no "-:--" time: with it the three chips need ~340 px and
  // wrapped to two rows on a 390 px phone (rendered probe), so the card grew 28 px.
  assert.deepEqual(mod.CHAIN_SLOTS, ['Trigger', 'Reaction', 'Calm again']);
  const idle = js.slice(js.indexOf("st.dataset.phase = 'idle'"), js.indexOf('function renderLog'));
  assert.match(idle, /CHAIN_SLOTS/, 'idle branch of render() does not draw CHAIN_SLOTS');
});

test('placeholder chips are dashed, dim and hidden from assistive tech', () => {
  const body = rule('.chain span.slot');
  assert.match(body, /border-style:\s*dashed/);
  assert.match(body, /color:\s*var\(--dim\)/);
  assert.match(body, /background:\s*transparent/);
  assert.match(js, /\.slot|'slot'/);
  assert.match(js, /aria-hidden/);
});

test('the row keeps its min-height so the action pad does not move when marks land', () => {
  assert.match(rule('.chain'), /min-height:24px/);
});
