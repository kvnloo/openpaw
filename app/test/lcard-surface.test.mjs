// Learn's lesson cards (.lcard) are the same card surface as collar .card, track .card and
// field details.panel: 1px var(--line) border and 12px corners (gold border on hover stays).
// SPDX-License-Identifier: GPL-3.0-only
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const learn = readFileSync(new URL('../learn.html', import.meta.url), 'utf8');
const rule = (sel) => {
  const esc = sel.replace(/\./g, '\\.');
  return (learn.match(new RegExp(`^\\s*${esc}\\s*\\{([^}]*)\\}`, 'm')) || [])[1] || '';
};
const prop = (body, name) => (body.match(new RegExp(`(?:^|;)\\s*${name}\\s*:\\s*([^;]+)`)) || [])[1]?.trim();

test('learn .lcard uses the app card border (1px var(--line)) and 12px radius', () => {
  const body = rule('.lcard');
  assert.ok(body, '.lcard rule found');
  assert.equal(prop(body, 'border'), '1px solid var(--line)', '.lcard border');
  assert.equal(prop(body, 'border-radius'), '12px', '.lcard radius');
});

test('learn .lcard keeps its gold hover border', () => {
  assert.equal(prop(rule('.lcard:hover'), 'border-color'), 'var(--gold)');
});
