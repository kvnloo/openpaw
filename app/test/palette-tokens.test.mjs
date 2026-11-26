// The warm/calm accents must be one palette across the app pages: the collar's band colours
// (collar-view.js LEVEL_COLORS: active = calm, vigorous = warm) are the reference.
// SPDX-License-Identifier: GPL-3.0-only
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { LEVEL_COLORS } from '../collar-view.js';

const dir = new URL('../', import.meta.url);
const read = (f) => readFileSync(new URL(f, dir), 'utf8');
const token = (html, name) => (html.match(new RegExp(`${name}:\\s*(#[0-9a-f]{6})`, 'i')) || [])[1]?.toLowerCase();
const PAGES = ['index.html', 'track.html', 'field.html'];

test('--warm and --calm on every app page equal the collar band colours', () => {
  const [, calm, warm] = LEVEL_COLORS;
  for (const p of PAGES) {
    const html = read(p);
    assert.equal(token(html, '--warm'), warm, `${p} --warm`);
    assert.equal(token(html, '--calm'), calm, `${p} --calm`);
  }
});

test('no app source still hard-codes the old accent values', () => {
  const old = /#e0925f|#9cc5a8|224,\s*146,\s*95|156,\s*197,\s*168/i;
  const files = readdirSync(dir).filter((f) => /\.(html|js)$/.test(f));
  for (const f of files) assert.ok(!old.test(read(f)), `${f} still uses an old accent value`);
});
