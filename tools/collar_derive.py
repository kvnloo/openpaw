#!/usr/bin/env python3
"""Per-episode movement measurements from an OpenPaw app JSONL export (issue #3, first slice).

For each Field episode (owner marks sharing one episode_id, anchored at its "trigger seen"
mark) it reports, from the collar's VeDBA epochs only:
  - baseline band: median and nearest-rank 90th percentile of this dog's own 30 minutes
    before the trigger ("unknown" with under a minute of epochs). The window leaves out
    epochs the collar flagged clipped or gap, and an earlier episode's follow-up (its trigger
    until it was back in band, or until this trigger if it never was); both counts are kept;
  - peak: the largest epoch between the trigger and the end of follow-up;
  - back in band: start of the first 30 s run (six 5 s epochs, no hole) at or under the
    band's upper edge after the peak; "not observed" when follow-up ends first, with how far
    it was followed. Follow-up ends at the next episode's trigger or the end of the data;
    ended_by says which, and an episode cut short by the next one is marked incomplete
    (with that trigger's event id), so a missing settle is never read as a slow one.

This is movement only. It is not "recovery" (the app's Calm again mark is the owner's
observation of that), and nothing here names a feeling, a diagnosis or a stress level. There
is no universal threshold: every band comes from the same dog's preceding half hour. The
band, the 30 s run and the 30 min window are hypotheses for experts to check, not validated
endpoints (docs/PROTOCOL.md "Recovery"; docs/evidence/topics/leash-reactivity.md).

    python3 tools/collar_derive.py export.jsonl [--json]

Output: one line per episode, or with --json a list of OpenPaw v0.1 derived_state events
(schema/openpaw-event.schema.json) carrying algorithm_version and evidence_event_ids.
Standard library only. The file never leaves the computer.
"""
import argparse
from datetime import datetime, timezone
import json
import math
from pathlib import Path
from statistics import median
import sys

ALGORITHM_VERSION = 'openpaw-episode-movement/2'   # /2: band leaves out poor-quality and earlier-episode epochs
BASELINE_S = 1800
MIN_BASELINE_EPOCHS = 12   # one minute of 5 s epochs
SETTLE_S = 30              # six 5 s epochs in a row at or under the band
EPOCH_S = 5
VEDBA = 'movement.vedba_mean'


def _t(ts):
    return datetime.fromisoformat(ts.replace('Z', '+00:00')).timestamp()


def _iso(t):
    return datetime.fromtimestamp(t, timezone.utc).strftime('%Y-%m-%dT%H:%M:%S.%f')[:-3] + 'Z'


def _p90(values):
    s = sorted(values)
    return s[max(0, math.ceil(0.9 * len(s)) - 1)]


def _poor(e):
    """Epochs the collar flagged as clipped (sensor at full scale) or gap (missing samples)."""
    q = (e.get('provenance') or {}).get('quality') or {}
    return bool(q.get('clipped') or q.get('gap'))


def _num(x):
    return int(x) if float(x).is_integer() else x


def _back_in_band(after_peak, upper, t0, pt, last_t):
    """Start of the first SETTLE_S run of consecutive epochs at or under the upper band.

    Epochs more than 1.5 windows apart break the run. If the data ends first the result is
    'not observed' with how far it was followed: censored, never guessed."""
    res = {'status': 'not observed', 'settle_s': SETTLE_S, 'after_trigger_s': None, 'after_peak_s': None,
           'event_id': None, 'followed_up_s': round(last_t - t0)}
    if upper is None:
        return {**res, 'status': 'unknown'}
    need = SETTLE_S // EPOCH_S
    run, prev = [], None
    for t, e in after_peak:
        if prev is not None and t - prev > 1.5 * EPOCH_S:
            run = []
        prev = t
        run = run + [(t, e)] if e['payload']['value'] <= upper else []
        if len(run) == need:
            rt, re_ = run[0]
            return {**res, 'status': 'observed', 'after_trigger_s': round(rt - t0),
                    'after_peak_s': round(rt - pt), 'event_id': re_['event_id']}
    return res


