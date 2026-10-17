# Offline expert-review timeline (synthetic only)

This is a **static local pretotype**, not a health service, diagnostic tool, or validated canine-arousal model. It reuses the 45-event fictional JSONL fixture from [issue #2](https://github.com/kvnloo/openpaw/issues/2). No new database, framework, device, auth, API, or cloud service.

## Try it

From the repository root:

```sh
python demo/render_timeline.py
# Open demo/timeline.html in a browser; the file needs no server.
python -m unittest discover -s tests -p 'test_timeline.py' -v
```

For all fixture/schema tests: `python -m pip install jsonschema && python -m unittest discover -s tests -v`.

## What it does

- Seven days of source events, first recorded HR (not necessarily a resting baseline), sleep estimates, and three fictional trigger episodes.
- Cross-linked episode → trigger → individual sample, with original UTC instants, source IDs and notes. Activating an episode link also expands and keyboard-focuses its source record, even when a role filter had hidden it.
- Reversible `All / Veterinary / Behavior` display filters. Empty-looking days say their events were hidden by the selected filter; the full stream remains available under `All`. This is not missing-data imputation.
- A **not computed** arousal state; elapsed time to the last recorded sample is **not** labeled recovery duration.
- Explicit download of the byte-identical synthetic JSONL or a locally authored note (unverified review question). No autosave or network calls.

The script **refuses** non-simulated data or unexpected dog/source identity. Its content-security policy disallows script-initiated network connections (the optional source hyperlink navigates only if clicked). Browser tabs may still keep unsaved form input in memory. Downloaded notes may be personal or sensitive: keep them private. **No real expert review has been conducted or implied.** Fictional expert questions are examples only.

### Verification scope

On 2026-10-11: `8/8` Python unit tests passed; Chromium desktop and 390px-mobile checks passed (45 visible events before filtering, 34 veterinary, 17 behavior, 3 days empty under the behavior filter; keyboard-triggered episode navigation expands/focuses source evidence; raw JSONL download byte-identical with fixture; manual note export; no horizontal overflow, script network calls or JavaScript page errors). Browser checks loaded the generated HTML as an in-memory document because this environment blocked direct `file://` navigation; direct file opening remains unverified here. These tests demonstrate this *synthetic UI workflow only*. Real canine sensor accuracy, biological plausibility, veterinary actionability, accessibility conformance, and research consent have **not** been validated.

### Next evidence

Ask a veterinarian and qualified behavior professional to inspect a fictional episode using [the interview guide](../docs/EXPERT-INTERVIEWS.md). Capture whether it changes a real question or decision, and credit their contributions with permission. Build [derived-state logic](https://github.com/kvnloo/openpaw/issues/3) only after validating demand and the underlying evidence.
