// Text fields on the collar (device name), Track (log sheets) and Learn (My dog form) are one
// component: same font, size, corners and padding. The size is 16px because iOS Safari zooms the
// whole page when a field with text under 16px gets focus, and Track and Learn are used on phones
// (https://css-tricks.com/16px-or-larger-text-prevents-ios-form-zoom/).
// SPDX-License-Identifier: GPL-3.0-only
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const rule = (html) => (html.match(/^\s*input\[type=text\][^{]*\{([^}]*)\}/m) || [])[1] || '';
const decl = (body, prop) => (body.match(new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`)) || [])[1]?.trim();
const shape = (f) => {
  const r = rule(read(f));
  const font = decl(r, 'font') || '';
  return {
    weight: font.split(/\s+/)[0],
    size: (font.match(/([\d.]+)px/) || [])[1],
    family: (font.match(/var\(--\w+\)/) || [])[0],
    radius: decl(r, 'border-radius'),
    padding: decl(r, 'padding'),
    border: decl(r, 'border'),
  };
};
const REF = { weight: '500', size: '16', family: 'var(--sans)', radius: '9px', padding: '11px 12px', border: '1px solid var(--line2)' };

for (const f of ['index.html', 'track.html', 'learn.html']) {
  test(`${f} text inputs use the shared field style`, () => {
    assert.deepEqual(shape(f), REF, f);
  });
}

test('collar Device & data: a label next to a field is centred on it, not top-aligned', () => {
  // the 16px field is ~43px tall; a top-aligned dt sat 14px above its text centre (tools/input-fields.mjs)
  const m = read('index.html').match(/\.kv\s+dt:has\(\+\s*dd\s*>\s*input\)\s*\{([^}]*)\}/);
  assert.ok(m, 'rule .kv dt:has(+ dd > input) missing');
  assert.equal(decl(m[1], 'align-self'), 'center');
});

test('no app page styles a text field below 16px (iOS focus zoom)', () => {
  for (const f of ['index.html', 'track.html', 'learn.html']) {
    assert.ok(Number(shape(f).size) >= 16, `${f}: ${shape(f).size}px`);
  }
});
