"""Stdlib regression checks for auditably linked, unverified local review notes."""
import hashlib
from html.parser import HTMLParser
from pathlib import Path
import unittest

from test_timeline import renderer

ROOT = Path(__file__).resolve().parents[1]


class LinkedEvidenceParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.links = []
        self.sections = {}
        self.ids = set()

    def handle_starttag(self, tag, attrs):
        args = dict(attrs)
        self.ids.update([args['id']] if 'id' in args else [])
        if tag == 'button' and 'link-evidence' in args.get('class', '').split():
            self.links.append(args)
        if tag == 'section' and args.get('id') == 'review':
            self.sections['review'] = args


class ReviewLinkTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.records = renderer.read_fixture()
        cls.source = renderer.FIXTURE.read_text(encoding='utf-8')
        cls.html = renderer.render(cls.records, cls.source)
        cls.dom = LinkedEvidenceParser()
        cls.dom.feed(cls.html)

    def test_every_source_event_can_be_attached_uniquely(self):
        self.assertEqual(len(self.dom.links), 45)
        ids = [b['data-evidence-id'] for b in self.dom.links]
        self.assertEqual(ids, [e['event_id'] for e in self.records])
        self.assertEqual(len(ids), len(set(ids)))
        self.assertTrue(all(b.get('aria-pressed') == 'false' for b in self.dom.links))
        self.assertTrue(all('aria-label' in b and b.get('type') == 'button' for b in self.dom.links))

    def test_fixture_sha256_is_identical_to_embedded_source(self):
        digest = hashlib.sha256(renderer.FIXTURE.read_bytes()).hexdigest()
        self.assertEqual(self.dom.sections['review']['data-fixture-sha256'], digest)
        self.assertEqual(hashlib.sha256(self.source.encode('utf-8')).hexdigest(), digest)

    def test_unverified_roles_and_note_safety_are_visible(self):
        for needle in (
            'Review perspective (self-reported; not verified)',
            'Downloaded notes are not anonymized',
            'No source event linked. Export requires at least one.',
            'id="note-role"', 'id="clear-evidence"', 'maxlength="2000"',
            'credential_verified: false', 'review_type: \'unverified_user_note\'',
            'created_at_utc: new Date().toISOString()',
            "timestamp_source: 'local_device_clock_unverified'",
            'schema_version: \'openpaw-local-review-v0\'',
        ):
            with self.subTest(needle=needle):
                self.assertIn(needle, self.html)

    def test_note_links_real_source_ids_and_rejects_empty_evidence(self):
        self.assertIn("new Set(events.map(e => e.id.slice(3)))", self.html)
        self.assertIn("ids.every(id => knownIds.has(id))", self.html)
        self.assertIn("if (!ids.length", self.html)
        self.assertIn("Link at least one source event first.", self.html)
        self.assertIn("evidence_event_ids: ids", self.html)
        self.assertIn("source_fixture_sha256:", self.html)
        self.assertIn("linkedEvidence.clear(); refreshLinks();", self.html)

    def test_no_note_upload_storage_or_auto_submit(self):
        # Interactive Chromium smoke separately verifies export payload and zero requests.
        js = renderer.JS
        for forbidden in ('fetch(', 'sendBeacon(', 'localStorage', 'sessionStorage', 'XMLHttpRequest', 'indexedDB'):
            with self.subTest(forbidden=forbidden):
                self.assertNotIn(forbidden, js)
        self.assertIn("connect-src 'none'", self.html)
        self.assertIn('id="export-raw"', self.html)


if __name__ == '__main__':
    unittest.main()
