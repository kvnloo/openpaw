// node --test app/test/
// Field page panels: what is open on first load. The glasses preview is a simulation of
// hardware that does not exist yet; open, its 300 px black square was the largest element
// on the page at both widths and pushed the last episode and the walk log below the fold.
// It starts collapsed like the other optional panels (live collar, camera); the stop rule,
// last episode and log stay open. The HUD still updates while collapsed (field.js writes it).
// SPDX-License-Identifier: GPL-3.0-only
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const html = readFileSync(join(root, 'app/field.html'), 'utf8');

function detailsTag(id) {
  const m = html.match(new RegExp(`<details[^>]*id="${id}"[^>]*>`));
  assert.ok(m, `no <details id="${id}"> in field.html`);
  return m[0];
}
const isOpen = (id) => /\sopen(\s|>|=)/.test(detailsTag(id));

test('the planned glasses preview starts collapsed, like the other optional panels', () => {
  for (const id of ['pHud', 'pCollar', 'pCam']) assert.equal(isOpen(id), false, `${id} should start collapsed`);
});

test('stop rule, last episode and walk log start open', () => {
  for (const id of ['pCheck', 'pEpisode', 'pLog']) assert.equal(isOpen(id), true, `${id} should start open`);
});

test('the glasses panel label says it is optional, like the other optional panels', () => {
  const sum = html.slice(html.indexOf('id="pHud"'), html.indexOf('</summary>', html.indexOf('id="pHud"')));
  assert.match(sum, /class="micro">Optional · /);
});
