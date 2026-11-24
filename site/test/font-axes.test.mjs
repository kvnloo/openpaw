// node --test site/test/
// Fraunces font weight guard. Every page draws Fraunces only at weights 400, 500 and 600
// (measured with the factory's font-usage walk over all 5 pages at 1440 + 390). The shipped
// variable font is limited to that weight range (fontTools varLib.instancer, optical-size axis
// kept whole), so each page downloads less, and every @font-face rule states the same range
// so the browser never asks the file for a weight it no longer has.
// SPDX-License-Identifier: GPL-3.0-only
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { brotliDecompressSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const FONT = join(root, 'site/fonts/fraunces-latin-opsz-normal.woff2');

// WOFF2 known-table tags, in index order (W3C WOFF2 spec, section 5.1).
const KNOWN = 'cmap head hhea hmtx maxp name OS/2 post cvt fpgm glyf loca prep CFF VORG EBDT EBLC gasp hdmx kern LTSH PCLT VDMX vhea vmtx BASE GDEF GPOS GSUB EBSC JSTF MATH CBDT CBLC COLR CPAL SVG sbix acnt avar bdat bloc bsln cvar fdsc feat fmtx fvar gvar hsty just lcar mort morx opbd prop trak Zapf Silf Glat Gloc Feat Sill'
  .split(' ');
function base128(buf, o) {
  let v = 0;
  for (let i = 0; i < 5; i++) { const b = buf[o.i++]; v = v * 128 + (b & 0x7f); if (!(b & 0x80)) return v; }
  throw new Error('bad UIntBase128');
}
// Return the decompressed bytes of one table from a (non-collection) WOFF2 file.
function woff2Table(buf, want) {
  assert.equal(buf.toString('latin1', 0, 4), 'wOF2');
  const n = buf.readUInt16BE(12);
  const o = { i: 48 };
  const dir = [];
  for (let k = 0; k < n; k++) {
    const flags = buf[o.i++];
    let tag = KNOWN[flags & 63];
    if ((flags & 63) === 63) { tag = buf.toString('latin1', o.i, o.i + 4).trim(); o.i += 4; }
    const orig = base128(buf, o);
    const ver = flags >> 6;
    const transformed = tag === 'glyf' || tag === 'loca' ? ver === 0 : ver !== 0;
    const len = transformed ? base128(buf, o) : orig;
    dir.push([tag, len]);
  }
  const data = brotliDecompressSync(buf.subarray(o.i, o.i + buf.readUInt32BE(20)));
  let off = 0;
  for (const [tag, len] of dir) { if (tag === want) return data.subarray(off, off + len); off += len; }
  throw new Error(`no ${want} table`);
}
function axes(buf) {
  const t = woff2Table(buf, 'fvar');
  const at = t.readUInt16BE(4), count = t.readUInt16BE(8), size = t.readUInt16BE(10);
  const out = {};
  for (let k = 0; k < count; k++) {
    const p = at + k * size;
    out[t.toString('latin1', p, p + 4)] = [t.readInt32BE(p + 4) / 65536, t.readInt32BE(p + 12) / 65536];
  }
  return out;
}

test('Fraunces file keeps the full optical-size axis and only weights 400-600', () => {
  const a = axes(readFileSync(FONT));
  assert.deepEqual(a.opsz, [9, 144]);
  assert.deepEqual(a.wght, [400, 600]);
});

test('Fraunces file stays under 60 KB', () => {
  const n = readFileSync(FONT).length;
  assert.ok(n <= 60000, `fraunces is ${n} bytes`);
});

test('every Fraunces @font-face states the weight range the file has', () => {
  const files = ['site/style.css', ...readdirSync(join(root, 'app')).filter((f) => f.endsWith('.html')).map((f) => `app/${f}`)];
  let seen = 0;
  for (const f of files) {
    const src = readFileSync(join(root, f), 'utf8');
    for (const m of src.matchAll(/@font-face\s*\{[^}]*Fraunces[^}]*\}/g)) {
      seen++;
      assert.match(m[0], /font-weight:\s*400 600\s*;/, `${f}: ${m[0]}`);
    }
  }
  assert.ok(seen >= 5, `found ${seen} Fraunces @font-face rules`);
});
