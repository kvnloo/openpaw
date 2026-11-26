// The instrument pages (collar, track, field) share one button: the same .btn font, weight,
// size, corner radius and resting background as the collar page, so Connect / Log it / Log check
// read as the same control. Learn's lesson buttons are a separate, larger component.
// SPDX-License-Identifier: GPL-3.0-only
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const rule = (html) => (html.match(/^\s*\.btn\s*\{([^}]*)\}/m) || [])[1] || '';
const decl = (body, prop) => (body.match(new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`)) || [])[1]?.trim();
const shape = (f) => {
  const r = rule(read(f));
  const font = decl(r, 'font') || '';
  return {
    weight: font.split(/\s+/)[0],
    size: (font.match(/([\d.]+px)/) || [])[1],
    family: (font.match(/var\(--\w+\)/) || [])[0],
    radius: decl(r, 'border-radius'),
    background: decl(r, 'background'),
  };
};

test('collar, track and field .btn share weight, size, family, radius and background', () => {
  const ref = shape('index.html');
  assert.deepEqual(ref, { weight: '600', size: '14.5px', family: 'var(--sans)', radius: '10px', background: 'transparent' });
  for (const f of ['track.html', 'field.html']) assert.deepEqual(shape(f), ref, f);
});
