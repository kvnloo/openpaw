// OpenPaw one-page episode report (Lab follow-up c): the latest episode in the Owner / Consultant / Vet
// lenses plus every episode of the 7 days up to it, as one printable page an owner can hand to a vet or
// behavior consultant (the browser's Print -> "Save as PDF"; nothing is uploaded, no PDF library).
// Same rules as app/episodes.js: owner marks and measured minutes only, recovery without a Calm again
// mark is "not observed", no stacking rule, no score, no feelings.
// SPDX-License-Identifier: GPL-3.0-only

import { fmtDur, ownerRows, consultRows, vetRows } from './episodes.js';
import { STOOD_UP_NOTE } from './stood-up.js';

const DAY = 86400000;
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const dl = (rows) => `<dl>${rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>`;

// en-US + 24 h so a printed page reads the same everywhere; timeZone is the viewer's unless given (tests pin UTC).
function fmt(ts, timeZone, withYear) {
  const o = { month: 'short', day: 'numeric', timeZone };
  const date = new Date(ts).toLocaleDateString('en-US', withYear ? { ...o, year: 'numeric' } : o);
  const time = new Date(ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone });
  return { date, time };
}

// movement: optional deriveMovement(events) list (app/episode-movement.js), the same input Field's
// Consultant lens gets, so the printed page carries the same "Collar movement" row.
// stoodUp: optional stoodUpFrom(events) list (app/stood-up.js), [] when the owner hid it in Field.
export function reportHtml(eps, { generatedAt = new Date().toISOString(), timeZone, movement = [], stoodUp = [] } = {}) {
  const made = fmt(generatedAt, timeZone, true).date;
  const head = '<header><div class="micro">OpenPaw episode report</div>';
  if (!eps.length) {
    return `${head}<h1>No episodes marked yet</h1></header><footer>Generated ${esc(made)}. Mark Trigger, Reaction and Calm again in Field mode, then print this page.</footer>`;
  }
  const last = eps[eps.length - 1];
  const prev = eps[eps.length - 2] || null;
  const win = eps.filter((e) => Date.parse(e.start) > Date.parse(last.start) - 7 * DAY);
  const at = fmt(last.start, timeZone, true);
  const rows = win.map((e) => {
    const t = fmt(e.start, timeZone, false);
    const trig = consultRows(e, null)[0][1];
    const react = e.reactionAfterS != null ? fmtDur(e.reactionAfterS) : 'Not marked';
    const calm = e.timeToCalmS != null ? fmtDur(e.timeToCalmS) : 'Not observed';
    return `<tr class="ep"><td>${esc(t.date)} · ${esc(t.time)}</td><td>${esc(trig)}</td><td>${esc(react)}</td><td>${esc(calm)}</td></tr>`;
  }).join('');
  const events = win.reduce((k, e) => k + e.evidence.length, 0);
  const consult = consultRows(last, prev, movement, stoodUp);
  const collar = consult.some(([k]) => k === 'Collar movement')
    ? ' Collar movement is measured by the collar (VeDBA), not marked by the owner; it is not recovery or a diagnosis.' : '';
  const pre = (consult.find(([k]) => k === 'Precursors') || [])[1] || '';
  const stood = /Still .*\(collar/.test(pre) ? ` ${STOOD_UP_NOTE.replace('not marked by you', 'not marked by the owner')}` : '';
  return `${head}<h1>Latest episode · ${esc(at.date)}, ${esc(at.time)}${last.end ? '' : ' · open'}</h1></header>
<section><h2>Owner view</h2>${dl(ownerRows(last, prev))}</section>
<section><h2>Consultant view</h2>${dl(consult)}</section>
<section><h2>Vet view · 7 days</h2>${dl(vetRows(eps))}</section>
<section><h2>Episodes, 7 days</h2><table><thead><tr><th>Started</th><th>Trigger</th><th>Reaction after</th><th>To Calm again</th></tr></thead><tbody>${rows}</tbody></table></section>
<footer>Owner-marked observations from OpenPaw Field, not a diagnosis. Based on ${events} owner-marked events (event ids are in the JSONL export on the collar page). Times are from the first mark of each episode. Generated ${esc(made)}.${collar}${esc(stood)}</footer>`;
}
