"""Dependency-free checks for OpenPaw's read-only synthetic timeline renderer."""
import importlib.util
from html.parser import HTMLParser
from pathlib import Path
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
PATH = ROOT / 'demo' / 'render_timeline.py'
spec = importlib.util.spec_from_file_location('timeline_renderer', PATH)
renderer = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = renderer
spec.loader.exec_module(renderer)


class HTMLScan(HTMLParser):
    def __init__(self):
        super().__init__()
        self.ids=[]
        self.hrefs=[]
        self.links=[]
        self.scripts=[]
        self.event_types=[]

    def handle_starttag(self, tag, attrs):
        args=dict(attrs)
        if 'id' in args: self.ids.append(args['id'])
        if 'href' in args: self.hrefs.append(args['href'])
        if tag=='script': self.scripts.append(args)
        if tag=='link': self.links.append(args)
        if 'data-kind' in args: self.event_types.append(args['data-kind'])


class TimelineTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.records=renderer.read_fixture()
        cls.source=renderer.FIXTURE.read_text(encoding='utf-8')
        cls.html=renderer.render(cls.records, cls.source)
        cls.scan=HTMLScan()
        cls.scan.feed(cls.html)

    def test_all_45_events_have_unique_direct_anchors(self):
        self.assertEqual(len(self.records),45)
        self.assertEqual(len(self.scan.ids),len(set(self.scan.ids)))
        for record in self.records:
            self.assertIn('ev-'+record['event_id'],self.scan.ids)
        self.assertEqual(len(self.scan.event_types),45)

    def test_week_and_episode_cards_point_to_existing_anchors(self):
        days={e['timestamp'][:10] for e in self.records}
        self.assertEqual(len(days),7)
        for day in days:
            self.assertIn('day-'+day,self.scan.ids)
        for h in self.scan.hrefs:
            if h.startswith('#'):
                self.assertIn(h[1:],self.scan.ids, h)

    def test_synthetic_only_guard_rejects_changed_provenance(self):
        path=renderer.FIXTURE
        with tempfile.TemporaryDirectory() as tmp:
            fake=Path(tmp)/'fixture.jsonl'
            fake.write_text(self.source.replace('"origin":"simulated"','"origin":"sensor"',1))
            try:
                renderer.FIXTURE=fake
                with self.assertRaisesRegex(ValueError,'Refusing to render'):
                    renderer.read_fixture()
            finally:
                renderer.FIXTURE=path

    def test_source_embedded_for_explicit_local_export(self):
        self.assertIn('id="source-data"',self.html)
        self.assertIn('id="export-raw"',self.html)
        self.assertIn('id="export-note"',self.html)
        self.assertIn('id="expert-note"',self.html)
        self.assertIn('downloadText(',self.html)

    def test_provenance_inspectable_for_every_event(self):
        self.assertEqual(self.html.count('simulated · openpaw-fictional-week-v0'),45)
        self.assertIn('Arousal state: not computed',self.html)
        for r in self.records:
            self.assertIn(r['event_id'],self.html)

    def test_no_network_dependencies_or_misleading_claims(self):
        self.assertFalse(self.scan.links)
        self.assertEqual(len(self.scan.scripts),1)
        self.assertIn("connect-src 'none'",self.html)
        self.assertIn('SYNTHETIC RECORDS ONLY',self.html)
        self.assertIn('Fictional examples—not actual expert feedback.',self.html)
        self.assertNotIn('universal threshold',self.html.lower())

    def test_episode_drilldown_has_details_and_visible_evidence_status(self):
        class CheckDetails(HTMLParser):
            def __init__(self):
                super().__init__()
                self.details = set()
                self.empty_days = 0
            def handle_starttag(self, tag, attrs):
                attrs = dict(attrs)
                if tag == 'details' and attrs.get('id'):
                    self.details.add(attrs['id'])
                if 'empty-day' in attrs.get('class', '').split():
                    self.empty_days += 1
                    assert 'hidden' in attrs
        check = CheckDetails()
        check.feed(self.html)
        self.assertEqual(len(check.details), 45)
        self.assertEqual(check.empty_days, 7)
        for href in self.scan.hrefs:
            if href.startswith('#ev-'):
                self.assertIn(href[1:], check.details)
        self.assertIn('evidence.open = true;', self.html)
        self.assertIn("evidence.querySelector('summary').focus", self.html)
        self.assertIn('source events remain available under All', self.html)

    def test_generated_html_works_without_external_assets(self):
        with tempfile.TemporaryDirectory() as tmp:
            out=Path(tmp)/'demo.html'
            out.write_text(self.html,encoding='utf-8')
            self.assertGreater(out.stat().st_size,20000)
            self.assertTrue(out.read_text(encoding='utf-8').startswith('<!doctype html>'))


