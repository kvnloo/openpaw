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

    def test_generated_html_works_without_external_assets(self):
        with tempfile.TemporaryDirectory() as tmp:
            out=Path(tmp)/'demo.html'
            out.write_text(self.html,encoding='utf-8')
            self.assertGreater(out.stat().st_size,20000)
            self.assertTrue(out.read_text(encoding='utf-8').startswith('<!doctype html>'))


if __name__=='__main__':
    unittest.main()
