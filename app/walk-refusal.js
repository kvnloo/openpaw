// OpenPaw Field "Won't walk on" mark: the dog stopped, turned back or pulled toward home, with an optional
// place note the owner types. Why: in lopesfagundes2018 (noise-sensitive referral dogs), signs spreading to
// more places showed up more often in the pain group's histories; a vet or consultant reading these marks can
// see for themselves whether they sit at one place or on every route (Learn card c-route). AVSAB 2021: don't
// push the dog through it. We only count marks per place as the owner wrote it: no inference, no score.
// SPDX-License-Identifier: GPL-3.0-only

import { liveEvents } from './store.js';

export const WALK_REFUSAL = {
  metric: 'behavior.walk_refusal',
  rule: 'openpaw-walk-refusal/1',
  placeMax: 60,
  title: 'Won\u2019t walk on',
  prompt: 'He stopped, turned back or pulled toward home. Where was it? (optional)',
  note: 'Saved as your observation, with the place as you wrote it. Your vet or consultant sees how many marks each place has.',
  evidence: ['lopesfagundes2018-noise-sensitivities-in-dogs-an-exploration-of-signs', 'avsab2021-position-statement-on-humane-dog-training'],
};

export function refusalPayload(place) {
  const p = typeof place === 'string' ? place.trim().replace(/\s+/g, ' ').slice(0, WALK_REFUSAL.placeMax) : '';
  return { metric: WALK_REFUSAL.metric, value: 'refused', extra: { rule: WALK_REFUSAL.rule, place: p || null } };
}

const key = (p) => (p == null ? null : String(p).trim().replace(/\s+/g, ' ').toLowerCase() || null);

// [[place as first written | null, count], ...], most marks first; "no place noted" last.
export function refusalPlaces(events) {
  const by = new Map();
  const marks = liveEvents(events).filter((e) => e.payload && e.payload.metric === WALK_REFUSAL.metric)
    .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp)); // store order is key order, not time
  for (const e of marks) {
    const k = key(e.payload.place);
    if (!by.has(k)) by.set(k, [k == null ? null : String(e.payload.place).trim().replace(/\s+/g, ' '), 0]);
    by.get(k)[1] += 1;
  }
  return [...by.values()].sort((a, b) => (a[0] == null) - (b[0] == null) || b[1] - a[1]);
}

export function refusalText(events) {
  const places = refusalPlaces(events);
  if (!places.length) return 'None marked';
  const n = places.reduce((s, [, k]) => s + k, 0);
  return `${n} marked: ${places.map(([p, k]) => `${p == null ? 'no place noted' : p} ×${k}`).join(', ')}`;
}
