// Track's log-sheet chips and Field's tag chips are the same pill toggle (.chip with
// [aria-pressed]): same font weight, size, family and pill radius, so a tag reads the same on
// both pages. Field's values are the reference (its chips are visible at load).
// SPDX-License-Identifier: GPL-3.0-only
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const rule = (html) => (html.match(/^\s*\.chip\s*\{([^}]*)\}/m) || [])[1] || '';
const decl = (body, prop) => (body.match(new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`)) || [])[1]?.trim();
const shape = (f) => {
  const r = rule(read(f));
  const font = decl(r, 'font') || '';
  return {
    weight: font.split(/\s+/)[0],
    size: (font.match(/([\d.]+px)/) || [])[1],
    family: (font.match(/var\(--\w+\)/) || [])[0],
    radius: decl(r, 'border-radius'),
  };
};

test('track and field pill chips share weight, size, family and radius', () => {
  const ref = shape('field.html');
  assert.deepEqual(ref, { weight: '500', size: '14px', family: 'var(--sans)', radius: '99px' });
  assert.deepEqual(shape('track.html'), ref, 'track.html');
});
