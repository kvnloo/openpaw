// OpenPaw episodes: owner-marked Field events (trigger / body tags / reaction / U-turn / treat / Calm again)
// grouped by episode_id into the Episode shape the landing page's "three lenses" section shows.
// Measurements and owner marks only. Two rules come from docs/evidence/topics/leash-reactivity.md:
// there is no validated scoring rule for "trigger stacking", so we report the minutes since the previous
// episode and never a stacked yes/no; and recovery without a Calm again mark is "not observed", never guessed.
// SPDX-License-Identifier: GPL-3.0-only

import { liveEvents } from './store.js';
import { movementText } from './episode-movement.js';

const FIELD = new Set(['trigger.seen', 'behavior.reacted', 'behavior.calm', 'intervention.reward', 'intervention.distance', 'body_language.tags', 'session.check']);
const BAND_LABEL = { '<10': '<10 ft', '10-20': '10–20 ft', '20-40': '20–40 ft', '40+': '40+ ft' };
const ms = (ts) => Date.parse(ts);
const secs = (a, b) => Math.round((ms(b) - ms(a)) / 1000);

export function fmtDur(s) {
  const m = Math.floor(s / 60), r = Math.round(s % 60);
  return `${m}:${String(r).padStart(2, '0')}`;
}

export function episodesFrom(events) {
  const by = new Map();
  for (const e of liveEvents(events)) {
    if (!e.episode_id || !e.payload || !FIELD.has(e.payload.metric)) continue;
    if (!by.has(e.episode_id)) by.set(e.episode_id, []);
    by.get(e.episode_id).push(e);
  }
  const eps = [];
  for (const [id, evs] of by) {
    evs.sort((a, b) => ms(a.timestamp) - ms(b.timestamp));
    const start = evs[0].timestamp;
    const first = (m) => evs.find((e) => e.payload.metric === m);
    const trig = first('trigger.seen');
    const reacted = first('behavior.reacted');
    const calm = first('behavior.calm');
    // Body tags and session-check signs marked before Reaction are precursors, kept apart by source.
    // Body tags saved after Reaction but marked seen: 'before_reaction' are recalled precursors, labelled as such.
    const precursors = [], sessionSigns = [], recalledPrecursors = [];
    for (const e of evs) {
      const isTag = e.payload.metric === 'body_language.tags';
      const after = reacted && ms(e.timestamp) > ms(reacted.timestamp);
      const into = !isTag && e.payload.metric !== 'session.check' ? null
        : !after ? (isTag ? precursors : sessionSigns)
          : isTag && e.payload.seen === 'before_reaction' ? recalledPrecursors : null;
      if (!into) continue;
      for (const t of e.payload.value || []) if (!into.includes(t)) into.push(t);
    }
    for (let i = recalledPrecursors.length - 1; i >= 0; i--) if (precursors.includes(recalledPrecursors[i])) recalledPrecursors.splice(i, 1);
    const interventions = evs.filter((e) => e.payload.metric === 'intervention.distance' || e.payload.metric === 'intervention.reward')
      .map((e) => ({ type: e.payload.metric === 'intervention.distance' ? 'u-turn' : 'treat', afterS: secs(start, e.timestamp) }));
    eps.push({
      id, start, end: calm ? calm.timestamp : null,
      trigger: { cls: trig ? trig.payload.trigger_class || null : null, band: trig ? trig.payload.value || null : null },
      precursors,
      recalledPrecursors,
      sessionSigns,
      reactionAfterS: reacted ? secs(start, reacted.timestamp) : null,
      interventions,
      timeToCalmS: calm ? secs(start, calm.timestamp) : null,
      recovery: calm ? 'observed' : 'not observed',
      sincePreviousMin: null,
      evidence: evs.map((e) => e.event_id),
    });
  }
  eps.sort((a, b) => ms(a.start) - ms(b.start));
  for (let i = 1; i < eps.length; i++) {
    const p = eps[i - 1];
    eps[i].sincePreviousMin = Math.round((ms(eps[i].start) - ms(p.end || p.start)) / 60000);
  }
  return eps;
}

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

function precursorText(ep) {
  const parts = [];
  if (ep.precursors.length) parts.push(`${ep.precursors.join(', ')} (owner tags)`);
  if (ep.recalledPrecursors && ep.recalledPrecursors.length) parts.push(`${ep.recalledPrecursors.join(', ')} (owner tags, recalled after the reaction)`);
  if (ep.sessionSigns && ep.sessionSigns.length) parts.push(`${ep.sessionSigns.join(', ')} (session check)`);
  return parts.length ? parts.join('; ') : 'None marked';
}

