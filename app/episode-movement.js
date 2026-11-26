// Per-episode collar movement for the Consultant lens: a line-for-line port of
// tools/collar_derive.py (algorithm openpaw-episode-movement/2), so the app and the export
// tool give the same numbers (app/test/episode-movement.test.mjs runs both on one export).
// For each Field episode, from the collar's VeDBA epochs only: this dog's own band in the
// 30 min before the trigger (median + nearest-rank p90, clipped/gap epochs and an earlier
// episode's follow-up left out; unknown under 1 min), the peak, and "back in band" = the
// first 30 s run at or under the upper edge after the peak, or not observed (incomplete
// when the next episode cut it short). Movement only: not recovery, not a feeling, not a
// diagnosis; the band and the 30 s run are hypotheses for experts to check.
// SPDX-License-Identifier: GPL-3.0-only

export const ALGORITHM_VERSION = 'openpaw-episode-movement/2';
const BASELINE_S = 1800;
const MIN_BASELINE_EPOCHS = 12;
const SETTLE_S = 30;
const EPOCH_S = 5;
const VEDBA = 'movement.vedba_mean';

const tOf = (ts) => Date.parse(ts) / 1000;
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const p90 = (vals) => { const s = [...vals].sort((a, b) => a - b); return s[Math.max(0, Math.ceil(0.9 * s.length) - 1)]; };
const median = (vals) => {
  const s = [...vals].sort((a, b) => a - b), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const poor = (e) => { const q = (e.provenance && e.provenance.quality) || {}; return Boolean(q.clipped || q.gap); };

function backInBand(afterPeak, upper, t0, pt, lastT) {
  const res = { status: 'not observed', settle_s: SETTLE_S, after_trigger_s: null, after_peak_s: null,
    event_id: null, followed_up_s: Math.round(lastT - t0) };
  if (upper == null) return { ...res, status: 'unknown' };
  const need = SETTLE_S / EPOCH_S;
  let run = [], prev = null;
  for (const [t, e] of afterPeak) {
    if (prev != null && t - prev > 1.5 * EPOCH_S) run = [];
    prev = t;
    run = e.payload.value <= upper ? [...run, [t, e]] : [];
    if (run.length === need) {
      const [rt, re] = run[0];
      return { ...res, status: 'observed', after_trigger_s: Math.round(rt - t0), after_peak_s: Math.round(rt - pt), event_id: re.event_id };
    }
  }
  return res;
}

// OpenPaw derived_state events, one per episode with a trigger mark and epochs after it.
export function deriveMovement(events) {
  const epochs = events
    .filter((e) => e.event_type === 'measurement' && e.payload && e.payload.metric === VEDBA && isNum(e.payload.value))
    .map((e) => [tOf(e.timestamp), e])
    .sort((a, b) => a[0] - b[0]);
  const triggers = new Map();
  for (const e of events) {
    if (!e.episode_id || !e.payload || e.payload.metric !== 'trigger.seen') continue;
    const had = triggers.get(e.episode_id);
    if (!had || tOf(e.timestamp) < tOf(had.timestamp)) triggers.set(e.episode_id, e);
  }
  const order = [...triggers.values()].sort((a, b) => tOf(a.timestamp) - tOf(b.timestamp));
  const simulated = epochs.some(([, e]) => (e.provenance || {}).origin === 'simulated');
  const out = [], busy = [];
  order.forEach((trig, i) => {
    const t0 = tOf(trig.timestamp);
    const nxt = order[i + 1] || null;
    const tEnd = nxt ? tOf(nxt.timestamp) : Infinity;
    const base = [], excluded = { quality: 0, earlier_episode: 0 };
    for (const [t, e] of epochs) {
      if (!(t0 - BASELINE_S <= t && t < t0)) continue;
      if (busy.some(([s, u]) => s <= t && t < u)) excluded.earlier_episode++;
      else if (poor(e)) excluded.quality++;
      else base.push(e);
    }
    const after = epochs.filter(([t]) => t0 <= t && t < tEnd);
    if (!after.length) { busy.push([t0, tEnd]); return; }
    const vals = base.map((e) => e.payload.value);
    const known = base.length >= MIN_BASELINE_EPOCHS;
    const upper = known ? p90(vals) : null;
    let [pt, pe] = after[0];
    for (const [t, e] of after) if (e.payload.value > pe.payload.value) [pt, pe] = [t, e];
    const back = backInBand(after.filter(([t]) => t > pt), upper, t0, pt, after[after.length - 1][0]);
    busy.push([t0, back.status === 'observed' ? t0 + back.after_trigger_s : tEnd]);
    if (back.status === 'observed') back.ended_by = null;
    else if (nxt) back.ended_by = { reason: 'next episode', episode_id: nxt.episode_id, after_trigger_s: Math.round(tEnd - t0), event_id: nxt.event_id };
    else back.ended_by = { reason: 'end of data' };
    const evidence = [trig.event_id, pe.event_id, ...(back.event_id ? [back.event_id] : []),
      ...(back.ended_by && back.ended_by.reason === 'next episode' ? [nxt.event_id] : [])];
    out.push({
      schema_version: '0.1',
      event_id: `${ALGORITHM_VERSION}:${trig.episode_id}`,
      dog_id: trig.dog_id || pe.dog_id,
      timestamp: new Date(after[after.length - 1][0] * 1000).toISOString(),
      episode_id: trig.episode_id,
      event_type: 'derived_state',
      provenance: { origin: simulated ? 'simulated' : 'model', source_id: 'app/episode-movement.js',
        algorithm_version: ALGORITHM_VERSION, confidence: null, evidence_event_ids: [...new Set(evidence)] },
      payload: {
        metric: 'episode.movement',
        baseline: { status: known ? 'known' : 'unknown', window_s: BASELINE_S, epochs: base.length, excluded,
          median_mg: known ? median(vals) : null, upper_mg: upper,
          first_event_id: base.length ? base[0].event_id : null, last_event_id: base.length ? base[base.length - 1].event_id : null },
        peak: { value_mg: pe.payload.value, after_trigger_s: Math.round(pt - t0), event_id: pe.event_id },
        back_in_band: back,
        note: 'Collar movement (VeDBA) only; a hypothesis for experts to check, not recovery or a diagnosis.',
      },
    });
  });
  return out;
}

// One Consultant-lens line, the CLI's wording (tools/collar_derive.py line()) with non-breaking "N s".
export function movementText(d) {
  const p = d.payload, b = p.baseline, pk = p.peak, bb = p.back_in_band;
  const s = (n) => `${n}\u00a0s`;
  const band = b.status === 'known' ? `band ${b.median_mg} mg median, upper ${b.upper_mg} mg`
    : `band unknown (${b.epochs} epochs in the 30 min before)`;
  let tail;
  if (bb.status === 'observed') tail = `back in band ${s(bb.after_trigger_s)} after the trigger`;
  else if (bb.status === 'unknown') tail = 'back in band unknown without a band';
  else {
    tail = `back in band not observed in ${s(bb.followed_up_s)} of follow-up`;
    const end = bb.ended_by || {};
    if (end.reason === 'next episode') tail += ` (incomplete: the next episode began ${s(end.after_trigger_s)} after the trigger)`;
    else if (end.reason === 'end of data') tail += ' (data ended)';
  }
  const sim = d.provenance.origin === 'simulated' ? 'Simulated · ' : '';
  return `${sim}${band} · peak ${pk.value_mg} mg at +${s(pk.after_trigger_s)} · ${tail}`;
}