def derive(events):
    """OpenPaw derived_state events, one per episode with a trigger mark and epochs after it."""
    epochs = sorted(((_t(e['timestamp']), e) for e in events
                     if e.get('event_type') == 'measurement' and (e.get('payload') or {}).get('metric') == VEDBA
                     and isinstance(e['payload'].get('value'), (int, float))),
                    key=lambda x: x[0])
    triggers = {}
    for e in events:
        if e.get('episode_id') and (e.get('payload') or {}).get('metric') == 'trigger.seen':
            if e['episode_id'] not in triggers or _t(e['timestamp']) < _t(triggers[e['episode_id']]['timestamp']):
                triggers[e['episode_id']] = e
    order = sorted(triggers.values(), key=lambda e: _t(e['timestamp']))
    simulated = any((e.get('provenance') or {}).get('origin') == 'simulated' for _, e in epochs)
    out, busy = [], []   # busy: [start, end) of earlier episodes' follow-up until back in band
    for i, trig in enumerate(order):
        t0 = _t(trig['timestamp'])
        t_end = _t(order[i + 1]['timestamp']) if i + 1 < len(order) else math.inf
        base, excluded = [], {'quality': 0, 'earlier_episode': 0}
        for t, e in epochs:
            if not t0 - BASELINE_S <= t < t0:
                continue
            if any(s <= t < u for s, u in busy):
                excluded['earlier_episode'] += 1
            elif _poor(e):
                excluded['quality'] += 1
            else:
                base.append(e)
        after = [(t, e) for t, e in epochs if t0 <= t < t_end]
        if not after:
            busy.append((t0, t_end))
            continue
        vals = [e['payload']['value'] for e in base]
        known = len(base) >= MIN_BASELINE_EPOCHS
        upper = _num(_p90(vals)) if known else None
        pt, pe = max(after, key=lambda x: x[1]['payload']['value'])
        back = _back_in_band([x for x in after if x[0] > pt], upper, t0, pt, after[-1][0])
        busy.append((t0, t0 + back['after_trigger_s'] if back['status'] == 'observed' else t_end))
        nxt = order[i + 1] if i + 1 < len(order) else None
        if back['status'] == 'observed':
            back['ended_by'] = None
        elif nxt is not None:   # incomplete: the next episode began before a 30 s run was seen
            back['ended_by'] = {'reason': 'next episode', 'episode_id': nxt['episode_id'],
                                'after_trigger_s': round(t_end - t0), 'event_id': nxt['event_id']}
        else:
            back['ended_by'] = {'reason': 'end of data'}
        evidence = ([trig['event_id'], pe['event_id']] + ([back['event_id']] if back['event_id'] else [])
                    + ([nxt['event_id']] if (back['ended_by'] or {}).get('reason') == 'next episode' else []))
        out.append({
            'schema_version': '0.1',
            'event_id': f'{ALGORITHM_VERSION}:{trig["episode_id"]}',
            'dog_id': trig.get('dog_id') or pe.get('dog_id'),
            'timestamp': _iso(after[-1][0]),
            'episode_id': trig['episode_id'],
            'event_type': 'derived_state',
            'provenance': {'origin': 'simulated' if simulated else 'model', 'source_id': 'tools/collar_derive.py',
                           'algorithm_version': ALGORITHM_VERSION, 'confidence': None,
                           'evidence_event_ids': list(dict.fromkeys(evidence))},
            'payload': {
                'metric': 'episode.movement',
                'baseline': {'status': 'known' if known else 'unknown', 'window_s': BASELINE_S, 'epochs': len(base),
                             'excluded': excluded,
                             'median_mg': _num(median(vals)) if known else None, 'upper_mg': upper,
                             'first_event_id': base[0]['event_id'] if base else None,
                             'last_event_id': base[-1]['event_id'] if base else None},
                'peak': {'value_mg': pe['payload']['value'], 'after_trigger_s': round(pt - t0), 'event_id': pe['event_id']},
                'back_in_band': back,
                'note': 'Collar movement (VeDBA) only; a hypothesis for experts to check, not recovery or a diagnosis.',
            },
        })
    return out


def line(d):
    p = d['payload']
    b, pk, bb = p['baseline'], p['peak'], p['back_in_band']
    band = (f'band {b["median_mg"]} mg median, upper {b["upper_mg"]} mg ({b["epochs"]} epochs before)'
            if b['status'] == 'known' else f'band unknown (only {b["epochs"]} epochs in the 30 min before)')
    if bb['status'] == 'observed':
        tail = f'back in band {bb["after_trigger_s"]} s after the trigger ({bb["after_peak_s"]} s after the peak)'
    elif bb['status'] == 'unknown':
        tail = 'back in band: unknown without a band'
    else:
        tail = f'back in band: not observed in {bb["followed_up_s"]} s of follow-up'
        end = bb.get('ended_by') or {}
        if end.get('reason') == 'next episode':
            tail += f' (incomplete, cut short: next episode {end["episode_id"]} began {end["after_trigger_s"]} s after the trigger)'
        elif end.get('reason') == 'end of data':
            tail += ' (data ended)'
    sim = ' [simulated]' if d['provenance']['origin'] == 'simulated' else ''
    return f'{d["episode_id"]}{sim}: {band}; peak {pk["value_mg"]} mg at +{pk["after_trigger_s"]} s; {tail}'


def main(argv=None):
    ap = argparse.ArgumentParser(description='Per-episode collar movement from an OpenPaw JSONL export.')
    ap.add_argument('path', type=Path)
    ap.add_argument('--json', action='store_true', help='print derived_state events as JSON')
    a = ap.parse_args(argv)
    events = []
    for s in a.path.read_text(encoding='utf-8').splitlines():
        s = s.strip()
        if not s:
            continue
        try:
            ev = json.loads(s)
        except json.JSONDecodeError:
            continue
        if isinstance(ev, dict):
            events.append(ev)
    out = derive(events)
    if a.json:
        print(json.dumps(out, indent=2))
    elif not out:
        print('No episode with a "trigger seen" mark and collar epochs after it.')
    else:
        for d in out:
            print(line(d))
    return 0


if __name__ == '__main__':
    sys.exit(main())
