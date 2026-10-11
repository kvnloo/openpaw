"""Run with: python -m unittest discover -s tests -v  (requires jsonschema)."""

import json
from pathlib import Path
import unittest

from jsonschema import Draft202012Validator, FormatChecker


SCHEMA_PATH = Path(__file__).resolve().parents[1] / "schema" / "openpaw-event.schema.json"


def event(event_type="derived_state"):
    return {
        "schema_version": "0.1",
        "event_id": "event-42",
        "dog_id": "fictional-dog",
        "timestamp": "2026-10-11T14:00:00Z",
        "event_type": event_type,
        "provenance": {
            "origin": "simulated",
            "source_id": "local-fixture",
        },
        "payload": {},
    }


class EvidenceContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        schema = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
        Draft202012Validator.check_schema(schema)
        cls.validator = Draft202012Validator(schema, format_checker=FormatChecker())

    def assert_valid(self, value):
        self.assertEqual(list(self.validator.iter_errors(value)), [])

    def assert_invalid(self, value):
        self.assertTrue(list(self.validator.iter_errors(value)))

    def test_derived_state_requires_provenance(self):
        self.assert_invalid(event())

    def test_derived_state_with_evidence_passes(self):
        value = event()
        value["provenance"].update({
            "algorithm_version": "baseline-v0",
            "evidence_event_ids": ["event-12", "event-13"],
        })
        self.assert_valid(value)

    def test_missing_or_null_algorithm_version_fails(self):
        value = event()
        value["provenance"].update({"evidence_event_ids": ["event-12"]})
        self.assert_invalid(value)
        value["provenance"]["algorithm_version"] = None
        self.assert_invalid(value)
        value["provenance"]["algorithm_version"] = ""
        self.assert_invalid(value)

    def test_empty_and_duplicate_evidence_fails(self):
        value = event()
        value["provenance"].update({"algorithm_version": "baseline-v0", "evidence_event_ids": []})
        self.assert_invalid(value)
        value["provenance"]["evidence_event_ids"] = ["event-12", "event-12"]
        self.assert_invalid(value)
        value["provenance"]["evidence_event_ids"] = [""]
        self.assert_invalid(value)

    def test_non_derived_events_remain_backward_compatible(self):
        for kind in ("measurement", "observation", "context", "trigger", "intervention", "expert_annotation"):
            with self.subTest(kind=kind):
                self.assert_valid(event(kind))


if __name__ == "__main__":
    unittest.main()
