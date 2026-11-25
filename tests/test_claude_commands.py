"""Drift checks for the Claude Code guided flow (.claude/commands).

The commands are prompts, so these tests guard the facts they may state:
every link, price and repo path must come from the repo itself, and the
data formats they describe must match what the firmware and app emit.
"""
from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parents[1]
COMMANDS = ROOT / '.claude' / 'commands'
GUIDE = ROOT / 'docs' / 'COLLAR.md'
SKILL = ROOT / '.claude' / 'skills' / 'build-collar' / 'SKILL.md'
FIRMWARE = ROOT / 'firmware' / 'openpaw-collar' / 'openpaw-collar.ino'
APP_JS = ROOT / 'app' / 'openpaw-ble.js'

URL = re.compile(r'https?://[^\s)>\]`"]+')
PRICE = re.compile(r'\$\d+(?:\.\d+)?')
REPO_PATH = re.compile(r'`((?:docs|tools|firmware|app|schema|fixtures|demo|research|\.claude)/[^`\s]+)`')


def read(name):
    return (COMMANDS / name).read_text(encoding='utf-8')


def frontmatter(text):
    m = re.match(r'^---\n(.*?)\n---\n', text, re.S)
    return dict(line.split(':', 1) for line in m.group(1).splitlines() if ':' in line) if m else {}


class CommandFileTests(unittest.TestCase):
    names = ('build-collar.md', 'verify-collar.md')

    def test_commands_exist_with_a_description(self):
        for name in self.names:
            with self.subTest(name=name):
                self.assertTrue((COMMANDS / name).is_file(), name)
                self.assertTrue(frontmatter(read(name)).get('description', '').strip())

    def test_links_and_prices_come_from_the_guide(self):
        sources = GUIDE.read_text(encoding='utf-8') + SKILL.read_text(encoding='utf-8')
        for name in self.names:
            text = read(name)
            for url in URL.findall(text):
                with self.subTest(name=name, url=url):
                    self.assertIn(url.rstrip('.,'), sources)
            for price in PRICE.findall(text):
                with self.subTest(name=name, price=price):
                    self.assertIn(price, sources)

    def test_repo_paths_exist_or_are_marked_optional(self):
        for name in self.names:
            for line in read(name).splitlines():
                for path in REPO_PATH.findall(line):
                    with self.subTest(name=name, path=path):
                        if not (ROOT / path.split('#')[0]).exists():
                            self.assertIn('if it exists', line, f'{path} is missing and not marked optional')

    def test_safety_boundary_is_stated(self):
        for name in self.names:
            text = read(name).lower()
            with self.subTest(name=name):
                self.assertIn('diagnos', text)
                self.assertIn('measurements', text)
                self.assertNotIn('stress score', text.replace('no "stress score"', ''))


class BuildCollarTests(unittest.TestCase):
    def test_walks_every_step_in_order(self):
        text = read('build-collar.md')
        headings = [h.lower() for h in re.findall(r'^## +\d+\. +(.+)$', text, re.M)]
        expected = ['kit', 'order', 'flash', 'verify', 'first walk', 'export']
        self.assertEqual(len(headings), len(expected), headings)
        for got, want in zip(headings, expected):
            self.assertIn(want, got)

    def test_points_at_the_guide_as_source_of_truth(self):
        self.assertIn('`docs/COLLAR.md`', read('build-collar.md'))

    def test_issue_report_asks_for_the_firmware_version_the_app_shows(self):
        app_html = (ROOT / 'app' / 'index.html').read_text(encoding='utf-8')
        self.assertIn("'firmware_revision_string'", app_html, 'app must read the DIS firmware revision')
        self.assertIn('dis.setFirmwareRev(OPENPAW_FW_VERSION)', FIRMWARE.read_text(encoding='utf-8'))
        text = read('build-collar.md')
        self.assertIn('firmware version the app shows', text)
        self.assertNotIn('release name of the `.uf2`', text)


