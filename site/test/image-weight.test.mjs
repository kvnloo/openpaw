// node --test site/test/
// Landing image weight guard. Each landing photo is sized for the largest box it is drawn in
// (CSS px x DPR 2 or more) and encoded once at quality ~82, so the first load stays light on a phone.
// Budgets: <= 150 KB per photo, <= 500 KB for all landing photos together.
// The width/height attributes must match the real pixel size, so the browser reserves the right box (no layout shift).
// SPDX-License-Identifier: GPL-3.0-only
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const html = readFileSync(join(root, 'site/index.html'), 'utf8');
const css = readFileSync(join(root, 'site/style.css'), 'utf8');
const used = [...new Set([...(html + css).matchAll(/img\/([\w-]+\.(?:jpe?g|png|webp|avif))/g)].map((m) => m[1]))];

// JPEG pixel size from the first SOFn marker.
function jpegSize(buf) {
  let i = 2;
  while (i < buf.length) {
    if (buf[i] !== 0xff) { i++; continue; }
    const m = buf[i + 1];
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return [buf.readUInt16BE(i + 7), buf.readUInt16BE(i + 5)];
    i += 2 + buf.readUInt16BE(i + 2);
  }
  throw new Error('no SOF marker');
}

test('landing uses at least the four known photos', () => {
  for (const f of ['hero-exploded.jpg', 'app-demo.jpg', 'dog-night.jpg', 'walk-field.jpg']) assert.ok(used.includes(f), f);
});

test('each landing photo is <= 150 KB', () => {
  const over = used.map((f) => [f, Math.round(statSync(join(root, 'site/img', f)).size / 1024)]).filter(([, kb]) => kb > 150);
  assert.deepEqual(over, []);
});

test('all landing photos together are <= 500 KB', () => {
  const kb = used.reduce((s, f) => s + statSync(join(root, 'site/img', f)).size, 0) / 1024;
  assert.ok(kb <= 500, `${Math.round(kb)} KB`);
});

test('<img> width/height attributes match the JPEG pixel size', () => {
  for (const m of html.matchAll(/<img\s[^>]*src="img\/([\w-]+\.jpe?g)"[^>]*>/g)) {
    const w = +m[0].match(/\swidth="(\d+)"/)[1], h = +m[0].match(/\sheight="(\d+)"/)[1];
    assert.deepEqual([w, h], jpegSize(readFileSync(join(root, 'site/img', m[1]))), m[1]);
  }
});
