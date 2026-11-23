#!/usr/bin/env python3
"""Device-health report for an OpenPaw collar log.

Reads a USB serial CSV log or a JSONL export from the app and prints one
pass/warn/fail line per check, then a one-line verdict. Measurements about the
device only: nothing here describes the dog's feelings or health.

    python3 tools/check_export.py export.jsonl [--json]

Exit codes: 0 healthy or "check X", 1 not working, 2 not an OpenPaw file.
Standard library only, so it runs anywhere Python 3.8+ runs. The file never
leaves the computer.
"""
import argparse
import json
from pathlib import Path
from statistics import median
import sys

CSV_HEADER = 'seq,uptime_s,flags,vedba_mean_mg,vedba_max_mg,active_frac,pitch_deg,roll_deg,bursts,hr_bpm,battery_pct'
FLAG_CLIPPED, FLAG_GAP = 4, 8
ACTIVE_MG = 120          # firmware active threshold (openpaw_core.h)
MOVING_FRACTION = 0.25   # epoch counts as "moving" above this active fraction
MIN_PERIOD_EPOCHS = 12   # one minute of 5 s epochs
POSTURE_JUMP_DEG = 20
STEP_TOLERANCE_S = 1     # uptime is whole seconds, so a 5 s epoch can read 4 or 6
TROUBLESHOOT = 'docs/COLLAR.md#troubleshooting'


class NotOpenPaw(ValueError):
    pass


def _epoch(seq, up, clipped, gap, vm, vx, af, pitch, roll, bursts, batt):
    return {'seq': seq, 'uptime_s': up, 'clipped': clipped, 'gap': gap, 'vedba_mean': vm, 'vedba_max': vx,
            'active_frac': af, 'pitch': pitch, 'roll': roll, 'bursts': bursts, 'battery': batt}


def _restarted(prev, e):
    """seq went back (firmware 0.1, RAM only) or uptime went back while seq kept counting (flash log)."""
    if e['seq'] < prev['seq']:
        return True
    return e['uptime_s'] is not None and prev['uptime_s'] is not None and e['uptime_s'] < prev['uptime_s']


def parse_csv(text):
    boot, epochs, segment, skipped = None, [], 0, 0
    last_seq = None
    for line in text.splitlines():
        line = line.strip()
        if not line or line == CSV_HEADER:
            continue
        if line.startswith('openpaw '):
            if boot is not None or epochs:
                segment += 1
            boot = dict(kv.split('=', 1) for kv in line.split()[1:4] if '=' in kv)
            last_seq = None
            continue
        parts = line.split(',')
        try:
            v = [int(p) for p in parts]
        except ValueError:
            skipped += 1
            continue
        if len(v) != 11:
            skipped += 1
            continue
        seq, up, flags, vm, vx, af, pitch, roll, bursts, _hr, batt = v
        e = _epoch(seq, up, bool(flags & FLAG_CLIPPED), bool(flags & FLAG_GAP), vm, vx, round(af / 255, 3),
                   pitch, roll, bursts, None if batt == 255 else batt)
        if last_seq is not None and _restarted(last_seq, e):
            segment += 1
        last_seq = e
        e['segment'] = segment
        epochs.append(e)
    if boot is None and not epochs:
        raise NotOpenPaw('not an OpenPaw serial CSV or JSONL export')
    return {'boot': boot, 'epochs': epochs, 'skipped_lines': skipped, 'simulated': False, 'epoch_s': 5}


METRICS = {'movement.vedba_mean': 'vedba_mean', 'movement.vedba_max': 'vedba_max',
           'movement.active_fraction': 'active_frac', 'movement.bursts': 'bursts',
           'posture.pitch': 'pitch', 'posture.roll': 'roll', 'device.battery': 'battery'}


def parse_jsonl(text):
    by_key, skipped, simulated, epoch_s = {}, 0, False, 5
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            ev = json.loads(line)
        except json.JSONDecodeError:
            skipped += 1
            continue
        if not isinstance(ev, dict) or 'payload' not in ev:
            skipped += 1
            continue
        prov = ev.get('provenance') or {}
        pay = ev.get('payload') or {}
        if prov.get('origin') == 'simulated':
            simulated = True
        seq = prov.get('device_seq')
        field = METRICS.get(pay.get('metric'))
        if seq is None or field is None:
            continue  # chest-strap or other non-epoch events
        key = (prov.get('source_id'), seq)
        q = prov.get('quality') or {}
        e = by_key.setdefault(key, _epoch(seq, prov.get('device_uptime_s'), bool(q.get('clipped')),
                                          bool(q.get('gap')), None, None, None, None, None, None, None))
        e[field] = pay.get('value')
        if pay.get('window_s'):
            epoch_s = pay['window_s'] if field == 'vedba_mean' else epoch_s
    if not by_key and skipped:
        raise NotOpenPaw('not an OpenPaw serial CSV or JSONL export')
    # Firmware >= 0.2 keeps seq counting across reboots (flash log), so seq order is time order
    # and a restart shows up as uptime starting again.
    epochs = sorted(by_key.values(), key=lambda e: (e['seq'], e['uptime_s'] or 0))
    seg, last = 0, None
    for e in epochs:
        if last is not None and _restarted(last, e):
            seg += 1
        last = e
        e['segment'] = seg
    return {'boot': None, 'epochs': epochs, 'skipped_lines': skipped, 'simulated': simulated, 'epoch_s': epoch_s}


