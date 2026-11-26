// Learn's secondary surfaces use the app card surface: lesson figures (.fig), the practice
// stats panel (.stats) and the consent-check box (.consent) take 1px var(--line) + 12px corners like
// collar/track .card, field details.panel and Learn's own .lcard; the dog card (.dogcard) is a hero
// surface like field .status (radial gold glow, var(--line2) border) and takes its 12px corners.
// SPDX-License-Identifier: GPL-3.0-only
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const rule = (src, sel) => {
  const esc = sel.replace(/\./g, '\\.');
  return (src.match(new RegExp(`^\\s*${esc}\\s*\\{([^}]*)\\}`, 'm')) || [])[1] || '';
};
const prop = (body, name) => (body.match(new RegExp(`(?:^|;)\\s*${name}\\s*:\\s*([^;]+)`)) || [])[1]?.trim();
const learn = read('learn.html');

for (const sel of ['.fig', '.stats', '.consent']) {
  test(`learn ${sel} uses the app card border (1px var(--line)) and 12px radius`, () => {
    const body = rule(learn, sel);
    assert.ok(body, `${sel} rule found`);
    assert.equal(prop(body, 'border'), '1px solid var(--line)', `${sel} border`);
    assert.equal(prop(body, 'border-radius'), '12px', `${sel} radius`);
  });
}

test('learn .dogcard has the hero radius of field .status', () => {
  const status = rule(read('field.html'), '.status').replace(/\s*:\s*/g, ': ');
  assert.equal(prop(rule(learn, '.dogcard'), 'border-radius'), prop(status, 'border-radius'));
  assert.equal(prop(status, 'border-radius'), '12px');
});
