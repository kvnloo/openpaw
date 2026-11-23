---
description: Check whether an OpenPaw collar is healthy from a serial CSV log or a JSONL export. Reports measurements only.
argument-hint: "<path to .jsonl or .csv>"
---

Check the collar data file the user gave ($ARGUMENTS). If no file was given, ask them to export one from the app (**Export OpenPaw JSONL**) after 10 minutes still on a table and 10 minutes carried while walking, and to attach it or give its path.

If `tools/check_export.py` exists (run it only if it exists: `python3 tools/check_export.py <file>`), use its output. Otherwise read the file yourself as below. Never upload the file anywhere.

## Formats
**Serial CSV** (USB serial, 115200 baud). The first line is `openpaw fw=... board=... imu=ok|MISSING storage=flash ...`, then this header (`storage=` names the memory chip the collar found, e.g. `flash P25Q16H 2048KB (856015)`, or `flash none, internal (ffffff)` when it found none; both are fine for now):

`seq,uptime_s,flags,vedba_mean_mg,vedba_max_mg,active_frac,pitch_deg,roll_deg,bursts,hr_bpm,battery_pct`

`active_frac` is 0..255 (255 = the whole epoch). `flags` bits: 1 heart rate valid, 2 charging, 4 clipped, 8 gap. `battery_pct` 255 means unknown.

**JSONL export** (one OpenPaw event per line, `event_type: measurement`). Each 5 s epoch produces events with these `payload.metric` values:
`movement.vedba_mean` (mg), `movement.vedba_max` (mg), `movement.active_fraction` (ratio 0..1), `movement.bursts` (count), `posture.pitch` (deg), `posture.roll` (deg), plus `physiology.heart_rate` (bpm) when present, `device.battery` (percent) when known, and `physiology.rr_intervals` (ms) from a chest strap. `provenance.device_seq` and `provenance.device_uptime_s` identify the epoch; `provenance.quality` holds `clipped` and `gap`.

## Checks (report each as pass, warn or fail with the numbers)
1. **Sensor found:** CSV line 1 says `imu=ok`. `imu=MISSING` is a fail: send them to the troubleshooting table in `docs/COLLAR.md`.
2. **Epoch spacing:** consecutive `uptime_s` / `device_uptime_s` values step by 5 s. Count missing `seq` numbers and report them as gaps with times (a gap usually means the phone was away and the backlog was not downloaded).
3. **Quality flags:** share of epochs marked gap or clipped. A few clipped epochs during play are normal; clipping while still is a warn.
4. **Still vs moving:** during the still period VeDBA mean should sit well below the 120 mg active threshold with active fraction near 0; while carried and walking, active fraction should rise clearly above it. Report the median and range of `vedba_mean` for each period. If both periods look the same, say the sensor may not be reading motion.
5. **Bursts:** counts of events above 1.5 g. A still table should show none.
6. **Posture:** pitch and roll should be steady while still. Large jumps on a still table are a warn.
7. **Battery:** latest value, or "unknown" if 255 / no `device.battery` events (normal while the collar runs on USB power with no battery).

End with one line: healthy, check X, or not working, and the next step from `docs/COLLAR.md`.

## Rules
- These are device-health measurements, not facts about the dog. Never diagnose, never read emotions, no "stress score", no treatment advice.
- Demo data from the app has `provenance.origin` set to `simulated`; if the file has it, say the result does not describe a real collar.
- Do not repeat the dog ID or any personal detail back unless asked.
