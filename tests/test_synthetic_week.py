"""Regression checks for the fictional, seven-day fixture (python -m unittest discover -s tests)."""
import json
from collections import Counter
from datetime import datetime, timedelta, timezone
from pathlib import Path
import unittest

from jsonschema import Draft202012Validator, FormatChecker

ROOT = Path(__file__).resolve().parents[1]
FIXTURE = ROOT / "fixtures" / "fictional-week.jsonl"
SCHEMA = ROOT / "schema" / "openpaw-event.schema.json"


def load_events():
    return [json.loads(line) for line in FIXTURE.read_text().splitlines() if line.strip()]


def timestamp(event):
    return datetime.fromisoformat(event["timestamp"].replace("Z", "+00:00"))


def episode(events, key):
    return [e for e in events if e.get("episode_id") == key]


def heart_rates(events):
    return [e for e in events if e["event_type"] == "measurement" and e["payload"].get("metric") == "heart_rate"]


class FictionalWeekTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.events = load_events()
        schema = json.loads(SCHEMA.read_text())
        Draft202012Validator.check_schema(schema)
        cls.validator = Draft202012Validator(schema, format_checker=FormatChecker())

    def test_all_events_validate_against_openpaw_schema(self):
        for event in self.events:
            with self.subTest(id=event["event_id"]):
                self.assertFalse(list(self.validator.iter_errors(event)))

    def test_identity_ordering_and_seven_contiguous_utc_days(self):
        self.assertEqual(len(self.events), 45)
        self.assertEqual(len({e["event_id"] for e in self.events}), 45)
        self.assertEqual({e["dog_id"] for e in self.events}, {"fictional-dog-001"})
        times = [timestamp(e) for e in self.events]
        self.assertTrue(all(t.tzinfo is not None and t.utcoffset() == timedelta(0) for t in times))
        self.assertEqual(times, sorted(times))
        self.assertEqual({t.date().isoformat() for t in times}, {
            "2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08",
            "2026-10-09", "2026-10-10", "2026-10-11",
        })

    def test_every_event_is_unambiguously_fictional(self):
        for e in self.events:
            with self.subTest(id=e["event_id"]):
                self.assertEqual(e["provenance"], {
                    "origin": "simulated", "source_id": "openpaw-fictional-week-v0",
                })

    def test_three_trigger_episodes_with_observed_precursors_and_interventions(self):
        groups = {"ep-bike", "ep-dog-a", "ep-dog-b"}
        self.assertEqual({e.get("episode_id") for e in self.events if e["event_type"] == "trigger"}, groups)
        self.assertEqual(Counter(e["event_type"] for e in self.events)["trigger"], 3)
        for group in groups:
            records = episode(self.events, group)
            trigger = next(e for e in records if e["event_type"] == "trigger")
            precursor = next(e for e in records if e["event_type"] == "observation")
            intervention = next(e for e in records if e["event_type"] == "intervention")
            recoveries = [e for e in heart_rates(records) if timestamp(e) > timestamp(intervention)]
            self.assertLess(timestamp(trigger), timestamp(precursor))
            self.assertLess(timestamp(precursor), timestamp(intervention))
            self.assertGreaterEqual(len(recoveries), 2)
            self.assertTrue(all(timestamp(e) > timestamp(intervention) for e in recoveries))

    def test_baseline_variation_and_shorter_sleep_are_observed_not_inferred(self):
        resting = [e for e in heart_rates(self.events) if e.get("episode_id") is None]
        monday = next(e for e in resting if e["timestamp"].startswith("2026-10-05"))
        pre_walk = next(e for e in heart_rates(episode(self.events, "ep-dog-a")) if e["timestamp"].endswith("07:50:00Z"))
        self.assertGreater(pre_walk["payload"]["value"], monday["payload"]["value"])
        sleep = [e["payload"]["value"] for e in self.events if e["payload"].get("metric") == "sleep_minutes"]
        self.assertEqual(len(sleep), 7)
        self.assertGreater(max(sleep) - min(sleep), 150)

    def test_fast_vs_slow_recorded_recovery_and_second_trigger_gap(self):
        bike = episode(self.events, "ep-bike")
        second = episode(self.events, "ep-dog-b")
        def elapsed(group):
            trigger = next(e for e in group if e["event_type"] == "trigger")
            return timestamp(heart_rates(group)[-1]) - timestamp(trigger)
        self.assertLess(elapsed(bike), timedelta(minutes=30))
        self.assertGreater(elapsed(second), timedelta(minutes=60))
        first_thursday = episode(self.events, "ep-dog-a")
        first_last = heart_rates(first_thursday)[-1]
        second_trigger = next(e for e in second if e["event_type"] == "trigger")
        self.assertLess(timestamp(second_trigger) - timestamp(first_last), timedelta(minutes=5))
        self.assertGreater(first_last["payload"]["value"], 77)  # fixture reference; not a threshold

    def test_expert_remarks_are_explicitly_fictional(self):
        annotations = [e for e in self.events if e["event_type"] == "expert_annotation"]
        self.assertEqual({e["payload"]["role"] for e in annotations}, {"veterinarian", "behavior_professional"})
        self.assertTrue(all(e["payload"].get("is_fictional") is True for e in annotations))
        self.assertTrue(all(e["provenance"]["origin"] == "simulated" for e in annotations))

    def test_owner_notes_present_without_diagnostic_labels(self):
        notes = [e for e in self.events if e["payload"].get("behavior") == "owner_note"]
        self.assertGreaterEqual(len(notes), 3)
        self.assertTrue(all(e["payload"].get("observer") == "fictional_owner" for e in notes))
        self.assertTrue(all(e["event_type"] != "derived_state" for e in self.events))


if __name__ == "__main__":
    unittest.main()
