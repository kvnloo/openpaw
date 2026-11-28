---
description: Check whether an OpenPaw collar is healthy from a serial CSV log or a JSONL export. Reports measurements only.
argument-hint: "<path to .jsonl or .csv>"
---

Check the collar data file the user gave ($ARGUMENTS). If no file was given, ask them to export one from the app (**Export OpenPaw JSONL**) after 10 minutes still on a table and 10 minutes carried while walking, and to attach it or give its path.

If `tools/check_export.py` exists (run it only if it exists: `python3 tools/check_export.py <file>`), use its output. Otherwise read the file yourself as below. Never upload the file anywhere.

## Formats
**Serial CSV** (USB serial, 115200 baud). The first line is `openpaw fw=... board=... imu=ok|MISSING storage=flash ... log=flash|internal|ram stored=... next_seq=...`, then this header (`storage=` names the memory chip the collar found, e.g. `flash P25Q16H 2048KB (856015)`, or `flash none, internal (ffffff)` when it found none. `log=flash` means records survive a restart (about 5 days on a 2 MB chip); `log=internal` means no chip answered and the collar saves to its own processor's flash instead, about 15 hours, also kept through a restart (firmware after 0.4.0; compiles and is host-tested, not yet run on hardware); `log=ram` means the collar keeps only the last ~5.7 hours and a restart clears them. Firmware 0.1.x has no `log=` key and is always RAM. `stored=` is how many epochs are saved, `next_seq=` the number the next epoch gets):

`seq,uptime_s,flags,vedba_mean_mg,vedba_max_mg,active_frac,pitch_deg,roll_deg,bursts,hr_bpm,battery_pct`

`active_frac` is 0..255 (255 = the whole epoch). `flags` bits: 1 heart rate valid, 2 charging, 4 clipped, 8 gap. `battery_pct` 255 means unknown.

A T1000-E (firmware after 0.4.0) may print `qma_clock=fallback` once between data lines: its accelerometer's slower power-saving clock in Still mode did not give 12.5 samples a second, so the collar went back to the normal clock until the next restart. The data stays valid; only battery use while still is higher (docs/POWER.md). Report it as a note, not a fail, and suggest mentioning it in an issue, because this code is compiled and host-tested but not yet run on hardware.

A XIAO (firmware after 0.4.0) goes into Quiet mode after about 6 minutes still with no phone connected: it stops reading its sensor and writes no-sample epochs (CSV flags value 32 or more, pitch -128, roll -256), except one sampled epoch a minute. So on a 10-minute still table expect roughly the last 4 minutes to be mostly no-sample: that is normal, not a fault. It may also print `wake_pin=fallback` once: a sampled epoch showed movement the accelerometer's wake-up pin had not reported, so the collar turned Quiet mode off until the next restart. Report that as a note, not a fail, and suggest mentioning it in an issue (compiled and host-tested, not yet run on hardware).

**JSONL export** (one OpenPaw event per line, `event_type: measurement`). Each 5 s epoch produces events with these `payload.metric` values:
`movement.vedba_mean` (mg), `movement.vedba_max` (mg), `movement.active_fraction` (ratio 0..1), `movement.bursts` (count), `posture.pitch` (deg), `posture.roll` (deg), plus `physiology.heart_rate` (bpm) when present, `device.battery` (percent) when known, and `physiology.rr_intervals` (ms) from a chest strap. `provenance.device_seq` and `provenance.device_uptime_s` identify the epoch; `provenance.quality` holds `clipped` and `gap` (newer exports also `low_rate` and `no_sample`). An epoch with a `device.no_sample` event (value 1) is one where the collar did not read its sensor (record flag `0x20`; a XIAO on firmware after 0.4.0 writes them in Quiet mode, see above): it has no movement or posture events, so count it as present for spacing, but leave it out of every still/moving, burst and posture check and never call it "still".

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
