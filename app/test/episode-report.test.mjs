// One-page episode report (Lab follow-up c): the Owner / Consultant / Vet lenses plus the 7-day episode
// table on one printable page, so an owner can hand it to a vet or consultant (browser "Save as PDF").
// Synthetic fixtures only. Owner marks and measured minutes only: no stacking rule, no score, no feelings.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { episodesFrom, ownerRows, consultRows, vetRows } from '../episodes.js';
import { reportHtml } from '../episode-report.js';
import { deriveMovement } from '../episode-movement.js';

let n = 0;
const ev = (ts, metric, kind, episode, value = null, extra = {}) => ({
  schema_version: '0.1', event_id: `r:${n++}`, dog_id: 'test-dog', timestamp: ts, episode_id: episode, event_type: kind,
  provenance: { origin: 'owner', source_id: 'openpaw-field', algorithm_version: null, confidence: null, evidence_event_ids: [] },
  payload: { metric, value, unit: null, note: null, ...extra },
});

const walk = [
  ev('2026-11-10T09:00:00.000Z', 'trigger.seen', 'trigger', 'ep:old', '40+', { trigger_class: 'bike' }),
  ev('2026-11-10T09:01:00.000Z', 'behavior.calm', 'observation', 'ep:old', 60),
  ev('2026-11-20T14:02:00.000Z', 'trigger.seen', 'trigger', 'ep:a', '10-20', { trigger_class: 'person' }),
  ev('2026-11-20T14:02:02.000Z', 'body_language.tags', 'observation', 'ep:a', ['freeze', 'hard stare']),
  ev('2026-11-20T14:02:04.000Z', 'behavior.reacted', 'observation', 'ep:a', true),
  ev('2026-11-20T14:02:06.000Z', 'intervention.distance', 'intervention', 'ep:a', 'u-turn'),
  ev('2026-11-20T14:03:52.000Z', 'behavior.calm', 'observation', 'ep:a', 112),
  ev('2026-11-20T14:11:52.000Z', 'trigger.seen', 'trigger', 'ep:b', null, { trigger_class: null }),
  ev('2026-11-20T14:11:55.000Z', 'behavior.reacted', 'observation', 'ep:b', true),
  ev('2026-11-22T08:00:00.000Z', 'trigger.seen', 'trigger', 'ep:c', '20-40', { trigger_class: '<b>dog</b>' }),
  ev('2026-11-22T08:00:03.000Z', 'body_language.tags', 'observation', 'ep:c', ['hard stare']),
  ev('2026-11-22T08:00:40.000Z', 'behavior.calm', 'observation', 'ep:c', 40),
];
const eps = episodesFrom(walk);
const opts = { generatedAt: '2026-11-22T09:30:00.000Z', timeZone: 'UTC' };
const html = reportHtml(eps, opts);
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const text = (h) => h.replace(/<[^>]+>/g, ' ');

test('report shows all three lenses of the latest episode, row for row', () => {
  const [, , b, c] = eps;
  assert.match(html, /OpenPaw episode report/);
  for (const h of ['Owner view', 'Consultant view', 'Vet view']) assert.match(html, new RegExp(`<h2>${h}`));
  for (const [k, v] of [...ownerRows(c, b), ...consultRows(c, b), ...vetRows(eps)]) {
    assert.ok(html.includes(`<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`), `missing row ${k}: ${v}`);
  }
});

test('report lists every episode in the 7-day window with measured times, never guesses', () => {
  const rows = html.match(/<tr class="ep">.*?<\/tr>/g) || [];
  assert.equal(rows.length, 3); // ep:old is 12 days before the latest episode
  assert.match(text(rows[0]), /Nov 20.*14:02.*Person, 10–20 ft.*0:04.*1:52/);
  assert.match(text(rows[1]), /14:11.*Not recorded.*0:03.*Not observed/);
  assert.match(text(rows[2]), /Nov 22.*08:00.*20–40 ft.*Not marked.*0:40/);
});

test('report escapes owner-entered text', () => {
  assert.doesNotMatch(html, /<b>dog<\/b>/);
  assert.match(html, /&lt;b&gt;dog&lt;\/b&gt;/);
});

test('report states its source, scope and evidence count, and labels nothing as a feeling or a score', () => {
  const t = text(html);
  assert.match(t, /Generated Nov 22, 2026/);
  assert.match(t, /Owner-marked observations from OpenPaw Field/);
  assert.match(t, /not a diagnosis/);
  assert.match(t, /Based on 10 owner-marked events/); // a 5 + b 2 + c 3; ep:old is outside the window
  for (const bad of [/stack/i, /stress/i, /anxious|fear|happy|calm dog/i, /score/i]) assert.doesNotMatch(t, bad);
});

// Import adapter (f): the printed Consultant section carries the same "Collar movement" row as Field,
// and the footer stops calling the whole page owner-marked once a collar measurement is on it.
const epochs = [];
for (let s = -1800; s <= 120; s += 5) {
  const ts = new Date(Date.parse('2026-11-22T08:00:00.000Z') + s * 1000).toISOString();
  const mg = s >= 5 && s <= 20 ? 640 : 90 + (Math.abs(s) % 3) * 10;
  const e = ev(ts, 'movement.vedba_mean', 'measurement', null, mg);
  e.provenance = { ...e.provenance, origin: 'simulated', source_id: 'sim-collar' };
  epochs.push(e);
}
const movement = deriveMovement([...walk, ...epochs]);

test('report Consultant section has the Field "Collar movement" row when the collar logged the episode', () => {
  const [, , b, c] = eps;
  assert.equal(movement.filter((d) => d.episode_id === 'ep:c').length, 1);
  const withMv = reportHtml(eps, { ...opts, movement });
  const row = consultRows(c, b, movement).find(([k]) => k === 'Collar movement');
  assert.ok(row, 'fixture should give ep:c a movement row');
  assert.match(row[1], /^Simulated · band /);
  const consult = withMv.slice(withMv.indexOf('Consultant view'), withMv.indexOf('Vet view'));
  assert.ok(consult.includes(`<dt>Collar movement</dt><dd>${esc(row[1])}</dd>`), consult);
  assert.match(text(withMv), /Collar movement is measured by the collar \(VeDBA\), not marked by the owner/);
});

test('report without collar data has no movement row and no collar footer line', () => {
  assert.doesNotMatch(html, /Collar movement/);
  assert.doesNotMatch(text(html), /measured by the collar/);
});

test('field print button passes collar movement into the report', () => {
  const js = readFileSync(new URL('../field.js', import.meta.url), 'utf8');
  assert.match(js, /reportHtml\(.*\{\s*movement:\s*deriveMovement\(S\.liveEvents\(/);
});

test('no episodes -> a plain empty report, not a blank page', () => {
  assert.match(text(reportHtml([], opts)), /No episodes marked yet/);
});

test('field page has a print button and a print-only report block', () => {
  const page = readFileSync(new URL('../field.html', import.meta.url), 'utf8');
  const js = readFileSync(new URL('../field.js', import.meta.url), 'utf8');
  assert.match(page, /id="btnReport"/);
  assert.match(page, /id="epReport"/);
  assert.match(page, /@media print/);
  // the screen theme paints html dark; a printed/PDF page must not inherit it below the report
  const print = page.slice(page.indexOf('@media print'));
  assert.match(print, /html\s*,?\s*body\s*\{[^}]*background:\s*#fff/);
  assert.match(js, /reportHtml/);
  assert.match(js, /window\.print\(\)/);
});
