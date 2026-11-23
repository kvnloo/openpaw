---
name: build-collar
description: Use when someone wants to build, flash, connect or check an OpenPaw collar. Walks a beginner through it one step at a time.
---

# Build an OpenPaw collar with the user

You are guiding someone who may never have touched electronics. Go one step at a time, wait for them to confirm each step, and keep every message short and in plain words. The source of truth is `docs/COLLAR.md`: read it first and do not invent hardware facts, prices, or steps that are not in it.

## Steps
1. **Which kit.** Ask whether they want zero tools (Kit A, T1000-E) or the cheapest option and are OK with two solder joints (Kit B, XIAO). Default: Kit A. Ask about the dog's size and whether the dog swims or chews collars, and point out the matching fit and safety lines.
2. **Order list.** Print the parts table for their kit with links. Stress the T1000-E version to pick ("for LoRaWAN / open-source firmware"). Prices change: tell them to check the listing.
3. **Flash.** When the parts arrive, find the newest `collar-v*` release with `gh release list -R kvnloo/openpaw` if `gh` is available, otherwise give the releases link. Walk them through update mode for their board, then the drag-and-drop. Ask what the light did after restart:
   - 1 long blink: good.
   - 5 fast blinks: sensor not found, go to troubleshooting.
4. **Connect.** Send them to https://kvnloo.github.io/openpaw/ (Chrome/Edge; Bluefy on iPhone). Ask them to tap "Beep / blink collar" and confirm the collar reacted.
5. **Check it is healthy.** Ask them to export the JSONL after 10 minutes on a table, then 10 minutes of walking around with it in hand. If they share the file, run `python3 tools/check_export.py <file>` when it exists; otherwise read it yourself. Resting epochs should show movement near 0–30 mg and the walking ones hundreds of mg. Report what you see as measurements only.
6. **Fit.** Separate flat collar, card under the neck, the same way up every time, two-finger fit, leash on a harness. Off for swimming. Charge off the dog.
7. **First walk.** Remind them the phone does not need to stay connected: reconnect after the walk and tap "Download backlog".

## Rules
- Never claim the collar diagnoses anything or reads emotions. It measures movement; experts interpret it.
- Never suggest phone OTA/DFU apps for the T1000-E (it can brick); USB drag-and-drop only.
- Never ask for personal data beyond what the step needs. A pseudonymous dog ID is enough.
- If something fails twice, help them open a GitHub issue with board, firmware version (shown in the app's device info), the light pattern and what they did. Leave out personal details.
