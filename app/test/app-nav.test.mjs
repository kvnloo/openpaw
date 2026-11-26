// Every app page carries the same cross-app nav (Home, Collar, Track, Field, Learn) so a reader
// can move between pages without going back to the landing page. Learn used to have only its
// own section tabs.
// SPDX-License-Identifier: GPL-3.0-only
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const PAGES = { 'index.html': 'Collar', 'track.html': 'Track', 'field.html': 'Field', 'learn.html': 'Learn' };
const ORDER = ['Home', 'Collar', 'Track', 'Field', 'Learn'];
const HREF = { Home: '../', Collar: './', Track: './track.html', Field: './field.html', Learn: './learn.html' };

const appNav = (html) => (html.match(/<nav class="micro[^"]*" aria-label="OpenPaw">([\s\S]*?)<\/nav>/) || [])[1];

test('each app page has the OpenPaw micro nav with all five entries in the same order', () => {
  for (const [file, current] of Object.entries(PAGES)) {
    const nav = appNav(read(file));
    assert.ok(nav, `${file}: no <nav class="micro" aria-label="OpenPaw">`);
    const items = [...nav.matchAll(/<(a|b)\b([^>]*)>([^<]+)<\/\1>/g)].map(([, tag, attrs, text]) => ({ tag, attrs, text: text.trim() }));
    assert.deepEqual(items.map((i) => i.text), ORDER, `${file}: entries`);
    for (const i of items) {
      if (i.text === current) assert.ok(i.tag === 'b' && /aria-current="page"/.test(i.attrs), `${file}: ${current} is the current page`);
      else assert.ok(i.tag === 'a' && i.attrs.includes(`href="${HREF[i.text]}"`), `${file}: ${i.text} links to ${HREF[i.text]}`);
    }
  }
});

test('learn styles the micro nav like the other app pages (11px mono, .09em, uppercase, muted links)', () => {
  const css = read('learn.html');
  assert.match(css, /\.micro\s*\{\s*font:\s*500 11px\/1\.2 var\(--mono\);\s*letter-spacing:\s*\.09em;\s*text-transform:\s*uppercase;\s*color:\s*var\(--mute\);/);
});