def _collar_walk(origin='simulated'):
    """Synthetic collar export (same helper as test_collar_derive): band 52.5/70 mg, peak 900, back in band +40 s."""
    spec = importlib.util.spec_from_file_location('collar_derive_fixture', ROOT / 'tests' / 'test_collar_derive.py')
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    evs = mod.walk()
    for e in evs:
        e['provenance']['origin'] = origin
    return evs


class CollarTimelineTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.records = renderer.read_fixture()
        cls.source = renderer.FIXTURE.read_text(encoding='utf-8')
        cls.collar = _collar_walk()
        cls.html = renderer.render(cls.records, cls.source, collar=cls.collar)
        cls.scan = HTMLScan()
        cls.scan.feed(cls.html)

    def section(self):
        start = self.html.index('<section id="collar"')
        return self.html[start:self.html.index('</section>', start)]

    def test_without_an_export_there_is_no_collar_section(self):
        self.assertNotIn('id="collar"', renderer.render(self.records, self.source))

    def test_each_episode_shows_band_peak_and_back_in_band_from_collar_derive(self):
        s = self.section()
        self.assertEqual(s.count('class="collar-episode"'), 1)
        self.assertIn('52.5 mg', s)
        self.assertIn('70 mg', s)
        self.assertIn('900 mg', s)
        self.assertIn('+10 s', s)
        self.assertIn('40 s after the trigger', s)
        self.assertIn('openpaw-episode-movement/2', s)
        self.assertIn('simulated', s)

    def test_every_collar_figure_links_to_a_rendered_source_event(self):
        details = [i for i in self.scan.ids if i.startswith('ev-')]
        for eid in ('owner:trigger', 'dev:362:movement.vedba_mean', 'dev:368:movement.vedba_mean',
                    'dev:0:movement.vedba_mean', 'dev:359:movement.vedba_mean'):
            self.assertIn('#ev-' + eid, self.scan.hrefs)
            self.assertIn('ev-' + eid, details)
        for h in self.scan.hrefs:
            if h.startswith('#'):
                self.assertIn(h[1:], self.scan.ids, h)
        self.assertEqual(len(self.scan.ids), len(set(self.scan.ids)))

    def test_collar_section_never_names_a_feeling_or_recovery(self):
        s = self.section().lower()
        for word in ('stress', 'calm', 'anxious', 'fear', 'recovered', 'recovery', 'arousal'):
            self.assertNotIn(word, s)

    def test_an_episode_cut_short_by_the_next_one_is_marked_incomplete_and_links_that_trigger(self):
        from datetime import timedelta
        spec = importlib.util.spec_from_file_location('collar_derive_fixture2', ROOT / 'tests' / 'test_collar_derive.py')
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        evs = mod.walk(tail_mg=200, after_tail=120)
        evs.append(mod.mark('trigger.seen', mod.T0 + timedelta(seconds=300), ep='ep-2', eid='owner:trigger-2'))
        for e in evs:
            e['provenance']['origin'] = 'simulated'
        s = renderer.collar_section(evs)[1]
        first = s[s.index('Episode ep-1'):]
        first = first[:first.index('</article>')]
        self.assertIn('Incomplete', first)
        self.assertIn('href="#ev-owner:trigger-2"', first)
        self.assertIn('next episode began 300 s after the trigger', first)
        self.assertIn('id="ev-owner:trigger-2"', s)
        last = s[s.index('Episode ep-2'):]
        self.assertIn('data ended', last[:last.index('</article>')])

    def test_a_null_unit_is_not_printed_as_none(self):
        # app/store.js ownerEvent writes "unit": null on Field marks (seen in rounds/build-derive-c)
        evs = _collar_walk()
        for e in evs:
            if e['event_type'] == 'trigger':
                e['payload']['unit'] = None
        s = renderer.collar_section(evs)[1]
        self.assertIn('10-20', s)
        self.assertNotIn('None', s)

    def test_a_non_simulated_export_is_refused_on_this_synthetic_page(self):
        with self.assertRaisesRegex(ValueError, 'Refusing to render'):
            renderer.render(self.records, self.source, collar=_collar_walk(origin='sensor'))

    def test_cli_flag_reads_an_export_file(self):
        import json
        import subprocess
        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp) / 'export.jsonl'
            p.write_text('\n'.join(json.dumps(e) for e in self.collar) + '\n', encoding='utf-8')
            out = Path(tmp) / 'timeline.html'
            r = subprocess.run([sys.executable, '-I', str(PATH), '--output', str(out), '--collar', str(p)],
                               capture_output=True, text=True)
            self.assertEqual(r.returncode, 0, r.stderr)
            self.assertIn('1 collar episode', r.stdout)
            self.assertIn('id="collar"', out.read_text(encoding='utf-8'))


