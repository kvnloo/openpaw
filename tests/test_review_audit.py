"""Offline validation of exported synthetic-only review receipts and adversarial edits."""
import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("review_audit", ROOT / "demo" / "audit_review.py")
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)


class AuditTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.path = Path(self.tmp.name) / "local-review.json"
        self.receipt = {
            "schema_version": "openpaw-local-review-v0",
            "source": "openpaw-fictional-week-v0",
            "source_fixture_sha256": audit.PINNED_FIXTURE_SHA256,
            "review_type": "unverified_user_note",
            "reviewer_role_self_reported": "veterinarian",
            "credential_verified": False,
            "episode_id": "ep-dog-a",
            "evidence_event_ids": ["fictional-019", "fictional-022"],
            "created_at_utc": "2026-10-12T09:15:30.256Z",
            "timestamp_source": "local_device_clock_unverified",
            "text": "Which follow-up question would you ask after the second encounter?",
        }
        # Avoid assumptions about event numbering in the source file.
        self.events = list(audit.load_fixture(audit.DEFAULT_FIXTURE))
        self.receipt["evidence_event_ids"] = [self.events[17], self.events[21]]

    def check(self, code):
        self.path.write_text(json.dumps(self.receipt), encoding="utf-8")
        with self.assertRaises(audit.ReviewAuditError) as caught:
            audit.audit_receipt(self.path)
        self.assertEqual(str(caught.exception), code)

    def test_valid_local_receipt_links_without_authenticating_a_person(self):
        self.path.write_text(json.dumps(self.receipt), encoding="utf-8")
        report = audit.audit_receipt(self.path)
        self.assertEqual(report["result"], "LINKED_TO_PINNED_SYNTHETIC_FIXTURE")
        self.assertEqual(report["linked_event_count"], 2)
        self.assertIn("review_author_and_credentials_unverified", report["warnings"])
        self.assertNotIn(self.receipt["text"], json.dumps(report))

    def test_fixture_pin_matches_original_bytes(self):
        self.assertEqual(hashlib.sha256(audit.DEFAULT_FIXTURE.read_bytes()).hexdigest(), audit.PINNED_FIXTURE_SHA256)

    def test_unrecognized_reference_fails(self):
        self.receipt["evidence_event_ids"] = ["not-an-event"]
        self.check("unknown_evidence_event")

    def test_duplicate_reference_fails(self):
        self.receipt["evidence_event_ids"] = [self.events[17], self.events[17]]
        self.check("duplicate_evidence_event")

    def test_reversed_order_fails(self):
        self.receipt["evidence_event_ids"].reverse()
        self.check("evidence_not_in_source_order")

    def test_empty_links_fails(self):
        self.receipt["evidence_event_ids"] = []
        self.check("invalid_evidence_list")

    def test_receipt_hash_mismatch_fails(self):
        self.receipt["source_fixture_sha256"] = "0"*64
        self.check("invalid_source_fixture_sha256")

    def test_modified_fixture_fails_even_with_matching_claimed_digest(self):
        fixture = Path(self.tmp.name) / "data.jsonl"
        fixture.write_bytes(audit.DEFAULT_FIXTURE.read_bytes() + b"\n")
        self.receipt["source_fixture_sha256"] = hashlib.sha256(fixture.read_bytes()).hexdigest()
        self.path.write_text(json.dumps(self.receipt), encoding="utf-8")
        with self.assertRaises(audit.ReviewAuditError) as caught:
            audit.audit_receipt(self.path, fixture)
        self.assertEqual(str(caught.exception), "fixture_not_canonical")

    def test_self_asserted_verified_credential_rejected(self):
        self.receipt["credential_verified"] = True
        self.check("credential_claim_not_supported")

    def test_fabricated_time_rejected_syntactically_not_verified_against_real_clock(self):
        self.receipt["created_at_utc"] = "yesterday"
        self.check("invalid_local_clock_timestamp")

    def test_unknown_role_rejected(self):
        self.receipt["reviewer_role_self_reported"] = "verified_vet"
        self.check("invalid_self_reported_role")

    def test_blank_note_rejected(self):
        self.receipt["text"] = "    "
        self.check("empty_or_oversized_note")

    def test_extra_hidden_private_fields_rejected(self):
        self.receipt["owner_email"] = "must-not-report@example.invalid"
        self.check("unexpected_or_missing_fields")

    def test_duplicate_json_property_rejected(self):
        self.path.write_text(json.dumps(self.receipt)[:-1] + ',"review_type":"verified_professional_note"}', encoding="utf-8")
        with self.assertRaises(audit.ReviewAuditError) as caught:
            audit.audit_receipt(self.path)
        self.assertEqual(str(caught.exception), "ambiguous_duplicate_json_key")

    def test_oversized_file_rejected_without_reading_note(self):
        self.path.write_bytes(b"x" * 65000)
        with self.assertRaises(audit.ReviewAuditError) as caught:
            audit.audit_receipt(self.path)
        self.assertEqual(str(caught.exception), "missing_or_oversized_file")

    def test_cross_episode_compare_flagged_not_falsely_rejected(self):
        self.receipt["evidence_event_ids"] = [self.events[1], self.events[17]]
        self.path.write_text(json.dumps(self.receipt), encoding="utf-8")
        report = audit.audit_receipt(self.path)
        self.assertIn("selected_episode_not_among_linked_events", report["warnings"])

    def test_cli_failure_hides_free_text(self):
        self.receipt["evidence_event_ids"] = ["not-present"]
        self.receipt["text"] = "private test note hidden from CLI error"
        self.path.write_text(json.dumps(self.receipt), encoding="utf-8")
        import contextlib, io
        stream = io.StringIO()
        with contextlib.redirect_stdout(stream):
            code = audit.main([str(self.path)])
        self.assertEqual(code, 2)
        self.assertNotIn("private test note", stream.getvalue())


if __name__ == "__main__":
    unittest.main()
