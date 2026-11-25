"""Per-episode movement derivations from an app JSONL export (tools/collar_derive.py, issue #3).

Synthetic fixtures only: epochs mirror app/openpaw-ble.js recordToEvents, owner marks mirror
app/field.js (trigger.seen / behavior.calm under one episode_id).
"""
from datetime import datetime, timedelta, timezone
import importlib.util
import json
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
T0 = datetime(2026, 1, 1, 8, 0, tzinfo=timezone.utc)


def load():
    spec = importlib.util.spec_from_file_location('collar_derive', ROOT / 'tools' / 'collar_derive.py')
    mod = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = mod
    spec.loader.exec_module(mod)
    return mod


def iso(t):
    return t.strftime('%Y-%m-%dT%H:%M:%S.000Z')


def epoch(seq, mg, t, origin='sensor'):
    return {
        'schema_version': '0.1', 'event_id': f'dev:{seq}:movement.vedba_mean', 'dog_id': 'synthetic-dog',
        'timestamp': iso(t), 'episode_id': None, 'event_type': 'measurement',
        'provenance': {'origin': origin, 'source_id': 'dev', 'algorithm_version': 'openpaw-collar-core/1',
                       'confidence': None, 'device_seq': seq, 'device_uptime_s': seq * 5,
                       'quality': {'clipped': False, 'gap': False, 'low_rate': False}},
        'payload': {'metric': 'movement.vedba_mean', 'value': mg, 'unit': 'mg', 'window_s': 5, 'method': None},
    }


def mark(metric, t, ep='ep-1', kind='trigger', value=None, eid=None):
    return {
        'schema_version': '0.1', 'event_id': eid or f'owner:{metric}:{iso(t)}', 'dog_id': 'synthetic-dog',
        'timestamp': iso(t), 'episode_id': ep, 'event_type': kind,
        'provenance': {'origin': 'owner', 'source_id': 'openpaw-field', 'algorithm_version': None,
                       'confidence': None, 'evidence_event_ids': []},
        'payload': {'metric': metric, 'value': value},
    }


BASE = [40, 55, 60, 45, 70, 50, 65, 80, 35, 50]   # 30 min of quiet movement, 35..80 mg
AFTER = [600, 750, 900, 700, 500, 300, 200, 150]  # 40 s after the trigger; peak 900 mg at +10 s


def walk(after_tail=60, tail_mg=50, baseline_epochs=360):
    """baseline_epochs before the trigger at T0, then AFTER, then after_tail epochs at tail_mg."""
    evs, seq = [], 0
    start = T0 - timedelta(seconds=5 * baseline_epochs)
    values = [BASE[i % len(BASE)] for i in range(baseline_epochs)] + AFTER + [tail_mg] * after_tail
    for i, mg in enumerate(values):
        evs.append(epoch(seq, mg, start + timedelta(seconds=5 * i)))
        seq += 1
    evs.append(mark('trigger.seen', T0, value='10-20', eid='owner:trigger'))
    return evs


class DeriveTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.m = load()

    def one(self, events):
        out = self.m.derive(events)
        self.assertEqual(len(out), 1)
        return out[0]

    def test_baseline_band_comes_from_the_30_minutes_before_the_trigger(self):
        d = self.one(walk())
        b = d['payload']['baseline']
        self.assertEqual(b['window_s'], 1800)
        self.assertEqual(b['epochs'], 360)
        self.assertEqual(b['median_mg'], 52.5)
        self.assertEqual(b['upper_mg'], 70)   # nearest-rank 90th percentile of the window

    def test_peak_is_the_largest_epoch_after_the_trigger_with_its_event_id(self):
        p = self.one(walk())['payload']['peak']
        self.assertEqual(p['value_mg'], 900)
        self.assertEqual(p['after_trigger_s'], 10)
        self.assertEqual(p['event_id'], 'dev:362:movement.vedba_mean')

    def test_back_in_band_is_the_start_of_30_s_at_or_under_the_upper_band(self):
        b = self.one(walk())['payload']['back_in_band']
        self.assertEqual(b['status'], 'observed')
        self.assertEqual(b['settle_s'], 30)
        self.assertEqual(b['after_trigger_s'], 40)
        self.assertEqual(b['after_peak_s'], 30)
        self.assertEqual(b['event_id'], 'dev:368:movement.vedba_mean')

    def test_back_in_band_is_not_observed_when_the_data_ends_first(self):
        b = self.one(walk(after_tail=5))['payload']['back_in_band']
        self.assertEqual(b['status'], 'not observed')
        self.assertIsNone(b['after_trigger_s'])
        self.assertEqual(b['followed_up_s'], 60)   # last epoch +60 s: censored there, not guessed

    def test_movement_that_stays_above_the_band_is_not_observed(self):
        b = self.one(walk(tail_mg=200))['payload']['back_in_band']
        self.assertEqual(b['status'], 'not observed')

    def test_a_hole_in_the_epochs_breaks_the_settle_run(self):
        evs = walk()
        # drop seq 370..371: 30 s of quiet then has a 10 s hole, so the run restarts after it
        evs = [e for e in evs if e['provenance'].get('device_seq') not in (370, 371)]
        b = self.one(evs)['payload']['back_in_band']
        self.assertEqual(b['after_trigger_s'], 60)

    def test_follow_up_ends_at_the_next_episode_trigger(self):
        evs = walk(tail_mg=200, after_tail=120)
        t1 = T0 + timedelta(seconds=300)
        evs.append(mark('trigger.seen', t1, ep='ep-2', eid='owner:trigger-2'))
        out = {d['episode_id']: d['payload'] for d in self.m.derive(evs)}
        self.assertEqual(out['ep-1']['back_in_band']['followed_up_s'], 295)  # last epoch before ep-2

    def test_under_a_minute_of_baseline_gives_unknown_not_a_band(self):
        d = self.one(walk(baseline_epochs=10))['payload']
        self.assertEqual(d['baseline']['status'], 'unknown')
        self.assertIsNone(d['baseline']['upper_mg'])
        self.assertEqual(d['back_in_band']['status'], 'unknown')

    def test_output_is_a_schema_valid_derived_state_with_evidence_and_version(self):
        from jsonschema import Draft202012Validator, FormatChecker
        schema = json.loads((ROOT / 'schema' / 'openpaw-event.schema.json').read_text(encoding='utf-8'))
        d = self.one(walk())
        self.assertEqual(list(Draft202012Validator(schema, format_checker=FormatChecker()).iter_errors(d)), [])
        self.assertEqual(d['event_type'], 'derived_state')
        self.assertEqual(d['episode_id'], 'ep-1')
        self.assertEqual(d['provenance']['algorithm_version'], 'openpaw-episode-movement/1')
        self.assertEqual(d['provenance']['origin'], 'model')
        self.assertEqual(d['provenance']['evidence_event_ids'],
                         ['owner:trigger', 'dev:362:movement.vedba_mean', 'dev:368:movement.vedba_mean'])
        self.assertEqual(d['payload']['baseline']['first_event_id'], 'dev:0:movement.vedba_mean')
        self.assertEqual(d['payload']['baseline']['last_event_id'], 'dev:359:movement.vedba_mean')

    def test_simulated_input_stays_labelled_simulated(self):
        evs = walk()
        for e in evs:
            if e['event_type'] == 'measurement':
                e['provenance']['origin'] = 'simulated'
        self.assertEqual(self.one(evs)['provenance']['origin'], 'simulated')

    def test_cli_prints_one_line_per_episode_and_never_names_a_feeling(self):
        import subprocess
        import tempfile
        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp) / 'export.jsonl'
            p.write_text('\n'.join(json.dumps(e) for e in walk()) + '\n', encoding='utf-8')
            r = subprocess.run([sys.executable, '-I', str(ROOT / 'tools' / 'collar_derive.py'), str(p)],
                               capture_output=True, text=True)
            j = subprocess.run([sys.executable, '-I', str(ROOT / 'tools' / 'collar_derive.py'), str(p), '--json'],
                               capture_output=True, text=True)
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn('ep-1', r.stdout)
        self.assertIn('peak 900 mg', r.stdout)
        self.assertIn('back in band 40 s after the trigger', r.stdout)
        for word in ('stress', 'calm', 'anxious', 'fear', 'recovered', 'recovery'):
            self.assertNotIn(word, r.stdout.lower())
        self.assertEqual(json.loads(j.stdout)[0]['event_type'], 'derived_state')


if __name__ == '__main__':
    unittest.main()
