// The instrument pages share one card surface: collar .card, track .card and field details.panel
// use the same 12 px corner radius (the radius tiles, action pads and the status card already use),
// so a card reads as the same component on every page.
// SPDX-License-Identifier: GPL-3.0-only
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const radius = (html, sel) => {
  const esc = sel.replace(/\./g, '\\.');
  const body = (html.match(new RegExp(`^\\s*${esc}\\s*\\{([^}]*)\\}`, 'm')) || [])[1] || '';
  return (body.match(/(?:^|;)\s*border-radius\s*:\s*([^;]+)/) || [])[1]?.trim();
};

test('collar .card, track .card and field details.panel share a 12px radius', () => {
  assert.equal(radius(read('index.html'), '.card'), '12px', 'collar .card');
  assert.equal(radius(read('track.html'), '.card'), '12px', 'track .card');
  assert.equal(radius(read('field.html'), 'details.panel'), '12px', 'field details.panel');
});

test('gold corner brackets trace the same 12px corner on every instrument page', () => {
  for (const f of ['index.html', 'track.html', 'field.html']) {
    const html = read(f);
    assert.match(html, /\.br\.tl\s*\{[^}]*border-top-left-radius:\s*12px/, `${f} .br.tl`);
    assert.match(html, /\.br\.bR\s*\{[^}]*border-bottom-right-radius:\s*12px/, `${f} .br.bR`);
  }
});
