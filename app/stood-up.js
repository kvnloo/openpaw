// "Left Still after the trigger": for each Field episode whose collar was in the Still band
// (app/collar-analytics.js LEVELS, < 250 mg VeDBA) for the 30 s before its first Trigger mark,
// say whether the band left Still within the 10 s after it. Trainers treat a dog getting up
// out of a down or sit as an early sign the step was too big (research/video-notes V7, V11, V12);
// that is their rule of thumb, not a measured finding, and we know of no study of it. So this is
// one line for the Consultant Precursors row, never a score, and absent whenever the data can't
// answer it (not still before, a clipped/gap epoch, too few epochs, nothing after the trigger).
// SPDX-License-Identifier: GPL-3.0-only

import { levelOf } from './collar-analytics.js';

export const STOOD_UP_VERSION = 'openpaw-stood-up/1';
const BEFORE_S = 30, AFTER_S = 10, EPOCH_S = 5, MIN_BEFORE = 5;
const VEDBA = 'movement.vedba_mean';
const tOf = (ts) => Date.parse(ts) / 1000;
const poor = (e) => { const q = (e.provenance && e.provenance.quality) || {}; return Boolean(q.clipped || q.gap); };

export function stoodUpFrom(events) {
  const epochs = events
    .filter((e) => e.event_type === 'measurement' && e.payload && e.payload.metric === VEDBA && Number.isFinite(e.payload.value))
    .map((e) => [tOf(e.timestamp), e])
    .sort((a, b) => a[0] - b[0]);
  const triggers = new Map();
  for (const e of events) {
    if (!e.episode_id || !e.payload || e.payload.metric !== 'trigger.seen') continue;
    const had = triggers.get(e.episode_id);
    if (!had || tOf(e.timestamp) < tOf(had.timestamp)) triggers.set(e.episode_id, e);
  }
  const out = [];
  for (const trig of triggers.values()) {
    const t0 = tOf(trig.timestamp);
    const before = epochs.filter(([t]) => t0 - BEFORE_S < t && t <= t0).map(([, e]) => e);
    const after = epochs.filter(([t]) => t0 < t && t <= t0 + AFTER_S);
    if (before.length < MIN_BEFORE || before.some(poor) || before.some((e) => levelOf(e.payload.value) !== 0)) continue;
    if (!after.length || after.some(([, e]) => poor(e))) continue;
    const moved = after.find(([, e]) => levelOf(e.payload.value) !== 0);
    if (!moved && after.length < AFTER_S / EPOCH_S) continue;
    const simulated = [...before, ...after.map(([, e]) => e)].some((e) => (e.provenance || {}).origin === 'simulated');
    out.push({
      episode_id: trig.episode_id,
      algorithm_version: STOOD_UP_VERSION,
      status: moved ? 'left' : 'stayed',
      after_s: moved ? Math.round(moved[0] - t0) : null,
      simulated,
      evidence_event_ids: [trig.event_id, ...(moved ? [moved[1].event_id] : after.map(([, e]) => e.event_id))],
    });
  }
  return out;
}

// One Precursors part, e.g. "left Still 5 s after the trigger (collar)".
export function stoodUpText(d) {
  const src = d.simulated ? '(collar, simulated)' : '(collar)';
  return d.status === 'left'
    ? `left Still ${d.after_s}\u00a0s after the trigger ${src}`
    : `stayed Still for the ${AFTER_S}\u00a0s after the trigger ${src}`;
}

export const STOOD_UP_NOTE = 'The \u201cStill\u201d part of Precursors is measured by the collar (movement band), not marked by you; reading it is a trainer\u2019s rule of thumb (getting up = the step may be too big), not a measured finding.';
