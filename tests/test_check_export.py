"""tools/check_export.py: device-health report for a collar serial CSV or JSONL export.

All fixtures here are synthetic and built in code.
"""
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
PATH = ROOT / 'tools' / 'check_export.py'


def load():
    spec = importlib.util.spec_from_file_location('check_export', PATH)
    mod = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = mod
    spec.loader.exec_module(mod)
    return mod


CSV_HEADER = 'seq,uptime_s,flags,vedba_mean_mg,vedba_max_mg,active_frac,pitch_deg,roll_deg,bursts,hr_bpm,battery_pct'


def csv_text(rows, imu='ok', board=1):
    lines = [f'openpaw fw=0.1.0 board={board} imu={imu} storage=flash P25Q16H 2048KB (856015)', CSV_HEADER]
    lines += [','.join(str(v) for v in r) for r in rows]
    return '\n'.join(lines) + '\n'


def still(seq, flags=0, pitch=2, roll=-4, bursts=0, batt=255):
    return [seq, seq * 5, flags, 8 + seq % 5, 20, 0, pitch, roll, bursts, 0, batt]


def moving(seq, flags=0):
    return [seq, seq * 5, flags, 300 + seq % 40, 1100, 200, 15 + seq % 9, 6, 0, 0, 255]


def healthy_rows():
    # 10 min still (120 epochs) then 10 min carried (120 epochs)
    return [still(i) for i in range(120)] + [moving(i) for i in range(120, 240)]


def by_name(report):
    return {c['name']: c for c in report['checks']}


class CheckExportTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.m = load()

    def report(self, text, suffix='.csv'):
        return self.m.check_text(text, suffix)

    def test_healthy_csv_passes_every_check(self):
        r = self.report(csv_text(healthy_rows()))
        statuses = {c['name']: c['status'] for c in r['checks']}
        self.assertEqual(set(statuses.values()), {'pass'}, statuses)
        self.assertEqual(r['verdict'], 'healthy')
        self.assertEqual(r['epochs'], 240)

    def test_imu_missing_fails_sensor_check(self):
        r = self.report(csv_text(healthy_rows(), imu='MISSING'))
        self.assertEqual(by_name(r)['sensor']['status'], 'fail')
        self.assertEqual(r['verdict'], 'not working')

    def test_missing_sequence_numbers_are_reported_as_gaps_with_times(self):
        rows = [r for r in healthy_rows() if not 50 <= r[0] < 62]  # one minute lost
        c = by_name(self.report(csv_text(rows)))['spacing']
        self.assertEqual(c['status'], 'warn')
        self.assertEqual(c['missing_epochs'], 12)
        self.assertEqual(c['gaps'], [{'after_seq': 49, 'missing': 12, 'uptime_s': 245}])

    def test_uneven_uptime_step_is_reported(self):
        rows = healthy_rows()
        for r in rows[100:]:
            r[1] += 3  # clock jump of 3 s at epoch 100
        c = by_name(self.report(csv_text(rows)))['spacing']
        self.assertEqual(c['status'], 'warn')
        self.assertEqual(c['odd_steps'], 1)

    def test_clipping_while_still_is_a_warn(self):
        rows = healthy_rows()
        rows[10] = still(10, flags=4)
        c = by_name(self.report(csv_text(rows)))['quality']
        self.assertEqual(c['status'], 'warn')
        self.assertEqual(c['clipped_still'], 1)

    def test_a_few_clipped_moving_epochs_still_pass(self):
        rows = healthy_rows()
        rows[150] = moving(150, flags=4)
        c = by_name(self.report(csv_text(rows)))['quality']
        self.assertEqual(c['status'], 'pass')
        self.assertEqual(c['clipped'], 1)

    def test_still_and_moving_periods_report_median_and_range(self):
        c = by_name(self.report(csv_text(healthy_rows())))['still_vs_moving']
        self.assertEqual(c['still']['epochs'], 120)
        self.assertEqual(c['moving']['epochs'], 120)
        self.assertLess(c['still']['vedba_mean_median'], 30)
        self.assertGreater(c['moving']['vedba_mean_median'], 120)
        self.assertEqual(c['still']['vedba_mean_range'], [8, 12])

    def test_no_moving_period_warns_sensor_may_not_read_motion(self):
        r = self.report(csv_text([still(i) for i in range(240)]))
        c = by_name(r)['still_vs_moving']
        self.assertEqual(c['status'], 'warn')
        self.assertIn('may not be reading motion', c['detail'])
        self.assertEqual(r['verdict'], 'check still_vs_moving')

    def test_bursts_on_a_still_table_warn(self):
        rows = healthy_rows()
        rows[5] = still(5, bursts=2)
        self.assertEqual(by_name(self.report(csv_text(rows)))['bursts']['status'], 'warn')

    def test_posture_jump_while_still_warns(self):
        rows = healthy_rows()
        rows[30] = still(30, pitch=70)
        self.assertEqual(by_name(self.report(csv_text(rows)))['posture']['status'], 'warn')

    def test_battery_latest_value_or_unknown(self):
        c = by_name(self.report(csv_text(healthy_rows())))['battery']
        self.assertEqual(c['status'], 'pass')
        self.assertIsNone(c['latest_pct'])
        rows = healthy_rows()
        rows[-1] = moving(239)
        rows[-1][10] = 87
        self.assertEqual(by_name(self.report(csv_text(rows)))['battery']['latest_pct'], 87)


