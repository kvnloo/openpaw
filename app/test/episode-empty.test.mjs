// node --test app/test/
// Field "Last episode" before any episode exists. The panel used to show the Owner / Consultant /
// Vet switch, one mono row "EPISODE   None marked yet.", the lens caption and a "One-page report"
// button: four controls for nothing (the largest empty block on the phone). With no episode it now
// shows one line saying how an episode starts and what will appear; the lens switch, rows, caption
// and report button live in #epFull, which starts hidden and is shown once an episode exists.
// SPDX-License-Identifier: GPL-3.0-only
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const html = readFileSync(join(root, 'app/field.html'), 'utf8');
const js = readFileSync(join(root, 'app/field.js'), 'utf8');
const panel = html.slice(html.indexOf('id="pEpisode"'), html.indexOf('id="pLog"'));

test('with no episode the panel shows one empty-state line that names how an episode starts', () => {
  const m = panel.match(/<p[^>]*id="epEmpty"[^>]*>([\s\S]*?)<\/p>/);
  assert.ok(m, 'no <p id="epEmpty"> in the Last episode panel');
  assert.doesNotMatch(m[0], /\shidden/);
  assert.match(m[1], /Trigger seen/);
});

test('lens switch, rows, caption and report button start hidden inside #epFull', () => {
  const open = panel.match(/<div[^>]*id="epFull"[^>]*>/);
  assert.ok(open, 'no <div id="epFull">');
  assert.match(open[0], /\shidden/);
  const inside = panel.slice(panel.indexOf(open[0]));
  for (const id of ['epLens', 'epRows', 'epCaption', 'btnReport']) assert.match(inside, new RegExp(`id="${id}"`), `${id} not inside #epFull`);
  assert.doesNotMatch(panel, /None marked yet\./, 'the placeholder row is gone');
});

test('renderEpisode reveals #epFull and hides the empty line once an episode exists', () => {
  const body = js.slice(js.indexOf('async function renderEpisode'), js.indexOf('// One-page report'));
  assert.match(body, /\$\('epFull'\)\.hidden = false/);
  assert.match(body, /\$\('epEmpty'\)\.hidden = true/);
});