def _check(name, status, detail, **extra):
    return {'name': name, 'status': status, 'detail': detail, **extra}


def check_sensor(data):
    n = len(data['epochs'])
    if data['boot'] is not None:
        imu = data['boot'].get('imu')
        if imu == 'MISSING':
            return _check('sensor', 'fail', f'boot line says imu=MISSING: see {TROUBLESHOOT}')
        if imu != 'ok':
            return _check('sensor', 'warn', f'boot line has imu={imu!r}')
    if n == 0:
        return _check('sensor', 'fail', 'no epochs recorded')
    src = 'boot line imu=ok' if data['boot'] is not None else 'epochs present (JSONL has no boot line)'
    return _check('sensor', 'pass', f'{src}; {n} epochs')


def check_spacing(data):
    step = data['epoch_s']
    gaps, odd, reboots = [], 0, 0
    prev = None
    for e in data['epochs']:
        if prev is not None and e['segment'] != prev['segment']:
            reboots += 1
        elif prev is not None:
            dseq = e['seq'] - prev['seq']
            if dseq > 1:
                gaps.append({'after_seq': prev['seq'], 'missing': dseq - 1, 'uptime_s': prev['uptime_s']})
            elif dseq == 1 and e['uptime_s'] is not None and prev['uptime_s'] is not None:
                if abs((e['uptime_s'] - prev['uptime_s']) - step) > STEP_TOLERANCE_S:
                    odd += 1
        prev = e
    missing = sum(g['missing'] for g in gaps)
    bits = []
    if gaps:
        bits.append(f'{missing} missing epochs in {len(gaps)} gaps, first after seq {gaps[0]["after_seq"]} '
                    f'(uptime {gaps[0]["uptime_s"]} s); in an app export this usually means the backlog was not downloaded')
    if odd:
        bits.append(f'{odd} steps not {step} s apart')
    if reboots:
        bits.append(f'{reboots} restarts (seq or uptime went back)')
    status = 'warn' if bits else 'pass'
    detail = '; '.join(bits) if bits else f'every step {step} s, no missing seq'
    return _check('spacing', status, detail, missing_epochs=missing, gaps=gaps, odd_steps=odd, reboots=reboots)


def _is_moving(e):
    return (e['active_frac'] or 0) >= MOVING_FRACTION or (e['vedba_mean'] or 0) >= ACTIVE_MG


def check_quality(data):
    ep = data['epochs']
    n = len(ep) or 1
    clipped = sum(e['clipped'] for e in ep)
    gap = sum(e['gap'] for e in ep)
    clipped_still = sum(e['clipped'] and not _is_moving(e) for e in ep)
    bits = []
    if clipped_still:
        bits.append(f'{clipped_still} clipped epochs while still')
    if gap / n > 0.05:
        bits.append(f'{gap} gap-flagged epochs ({gap / n:.0%}): the sensor stalled')
    if clipped / n > 0.10:
        bits.append(f'{clipped / n:.0%} of epochs clipped')
    detail = '; '.join(bits) if bits else f'{clipped} clipped, {gap} gap-flagged of {len(ep)} epochs'
    return _check('quality', 'warn' if bits else 'pass', detail, clipped=clipped, gap=gap, clipped_still=clipped_still)


def _period(eps):
    vals = [e['vedba_mean'] for e in eps if e['vedba_mean'] is not None]
    afs = [e['active_frac'] for e in eps if e['active_frac'] is not None]
    if not vals:
        return {'epochs': 0}
    return {'epochs': len(eps), 'vedba_mean_median': median(vals), 'vedba_mean_range': [min(vals), max(vals)],
            'active_frac_median': median(afs) if afs else None}


def check_still_vs_moving(data):
    still = [e for e in data['epochs'] if not _is_moving(e)]
    moving = [e for e in data['epochs'] if _is_moving(e)]
    s, m = _period(still), _period(moving)
    if m['epochs'] < MIN_PERIOD_EPOCHS:
        status, detail = 'warn', ('no moving period found: carry it while walking for 10 minutes; '
                                  'if you did, the sensor may not be reading motion')
    elif s['epochs'] < MIN_PERIOD_EPOCHS:
        status, detail = 'warn', 'no still period found: leave it on a table for 10 minutes'
    else:
        status = 'pass'
        detail = (f'still {s["epochs"]} epochs, VeDBA median {s["vedba_mean_median"]} mg '
                  f'(range {s["vedba_mean_range"][0]}-{s["vedba_mean_range"][1]}); '
                  f'moving {m["epochs"]} epochs, median {m["vedba_mean_median"]} mg '
                  f'(range {m["vedba_mean_range"][0]}-{m["vedba_mean_range"][1]})')
    return _check('still_vs_moving', status, detail, still=s, moving=m)