def jsonl_text(rows, origin='sensor'):
    """Mirror app/openpaw-ble.js recordToEvents for synthetic CSV rows."""
    out = []
    for seq, up, flags, vm, vx, af, pitch, roll, bursts, hr, batt in rows:
        def ev(metric, value, unit):
            return {
                'schema_version': '0.1', 'event_id': f'dev:{seq}:{metric}', 'dog_id': 'synthetic-dog',
                'timestamp': '2026-01-01T00:00:00.000Z', 'episode_id': None, 'event_type': 'measurement',
                'provenance': {'origin': origin, 'source_id': 'dev', 'algorithm_version': 'openpaw-collar-core/1',
                               'confidence': None, 'device_seq': seq, 'device_uptime_s': up,
                               'quality': {'clipped': bool(flags & 4), 'gap': bool(flags & 8)}},
                'payload': {'metric': metric, 'value': value, 'unit': unit, 'window_s': 5, 'method': None},
            }
        out += [ev('movement.vedba_mean', vm, 'mg'), ev('movement.vedba_max', vx, 'mg'),
                ev('movement.active_fraction', round(af / 255, 3), 'ratio'), ev('movement.bursts', bursts, 'count'),
                ev('posture.pitch', pitch, 'deg'), ev('posture.roll', roll, 'deg')]
        if batt != 255:
            out.append(ev('device.battery', batt, 'percent'))
    return '\n'.join(json.dumps(e) for e in out) + '\n'


class JsonlTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.m = load()

    def test_jsonl_export_gives_the_same_report_as_csv(self):
        rows = [r for r in healthy_rows() if not 50 <= r[0] < 62]
        a = self.m.check_text(csv_text(rows), '.csv')
        b = self.m.check_text(jsonl_text(rows), '.jsonl')
        for name in ('spacing', 'quality', 'still_vs_moving', 'bursts', 'posture', 'battery'):
            self.assertEqual(by_name(a)[name], by_name(b)[name], name)
        self.assertEqual(by_name(b)['sensor']['status'], 'pass')

    def test_simulated_origin_is_flagged(self):
        r = self.m.check_text(jsonl_text(healthy_rows(), origin='simulated'), '.jsonl')
        self.assertTrue(r['simulated'])
        self.assertIn('simulated', r['summary'])

    def test_heart_rate_strap_events_are_ignored_for_epochs(self):
        text = jsonl_text(healthy_rows())
        strap = {'schema_version': '0.1', 'event_id': 'strap:hr:1', 'dog_id': 'synthetic-dog',
                 'timestamp': '2026-01-01T00:00:00.000Z', 'episode_id': None, 'event_type': 'measurement',
                 'provenance': {'origin': 'sensor', 'source_id': 'strap'},
                 'payload': {'metric': 'physiology.heart_rate', 'value': 80, 'unit': 'bpm', 'window_s': 1}}
        r = self.m.check_text(text + json.dumps(strap) + '\n', '.jsonl')
        self.assertEqual(r['epochs'], 240)


class DriftTests(unittest.TestCase):
    """The checker must read exactly what the firmware prints and the app exports."""

    def test_csv_header_matches_firmware(self):
        ino = (ROOT / 'firmware' / 'openpaw-collar' / 'openpaw-collar.ino').read_text(encoding='utf-8')
        self.assertIn(f'Serial.println("{load().CSV_HEADER}")', ino)

    def test_every_app_epoch_metric_is_read(self):
        js = (ROOT / 'app' / 'openpaw-ble.js').read_text(encoding='utf-8')
        body = js.split('export function recordToEvents', 1)[1].split('export function', 1)[0]
        import re
        metrics = set(re.findall(r"base\('([a-z_.]+)'", body))
        read = set(load().METRICS) | {'physiology.heart_rate'}
        self.assertTrue(metrics, 'no metrics found in recordToEvents')
        self.assertEqual(metrics - read, set())


class CliTests(unittest.TestCase):
    def run_cli(self, text, suffix, *args):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / f'export{suffix}'
            p.write_text(text, encoding='utf-8')
            return subprocess.run([sys.executable, '-I', str(PATH), str(p), *args], capture_output=True, text=True)

    def test_cli_prints_one_line_per_check_and_a_verdict(self):
        res = self.run_cli(csv_text(healthy_rows()), '.csv')
        self.assertEqual(res.returncode, 0, res.stderr)
        lines = res.stdout.strip().splitlines()
        self.assertTrue(any(l.startswith('PASS spacing') for l in lines), res.stdout)
        self.assertTrue(lines[-1].startswith('healthy'), lines[-1])

    def test_cli_json_flag_and_fail_exit_code(self):
        res = self.run_cli(csv_text(healthy_rows(), imu='MISSING'), '.csv', '--json')
        self.assertEqual(res.returncode, 1)
        self.assertEqual(json.loads(res.stdout)['verdict'], 'not working')

    def test_cli_never_mentions_emotion_or_stress(self):
        res = self.run_cli(csv_text(healthy_rows()), '.csv')
        low = res.stdout.lower()
        for word in ('stress', 'anxious', 'happy', 'diagnos', 'calm'):
            self.assertNotIn(word, low)

    def test_unreadable_file_exits_2(self):
        res = self.run_cli('hello\nworld\n', '.txt')
        self.assertEqual(res.returncode, 2)
        self.assertIn('not an OpenPaw', res.stderr)


if __name__ == '__main__':
    unittest.main()