class ReleaseLinkTests(unittest.TestCase):
    def test_guide_links_the_release_that_matches_the_firmware_version(self):
        version = re.search(r'#define OPENPAW_FW_VERSION "([^"]+)"', FIRMWARE.read_text(encoding='utf-8')).group(1)
        guide = GUIDE.read_text(encoding='utf-8')
        self.assertIn(f'https://github.com/kvnloo/openpaw/releases/tag/collar-v{version}', guide)
        self.assertIn(f'collar-v{version}', (ROOT / 'site' / 'index.html').read_text(encoding='utf-8'))

    def test_firmware_header_names_the_same_version(self):
        text = FIRMWARE.read_text(encoding='utf-8')
        version = re.search(r'#define OPENPAW_FW_VERSION "([^"]+)"', text).group(1)
        self.assertIn(f'firmware v{version}', text.splitlines()[0])

    def test_firmware_ships_time_anchors_in_a_release_newer_than_0_2(self):
        # Set-time 0x20 + flash-log time anchors (status proto 2) landed after 0.2.0.
        text = FIRMWARE.read_text(encoding='utf-8')
        version = re.search(r'#define OPENPAW_FW_VERSION \"([^\"]+)\"', text).group(1)
        self.assertGreaterEqual(tuple(int(p) for p in version.split('.')), (0, 3, 0))

    def test_guide_names_the_release_that_dates_earlier_restarts(self):
        guide = GUIDE.read_text(encoding='utf-8')
        self.assertNotIn('next firmware release fixes this', guide.lower())
        self.assertIn('Firmware 0.3', guide)

    def test_firmware_ships_the_power_modes_in_a_release_newer_than_0_3(self):
        # Still mode, link/advertising steps, IMU FIFOs and 400 kHz I2C (docs/POWER.md
        # "firmware 0.4 and later") landed after 0.3.0.
        text = FIRMWARE.read_text(encoding='utf-8')
        version = re.search(r'#define OPENPAW_FW_VERSION \"([^\"]+)\"', text).group(1)
        self.assertGreaterEqual(tuple(int(p) for p in version.split('.')), (0, 4, 0))

    def test_guide_names_the_release_that_saves_power_when_still(self):
        guide = GUIDE.read_text(encoding='utf-8')
        self.assertNotIn('the next firmware (0.4)', guide.lower())
        self.assertIn('Firmware 0.4 and later samples 10 times a second', guide)


class VerifyCollarTests(unittest.TestCase):
    def test_serial_csv_header_matches_firmware(self):
        header = re.search(r'Serial\.println\("(seq,[^"]+)"\)', FIRMWARE.read_text(encoding='utf-8')).group(1)
        self.assertIn(header, read('verify-collar.md'))

    def test_serial_boot_line_keys_match_firmware(self):
        fmt = re.search(r'Serial\.printf\("(openpaw [^"]+)\\n"', FIRMWARE.read_text(encoding='utf-8')).group(1)
        keys = re.findall(r'(\w+)=%', fmt)
        self.assertIn('storage', keys)
        boot_line = re.search(r'The first line is `(openpaw [^`]+)`', read('verify-collar.md')).group(1)
        for key in keys:
            with self.subTest(key=key):
                self.assertIn(f'{key}=', boot_line)

    def test_docs_do_not_call_t1000e_battery_unknown_once_firmware_reads_it(self):
        firmware = FIRMWARE.read_text(encoding='utf-8')
        if 'openpaw_vbat_mv(raw, 4, 12, 3000, 2000, 1000)' not in firmware:
            self.skipTest('T1000-E battery not read by firmware')
        for path in (GUIDE, COMMANDS / 'verify-collar.md'):
            text = path.read_text(encoding='utf-8').lower()
            with self.subTest(path=path.name):
                self.assertNotIn('normal on the t1000-e for now', text)
                self.assertNotIn("t1000-e battery reading isn't calibrated", text)

    def test_jsonl_metrics_match_the_app(self):
        metrics = set(re.findall(r"'((?:movement|posture|device|physiology)\.[a-z_]+)'", APP_JS.read_text(encoding='utf-8')))
        self.assertGreaterEqual(len(metrics), 8)
        text = read('verify-collar.md')
        for metric in sorted(metrics):
            with self.subTest(metric=metric):
                self.assertIn(metric, text)

    def test_thresholds_match_the_guide(self):
        text = read('verify-collar.md')
        for fact in ('120 mg', '1.5 g', '5 s'):
            with self.subTest(fact=fact):
                self.assertIn(fact, text)


if __name__ == '__main__':
    unittest.main()
