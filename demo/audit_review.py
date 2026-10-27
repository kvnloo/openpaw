"""Offline source-link audit for an unverified OpenPaw fictional-week note.

Confirms only *linkage* against one pinned synthetic dataset. This is NOT a
signature, authentication, professional credential check, or clinical review.
Requires only Python's standard library; no network, writing or note-text output.
"""
from __future__ import annotations

import argparse
from datetime import datetime
import hashlib
import json
from pathlib import Path
import sys
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_FIXTURE = ROOT / "fixtures" / "fictional-week.jsonl"
PINNED_FIXTURE_SHA256 = "5443d0593eaf1bea9d84d0fb795c6e6161c6240a6db3c0527dbd47356faab421"
SOURCE_ID = "openpaw-fictional-week-v0"
REVIEW_KEYS = frozenset({
    "schema_version", "source", "source_fixture_sha256", "review_type",
    "reviewer_role_self_reported", "credential_verified", "episode_id",
    "evidence_event_ids", "created_at_utc", "timestamp_source", "text",
})
ROLES = frozenset({"unspecified", "veterinarian", "behavior_professional", "owner"})


class ReviewAuditError(ValueError):
    """Machine-readable failure code, never includes content of private notes."""


def require(condition: bool, code: str) -> None:
    if not condition:
        raise ReviewAuditError(code)


def limited_read(path: Path, maximum: int) -> bytes:
    try:
        require(path.is_file() and path.stat().st_size <= maximum, "missing_or_oversized_file")
        # Recheck after reading in case another process changes the file.
        data = path.read_bytes()
        require(len(data) <= maximum, "missing_or_oversized_file")
        return data
    except OSError as exc:
        raise ReviewAuditError("unreadable_file") from exc


def unique_object_keys(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for key, value in pairs:
        require(key not in out, "ambiguous_duplicate_json_key")
        out[key] = value
    return out


def parse_json(raw: bytes) -> Any:
    try:
        return json.loads(raw.decode("utf-8"), object_pairs_hook=unique_object_keys)
    except (UnicodeError, json.JSONDecodeError) as exc:
        raise ReviewAuditError("invalid_utf8_or_json") from exc


def load_fixture(path: Path) -> dict[str, dict[str, Any]]:
    raw = limited_read(path, 2_000_000)
    require(hashlib.sha256(raw).hexdigest() == PINNED_FIXTURE_SHA256, "fixture_not_canonical")
    rows = [parse_json(line) for line in raw.splitlines() if line.strip()]
    require(len(rows) == 45, "fixture_count_mismatch")
    indexed: dict[str, dict[str, Any]] = {}
    for row in rows:
        require(isinstance(row, dict), "invalid_fixture_record")
        event_id = row.get("event_id")
        require(isinstance(event_id, str) and event_id and event_id not in indexed, "invalid_fixture_id")
        require(row.get("dog_id") == "fictional-dog-001" and row.get("provenance") == {"origin": "simulated", "source_id": SOURCE_ID}, "not_a_synthetic_record")
        indexed[event_id] = row
    return indexed


def audit_receipt(receipt_path: Path, fixture_path: Path = DEFAULT_FIXTURE) -> dict[str, Any]:
    """Check source linkage only; do not echo note text or claim authenticity."""
    events = load_fixture(fixture_path)
    note = parse_json(limited_read(receipt_path, 64_000))
    require(isinstance(note, dict), "not_a_json_object")
    require(set(note) == REVIEW_KEYS, "unexpected_or_missing_fields")
    for field, expected in (
        ("schema_version", "openpaw-local-review-v0"),
        ("source", SOURCE_ID),
        ("source_fixture_sha256", PINNED_FIXTURE_SHA256),
        ("review_type", "unverified_user_note"),
        ("timestamp_source", "local_device_clock_unverified"),
    ):
        require(note[field] == expected and isinstance(note[field], str), "invalid_" + field)
    require(note["credential_verified"] is False, "credential_claim_not_supported")
    require(isinstance(note["reviewer_role_self_reported"], str) and note["reviewer_role_self_reported"] in ROLES, "invalid_self_reported_role")
    episode_ids = {event.get("episode_id") for event in events.values() if event.get("episode_id")}
    require(isinstance(note["episode_id"], str) and note["episode_id"] in episode_ids | {"week"}, "unknown_review_context")
    require(isinstance(note["text"], str) and 0 < len(note["text"].strip()) <= 2000, "empty_or_oversized_note")
    require(isinstance(note["created_at_utc"], str), "invalid_local_clock_timestamp")
    try:
        datetime.strptime(note["created_at_utc"], "%Y-%m-%dT%H:%M:%S.%fZ")
    except ValueError as exc:
        raise ReviewAuditError("invalid_local_clock_timestamp") from exc
    refs = note["evidence_event_ids"]
    require(isinstance(refs, list) and 0 < len(refs) <= 45, "invalid_evidence_list")
    require(all(isinstance(ref, str) and ref in events for ref in refs), "unknown_evidence_event")
    require(len(set(refs)) == len(refs), "duplicate_evidence_event")
    order = list(events)
    require(refs == [ref for ref in order if ref in refs], "evidence_not_in_source_order")
    context = note["episode_id"]
    scope_references = sum(events[ref].get("episode_id") == context for ref in refs)
    cross_scope = sum(events[ref].get("episode_id") not in (None, context) for ref in refs)
    warnings = ["review_author_and_credentials_unverified", "local_clock_unverified", "free_text_and_receipt_unsigned"]
    if context != "week" and not scope_references:
        warnings.append("selected_episode_not_among_linked_events")
    if context != "week" and cross_scope:
        warnings.append("includes_cross_episode_evidence")
    return {
        "result": "LINKED_TO_PINNED_SYNTHETIC_FIXTURE",
        "linked_event_count": len(refs),
        "source_fixture_sha256": PINNED_FIXTURE_SHA256,
        "warnings": warnings,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("receipt", type=Path, help="Downloaded local review JSON")
    parser.add_argument("--fixture", type=Path, default=DEFAULT_FIXTURE, help="Original fictional-week JSONL")
    args = parser.parse_args(argv)
    try:
        report = audit_receipt(args.receipt, args.fixture)
    except ReviewAuditError as exc:
        print(json.dumps({"result": "FAIL", "code": str(exc)}))
        return 2
    print(json.dumps(report, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