// Rows for the Behavior consultant lens (same labels as site/site.js, "Stacked" replaced by measured minutes).
// movement: optional deriveMovement(events) list (app/episode-movement.js); adds a "Collar movement"
// row when this episode has collar epochs after its trigger, kept apart from the owner's Recovery row.
export function consultRows(ep, previous, movement = []) {
  const t = ep.trigger;
  const what = t.cls ? cap(t.cls) : 'Not recorded';
  const dist = t.band ? BAND_LABEL[t.band] || `${t.band} ft` : 'distance not recorded';
  const mv = movement.find((d) => d.episode_id === ep.id);
  return [
    ['Trigger', `${what}, ${dist}`],
    ['Precursors', precursorText(ep)],
    ['Intervention', ep.interventions.length ? cap(ep.interventions.map((x) => `${x.type} at ${x.afterS}\u00a0s`).join(', ')) : 'None marked'],
    ['Recovery', ep.timeToCalmS != null ? `${fmtDur(ep.timeToCalmS)} to Calm again (owner-marked)` : 'Not observed (no Calm again mark)'],
    ...(mv ? [['Collar movement', movementText(mv)]] : []),
    ['Since previous', previous && ep.sincePreviousMin != null ? `${ep.sincePreviousMin} min after the previous episode` : 'No earlier episode on record'],
  ];
}

// Caption under the lens rows: the rows are the owner's marks, except a "Collar movement" row,
// which the collar measured; say so only when that row is shown.
export function lensCaption(rows) {
  const collar = rows.some(([k]) => k === 'Collar movement');
  const whose = collar
    ? 'Your own marks, plus one row measured by the collar (Collar movement, VeDBA), not marked by you,'
    : 'Your own marks,';
  return `${whose} laid out the way an owner, a behavior consultant or a vet reads them; the vet view covers the 7 days up to this episode. Minutes since the previous episode are shown as-is: there is no validated rule for “trigger stacking”.`;
}

// Gap in words for the owner: minutes under 90, hours under 48 h, then days.
function gapWords(min) {
  if (min < 90) return `${min} min`;
  if (min < 2880) return `${Math.round(min / 60)} h`;
  return `${Math.round(min / 1440)} days`;
}

// Rows for the Owner lens (same labels as site/site.js, "Worth knowing" says the measured gap, never "stacked").
export function ownerRows(ep, previous) {
  const t = ep.trigger;
  const what = t.cls ? `A ${t.cls}${t.band ? `, ${BAND_LABEL[t.band] || `${t.band} ft`} away` : ''}` : 'Not recorded';
  return [
    ['What set it off', what],
    ['What you did', ep.interventions.length ? cap(ep.interventions.map((x) => `${x.type} after ${x.afterS}\u00a0s`).join(', ')) : 'Nothing marked'],
    ['Back to calm', ep.timeToCalmS != null ? `${fmtDur(ep.timeToCalmS)} (your Calm again mark)` : 'Not marked yet'],
    ['Worth knowing', previous && ep.sincePreviousMin != null ? `Came ${gapWords(ep.sincePreviousMin)} after the previous episode` : 'First episode on record'],
  ];
}

// Rows for the Veterinarian lens: the 7 days up to the latest episode, owner marks only
// (collar rest and heart-rate rows join once real collar data exists).
export function vetRows(eps) {
  if (!eps.length) return [];
  const lastStart = ms(eps[eps.length - 1].start);
  const win = eps.filter((e) => ms(e.start) > lastStart - 7 * 86400000);
  const gaps = win.slice(1).map((e) => e.sincePreviousMin).filter((g) => g != null);
  const calm = win.map((e) => e.timeToCalmS).filter((s) => s != null).sort((x, y) => x - y);
  const mid = calm.length / 2;
  const median = calm.length ? (calm.length % 2 ? calm[Math.floor(mid)] : (calm[mid - 1] + calm[mid]) / 2) : null;
  const tags = new Map();
  for (const e of win) for (const t of e.precursors) tags.set(t, (tags.get(t) || 0) + 1);
  const tagList = [...tags].sort((x, y) => y[1] - x[1]).map(([t, k]) => `${t} ×${k}`);
  return [
    ['Episodes, 7 days', `${win.length} (owner-marked)`],
    ['Shortest gap', gaps.length ? `${Math.min(...gaps)} min between two episodes` : 'Only one episode in the window'],
    ['Time to Calm again', median != null ? `median ${fmtDur(median)} · ${calm.length} of ${win.length} marked` : `Not marked (0 of ${win.length})`],
    ['Body tags', tagList.length ? tagList.join(', ') : 'None marked'],
    ['Raw export', 'JSONL from the collar page'],
  ];
}