def _own_export():
    """A collar export as the app writes it for a real walk: sensor epochs + owner Field marks (synthetic values)."""
    evs = _collar_walk(origin='sensor')
    for e in evs:
        if e['event_type'] == 'trigger' or e['event_id'].startswith('owner:'):
            e['provenance']['origin'] = 'owner'
    return evs


class OwnExportTimelineTests(unittest.TestCase):
    """(h) an owner renders their own export: consent banner, no fictional week, file kept out of the repo."""

    @classmethod
    def setUpClass(cls):
        cls.events = _own_export()
        cls.html = renderer.render_own(cls.events)
        cls.scan = HTMLScan()
        cls.scan.feed(cls.html)

    def test_banner_says_it_is_your_own_data_kept_on_this_computer(self):
        self.assertIn('YOUR OWN COLLAR EXPORT', self.html)
        self.assertIn('stays on this computer', self.html)
        self.assertIn('not a diagnosis', self.html)

    def test_shows_the_collar_episode_from_real_origins_without_the_fictional_week(self):
        self.assertEqual(self.html.count('class="collar-episode"'), 1)
        self.assertIn('900 mg', self.html)
        self.assertIn('40 s after the trigger', self.html)
        self.assertIn('owner, sensor', self.html)
        for synthetic in ('fictional-dog-001', 'id="week"', 'id="source-data"', 'SYNTHETIC RECORDS ONLY'):
            self.assertNotIn(synthetic, self.html)

    def test_every_link_resolves_and_nothing_loads_from_the_network(self):
        for h in self.scan.hrefs:
            if h.startswith('#'):
                self.assertIn(h[1:], self.scan.ids, h)
        self.assertEqual(len(self.scan.ids), len(set(self.scan.ids)))
        self.assertIn("connect-src 'none'", self.html)
        self.assertIn('<meta name="robots" content="noindex">', self.html)
        self.assertEqual(self.scan.links, [])
        self.assertTrue(all('src' not in s for s in self.scan.scripts))

    def test_page_never_names_a_feeling_or_recovery(self):
        low = self.html.lower()
        for word in ('stress', 'calm', 'anxious', 'fear', 'recovered', 'recovery', 'arousal'):
            self.assertNotIn(word, low)

    def _cli(self, out, extra=()):
        import json
        import subprocess
        tmp = Path(self._tmp.name)
        p = tmp / 'export.jsonl'
        p.write_text('\n'.join(json.dumps(e) for e in self.events) + '\n', encoding='utf-8')
        args = [sys.executable, '-I', str(PATH), '--own-export', str(p), *extra]
        if out is not None:
            args += ['--output', str(out)]
        return subprocess.run(args, capture_output=True, text=True)

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()

    def tearDown(self):
        self._tmp.cleanup()

    def test_cli_writes_the_page_outside_the_repo(self):
        out = Path(self._tmp.name) / 'my-collar.html'
        r = self._cli(out)
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn('1 collar episode', r.stdout)
        self.assertIn('nothing uploaded', r.stdout)
        self.assertIn('YOUR OWN COLLAR EXPORT', out.read_text(encoding='utf-8'))

    def test_cli_refuses_an_output_inside_the_public_repo(self):
        out = ROOT / 'demo' / 'own-export-test.html'
        r = self._cli(out)
        self.assertNotEqual(r.returncode, 0)
        self.assertIn('outside the repository', r.stderr)
        self.assertFalse(out.exists())

    def test_cli_needs_an_explicit_output_path(self):
        r = self._cli(None)
        self.assertNotEqual(r.returncode, 0)
        self.assertIn('--output', r.stderr)


if __name__=='__main__':
    unittest.main()