def check_bursts(data):
    total = sum(e['bursts'] or 0 for e in data['epochs'])
    still = sum(e['bursts'] or 0 for e in data['epochs'] if not _is_moving(e))
    if still:
        return _check('bursts', 'warn', f'{still} bursts (>1.5 g) during still epochs', total_bursts=total,
                      still_bursts=still)
    return _check('bursts', 'pass', f'{total} bursts (>1.5 g), none while still', total_bursts=total, still_bursts=0)


def check_posture(data):
    still = [e for e in data['epochs'] if not _is_moving(e) and e['pitch'] is not None and e['roll'] is not None]
    if not still:
        return _check('posture', 'pass', 'no still epochs to compare', pitch_median=None, roll_median=None,
                      max_jump_deg=None)
    pm = median(e['pitch'] for e in still)
    rm = median(e['roll'] for e in still)
    jump = max(max(abs(e['pitch'] - pm), abs(e['roll'] - rm)) for e in still)
    status = 'warn' if jump > POSTURE_JUMP_DEG else 'pass'
    detail = f'still pitch median {pm} deg, roll median {rm} deg, largest jump {jump} deg'
    return _check('posture', status, detail, pitch_median=pm, roll_median=rm, max_jump_deg=jump)


def check_battery(data):
    known = [e for e in data['epochs'] if e['battery'] is not None]
    if not known:
        return _check('battery', 'pass', 'unknown (normal on USB power with no battery)', latest_pct=None)
    latest = max(known, key=lambda e: (e['segment'], e['seq']))['battery']
    status = 'warn' if latest < 15 else 'pass'
    return _check('battery', status, f'latest {latest}%', latest_pct=latest)


CHECKS = (check_sensor, check_spacing, check_quality, check_still_vs_moving, check_bursts, check_posture,
          check_battery)


def detect(text, suffix):
    suffix = suffix.lower()
    if suffix == '.jsonl':
        return 'jsonl'
    if suffix == '.csv':
        return 'csv'
    first = next((l.strip() for l in text.splitlines() if l.strip()), '')
    if first.startswith('{'):
        return 'jsonl'
    if first.startswith('openpaw ') or first == CSV_HEADER:
        return 'csv'
    raise NotOpenPaw('not an OpenPaw serial CSV or JSONL export')


def check_text(text, suffix=''):
    kind = detect(text, suffix)
    data = parse_jsonl(text) if kind == 'jsonl' else parse_csv(text)
    checks = [c(data) for c in CHECKS]
    fails = [c['name'] for c in checks if c['status'] == 'fail']
    warns = [c['name'] for c in checks if c['status'] == 'warn']
    if fails:
        verdict, step = 'not working', f'see {TROUBLESHOOT}'
    elif warns:
        verdict, step = f'check {warns[0]}', f'see {TROUBLESHOOT}'
    else:
        verdict, step = 'healthy', 'put it on the collar (docs/COLLAR.md, Fit and safety)'
    summary = f'{verdict}: {step}'
    if data['simulated']:
        summary += ' (simulated data: this does not describe a real collar)'
    return {'format': kind, 'epochs': len(data['epochs']), 'skipped_lines': data['skipped_lines'],
            'simulated': data['simulated'], 'checks': checks, 'verdict': verdict, 'summary': summary}


def main(argv=None):
    ap = argparse.ArgumentParser(description='OpenPaw collar device-health check (serial CSV or JSONL export).')
    ap.add_argument('file')
    ap.add_argument('--json', action='store_true', help='print the full report as JSON')
    args = ap.parse_args(argv)
    p = Path(args.file)
    try:
        report = check_text(p.read_text(encoding='utf-8', errors='replace'), p.suffix)
    except (NotOpenPaw, OSError) as exc:
        print(f'{p.name}: {exc}', file=sys.stderr)
        return 2
    if args.json:
        print(json.dumps(report, indent=2))
    else:
        print(f'{p.name}: {report["format"]}, {report["epochs"]} epochs'
              + (f', {report["skipped_lines"]} unreadable lines skipped' if report['skipped_lines'] else ''))
        for c in report['checks']:
            print(f'{c["status"].upper()} {c["name"]}: {c["detail"]}')
        print(report['summary'])
    return 1 if report['verdict'] == 'not working' else 0


if __name__ == '__main__':
    sys.exit(main())
