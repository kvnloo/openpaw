# Fictional-week fixture

`fictional-week.jsonl` is a **fictional** seven-day dog timeline (2026-10-05 to 2026-10-11, timestamps in UTC). It is for testing OpenPaw's event contract and expert-facing UI, not clinical interpretation.

- 45 simulated events, one imaginary dog, three invented trigger episodes, no location coordinates or owner identifiers.
- Tuesday's bicycle episode returns near its own initial heart-rate reading more quickly than Thursday's two dog-trigger episodes. Thursday also has deliberately shorter sleep and higher pre-walk heart rate in the fictional story. These are *constructed examples*, **not** validated canine physiology or universal thresholds.
- Two end-of-week expert roles are **fictional example questions**, not veterinarian or behavior-professional feedback/endorsements.
- Recovery is represented by timestamped measurements, **not** a diagnostic label or model inference. There are no `derived_state` events because an inference algorithm is not yet validated (see #3).
- Each event has `provenance.origin = simulated`, a synthetic source ID, and a stable event ID. No private pet or human data were used.

Validation (requires `jsonschema`):

```bash
python -m pip install jsonschema
python -m unittest discover -s tests -v
```

This fixture intentionally does **not** prove a professional would use the interface. The validation criterion remains the independent expert sessions in #4.
