// The collar page's "Save as a page" builds the owner's own-export page in the browser, so
// nobody needs a terminal or Python: app/own-page.js must write the same page, byte for byte,
// as `demo/render_timeline.py --own-export` (only the "computed by" file name differs), on
// simulated and on non-simulated exports built with the app's own code.
// SPDX-License-Identifier: GPL-3.0-only
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { recordToEvents, makeClock, toJsonl } from '../openpaw-ble.js';
import { ownerEvent } from '../store.js';
import { ownPageHtml, ownPageName } from '../own-page.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const wall0 = Date.parse('2026-01-01T07:30:00Z');

function exportOf(mg, marks, { clippedAt = new Set(), origin = 'simulated' } = {}) {
  const clock = makeClock(wall0, 0);
  const opts = { dogId: 'synthetic-dog', deviceId: 'sim-collar', clock, origin };
  const events = [];
  mg.forEach((v, seq) => events.push(...recordToEvents({
    seq, uptime_s: seq * 5, vedba_mean_mg: v, vedba_max_mg: v + 40, active_frac: v > 120 ? 0.8 : 0.1,
    pitch_deg: 2, roll_deg: -4, bursts: v > 500 ? 1 : 0, hr_bpm: 0, battery_pct: 255,
    clipped: clippedAt.has(seq), gap: false, low_rate: false,
  }, opts)));
  let n = 0;
  for (const [s, metric, ep, value] of marks) {
    const e = ownerEvent({ dog: 'synthetic-dog', kind: metric === 'trigger.seen' ? 'trigger' : 'observation', metric, value,
      timestamp: new Date(wall0 + s * 1000).toISOString(), episodeId: ep, origin, sourceId: 'openpaw-field' });
    e.event_id = `mark-${n++}`;
    events.push(e);
  }
  return events;
}

function pythonPage(events) {
  const dir = mkdtempSync(join(tmpdir(), 'op-own-'));
  const f = join(dir, 'export.jsonl'), out = join(dir, 'page.html');
  writeFileSync(f, toJsonl(events));
  execFileSync('python3', [join(ROOT, 'demo', 'render_timeline.py'), '--own-export', f, '--output', out], { encoding: 'utf8' });
  return readFileSync(out, 'utf8');
}

const quiet = [40, 55, 60, 45, 70, 50, 65, 80, 35, 50];
const burst = [600, 750, 900, 700, 500, 300, 200, 150];
const CASES = {
  'simulated, back in band': exportOf(
    [...Array.from({ length: 360 }, (_, i) => quiet[i % 10]), ...burst, ...Array(60).fill(50)],
    [[1800, 'trigger.seen', 'ep:a', '10-20'], [1808, 'behavior.reacted', 'ep:a', true], [1890, 'behavior.calm', 'ep:a', 90]]),
  'own (sensor + owner marks), cut short by a second episode': exportOf(
    [...Array.from({ length: 360 }, (_, i) => quiet[i % 10]), ...burst, 400, 350, ...burst, ...Array(60).fill(50)],
    [[1800, 'trigger.seen', 'ep:a', '10-20'], [1850, 'trigger.seen', 'ep:b', '<10']], { origin: 'sensor' }),
  'own, band unknown, clipped, data ends': exportOf(
    [...Array(8).fill(50), ...burst, ...Array(4).fill(50)], [[40, 'trigger.seen', 'ep:a', '20-40']],
    { clippedAt: new Set([1, 2]), origin: 'sensor' }),
  'no episodes': exportOf(Array(30).fill(50), [], { origin: 'sensor' }),
};

const SRC = 'app/episode-movement.js openpaw-episode-movement/2';
for (const [name, events] of Object.entries(CASES)) {
  test(`same page as render_timeline.py --own-export: ${name}`, () => {
    const js = ownPageHtml(events);
    assert.ok(js.includes(SRC), 'the page names the in-browser code that computed it');
    assert.equal(js.replace(SRC, 'tools/collar_derive.py openpaw-episode-movement/2'), pythonPage(events));
  });
}

test('the page keeps the own-data banner and loads nothing from the internet', () => {
  const html = ownPageHtml(CASES['own (sensor + owner marks), cut short by a second episode']);
  assert.match(html, /YOUR OWN COLLAR EXPORT · THIS PAGE STAYS ON THIS COMPUTER · MEASUREMENTS ONLY, NOT A DIAGNOSIS/);
  assert.match(html, /default-src 'none'/);
  assert.match(html, /<span class="incomplete">Incomplete<\/span>/);
  assert.doesNotMatch(html, /src="http|href="http(?!s:\/\/github\.com\/kvnloo\/openpaw")/);
});

test('file name: dog id made file-safe, local date', () => {
  assert.equal(ownPageName('my dog/1', new Date('2026-03-04T12:00:00Z')), 'openpaw-my-dog-1-2026-03-04.html');
});

test('collar page has a "Save as a page" button wired to ownPageHtml', () => {
  const html = readFileSync(join(ROOT, 'app', 'index.html'), 'utf8');
  assert.match(html, /<button id="btnPage" class="btn"[^>]*>Save as a page<\/button>/);
  assert.match(html, /import\('\.\/own-page\.js'\)/);
  assert.match(html, /\$\('btnPage'\)\.disabled = n === 0/);
});
