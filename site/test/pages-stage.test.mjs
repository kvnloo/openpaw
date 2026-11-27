// Pages staging (tools/stage-pages.sh) must publish one URL per font file: a visitor who opens the
// landing page and then the app should reuse the cached fonts, not download them again from a second
// path (/fonts/x vs /site/fonts/x was ~100 KB downloaded twice on every landing -> app visit).
// SPDX-License-Identifier: GPL-3.0-only
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const fontUrls = (text) => [...text.matchAll(/url\(\s*["']?([^)"']+\.woff2)["']?\s*\)/g)].map((m) => m[1]);
// resolve a relative URL against a page path inside the site, giving a site-absolute path
const at = (page, rel) => new URL(rel, 'https://x' + page).pathname;

function stage() {
  const out = join(mkdtempSync(join(tmpdir(), 'pages-stage-')), '_site');
  execFileSync('bash', [join(repo, 'tools/stage-pages.sh'), out], { cwd: repo, stdio: 'pipe' });
  return out;
}

test('pages workflow stages the site with tools/stage-pages.sh', () => {
  const wf = readFileSync(join(repo, '.github/workflows/pages.yml'), 'utf8');
  assert.match(wf, /bash tools\/stage-pages\.sh _site/);
});

test('staged app pages load each font from the same URL as the landing page', () => {
  const out = stage();
  const landing = new Map(fontUrls(readFileSync(join(out, 'style.css'), 'utf8')).map((u) => [u.split('/').pop(), at('/style.css', u)]));
  assert.ok(landing.size >= 4, 'landing stylesheet declares its fonts');
  const pages = readdirSync(join(out, 'app')).filter((f) => f.endsWith('.html'));
  let checked = 0;
  for (const p of pages) {
    for (const u of fontUrls(readFileSync(join(out, 'app', p), 'utf8'))) {
      const path = at('/app/' + p, u), file = u.split('/').pop();
      assert.ok(existsSync(join(out, path)), `${p}: ${u} -> ${path} is not in the staged site`);
      if (landing.has(file)) assert.equal(path, landing.get(file), `${p}: ${file} under a second URL`);
      checked++;
    }
  }
  assert.ok(checked >= 20, `checked ${checked} app font URLs`);
});

test('the repo checkout keeps working: app pages still reach site/fonts from app/', () => {
  for (const p of readdirSync(join(repo, 'app')).filter((f) => f.endsWith('.html'))) {
    const urls = fontUrls(readFileSync(join(repo, 'app', p), 'utf8'));
    for (const u of urls) {
      if (u.startsWith('../fonts/')) continue; // Pages-only fallback in a src list
      assert.ok(existsSync(join(repo, 'app', u)), `${p}: ${u} missing in the checkout`);
    }
  }
});
