# OpenPaw on smart glasses: plan, research and limits

> Status (2026-11-23): **no glasses integration exists yet.** What ships today is
> [Field mode](../app/field.html): a phone web page that works the same way the glasses would
> (tap or speak to mark trigger → reaction → recovery, glanceable cues, optional collar and camera),
> plus a simulated glasses display. This document says what the glasses can do now, how
> OpenPaw would use them, and what has to happen first.

## Why glasses at all

The owner's problem is time and hands. A reactive dog can go from "noticed a stranger" to lunging
in a few seconds at 20 to 30 feet, while the owner is holding a leash and treats. A phone in a
pocket is too slow to reach. Glasses (or Field mode with the phone clipped on) let the owner:

1. mark what happened with one word or a tap on the frame, without looking away from the dog;
2. get a tiny cue back (tone, haptic, one glyph on the display) at the moment it matters;
3. later, see the episode timeline: how far away the trigger was, how long the dog took to settle,
   and what the owner did, across weeks.

OpenPaw stays what it is: **measurements and owner observations, no diagnosis, no emotion stated as
fact, no stress score.** Anything a model suggests is shown as a suggestion and stored only after the
owner confirms it (see `docs/PROTOCOL.md`).

## What Meta's glasses let third-party apps do (as of Nov 2026)

Two separate developer paths exist. Both are labelled **developer preview**.

| | Wearables Device Access Toolkit (DAT) | Web Apps for Meta Ray-Ban Display |
|---|---|---|
| Runs where | Inside *your* native iOS / Android app on the phone; the glasses are a peripheral | In a Chromium-based browser on the glasses themselves |
| Glasses | Ray-Ban Meta Gen 1 & Gen 2, Ray-Ban Meta Optics, Meta glasses, Meta Ray-Ban Display, Oakley Meta HSTN, Oakley Meta Vanguard | Meta Ray-Ban Display only (Neural Band optional) |
| Camera | Yes: video stream (resolution / frame-rate selection), single-frame capture, photo capture (photo is *experimental*) | **No** |
| Microphone | Yes: Bluetooth HFP (8 kHz mono) or audio in-band with a camera stream (16 kHz PCM, *experimental*); on-device transcription module (*experimental*) | **No raw audio**; only text dictated into a text field, or Meta AI calling tools the page registers (WebMCP, off by default) |
| Speakers | Yes (A2DP / HFP) | `speechSynthesis` subset through the glasses speaker |
| Motion / IMU | `mwdat-motion`: orientation + movement samples (*experimental*) | `DeviceMotionEvent` / `DeviceOrientationEvent`, permission-gated |
| Display / HUD | Display glasses only: component layouts (FlexBox, Text, Image, Button, Icon) sent over Bluetooth, 600×600 | The page *is* the display: 600×600 additive (black = see-through) |
| Input | `mwdat-inputs`: taps, nav, capture button (*experimental*) | Arrow keys + Enter from touchpad / Neural Band; text composer |
| Storage | Whatever the phone app uses | `localStorage` / `sessionStorage`, Service Worker cache (IndexedDB not documented) |
| Testing without glasses | Mock Device Kit (simulated glasses incl. camera; Display surface previewable in Chrome); MockDevice MCP for AI agents | "Meta Ray-Ban Display Simulator" Chrome extension |
| Distribution | Developer Mode in the Meta AI app for unpublished apps; invite-only release channels from the Wearables Developer Center. Apps using *experimental* features cannot be published yet. | Hosted on any HTTPS URL; installed by QR install link or install control; wearer confirms on the glasses |

Facts above come from Meta's developer docs (v1.1 docs, SDK 1.1.0 released 2026-11-20):

- Setup, OS versions (iOS 17.2+, Android 10+) and supported glasses: <https://wearables.developer.meta.com/docs/develop/dat/getting-started-toolkit>
- Integration overview (sessions, camera, mic over HFP 8 kHz, display module; "Meta does not access photos/videos or audio transferred directly from the glasses to the third-party app"): <https://wearables.developer.meta.com/docs/develop/dat/build-overview>
- Microphones and speakers (A2DP / HFP, camera-stream audio is experimental): <https://wearables.developer.meta.com/docs/develop/dat/microphones-and-speakers>
- Display access (600×600, component layouts over Bluetooth, explicit display sessions): <https://wearables.developer.meta.com/docs/develop/dat/display-overview>
- Mock Device Kit and Display simulation: <https://wearables.developer.meta.com/docs/develop/dat/mock-device-kit>, <https://wearables.developer.meta.com/docs/develop/dat/display-simulation>
- Android SDK on Maven Central, modules core/camera/display/inputs/motion/speech/mockdevice, "in developer preview": <https://github.com/facebook/meta-wearables-dat-android> (iOS: <https://github.com/meta/meta-wearables-dat-ios>)
- Changelog (1.0.0 2026-09-24 added experimental Inputs, Motion, Speech, Photo; 1.1.0 2026-11-20): <https://github.com/meta/meta-wearables-dat-android/blob/main/CHANGELOG.md>
- Web Apps for Display glasses (Chromium, 600×600 additive, sensors, TTS, storage): <https://wearables.developer.meta.com/docs/develop/webapps/build>, launch post <https://developers.meta.com/blog/build-for-display-glasses>
- Machine-readable index of all of the above: <https://wearables.developer.meta.com/llms.txt>

Not verified by us (no hardware, no developer account yet): actual camera resolutions/frame rates
over Bluetooth/Wi-Fi, end-to-end latency from glasses camera to phone, battery cost of a 30-minute
streaming walk, whether the Display Web App browser supports IndexedDB or Web Bluetooth (not
documented; assume no), and how review treats a pet-behavior app.

### Policy constraints that shape the design

From the Acceptable Use Policy (<https://wearables.developer.meta.com/acceptable-use-policy>) and the
DAT acceptable-use guide (<https://wearables.developer.meta.com/docs/develop/dat/acceptable-use>):

- Do not surreptitiously collect recognisable audio/video of the user or others; never obscure or
  bypass the hardware capture LED.
- Do not use device sensors to identify people by physical characteristics (faces, voices) without
  Meta's prior approval; do not analyse people around the wearer to facilitate unwanted approaches.
- Meta reviews DAT apps and can revoke access without notice.
- Meta's stated design principle: **"narrow purpose, short retention, obvious to bystanders."**
  Meta's bystander-privacy paper: <https://about.fb.com/wp-content/uploads/2026/07/Bystander-Privacy.pdf>

OpenPaw's use fits "hands-free capture and logging" if, and only if, the camera is about **the dog
and the distance to a trigger**, never about who the stranger is.

## Architecture

```
 Ray-Ban / Oakley Meta glasses ──(DAT session: camera frames, mic, IMU, taps)──┐
                                                                              ▼
 OpenPaw collar ──(BLE, openpaw-ble.js wire format)──►  OpenPaw companion app (Android first, native, DAT)
                                                        │  on-device: person/dog detector, distance estimate,
                                                        │  speech → mark, episode state machine (= field.js)
                                                        ▼
                                          OpenPaw event store (same v0.1 events as app/store.js)
                                                        │  export JSONL → owner / consultant / vet
                                                        ▼
 Meta Ray-Ban Display ◄──(DAT display: glyph + 1-2 words)── cue engine ──► tone / haptic / TTS
```

- **One event model.** Field mode already writes the events the companion app will write:
  `trigger.seen` (event_type `trigger`, owner distance band in ft, optional trigger class),
  `behavior.reacted`, `behavior.calm` (with `time_to_calm_s`, `reaction_to_calm_s`),
  `intervention.reward`, `intervention.distance`, `body_language.tags`, all sharing an `episode_id`.
  Glasses-derived inputs add `payload.input` (`voice`, `glasses-tap`, `collar-prompt`, `camera-snapshot`).
- **Cues are minimal.** On Display glasses: one glyph + at most 4 words + a timer, black elsewhere
  (additive display). On displayless glasses: a short tone or 2-3 spoken words through the speakers.
  Cue vocabulary today (Field mode "Glasses preview"): `Trigger 20–40 ft · 0:14`,
  `Breathe · U-turn`, `Calm again · in 1:12`. Cue content is chosen by the owner or their
  consultant's plan, never invented by OpenPaw (protocol: "OpenPaw itself should not invent treatment protocols").
- **Vision is a helper, not a judge.**
  1. *Person-or-dog detection* on the glasses camera stream, on the phone, at a few frames per second.
  2. *Distance estimate* from the detection box (pinhole model with an assumed person height of
     ~1.7 m and the camera's focal length) → coarse band `<10 / 10–20 / 20–40 / 40+ ft`. Expect
     ±30% or worse; it is labelled as an estimate with method and confidence, and the owner's own
     band wins when both exist.
  3. *Precursor prompts*: when a person enters the 40 ft band and no episode is open, the HUD asks
     "Trigger? 30 ft" and the owner confirms with a tap/word. Nothing is stored without confirmation.
  4. *Body-language tags* are owner-selected from an observable vocabulary ("hard stare", "freeze",
     "lip lick", "whale eye", "ears back", "loose wiggly", "sniffing", ...). A future dog-pose model
     may *pre-highlight* candidate tags; it never writes them.
- **Bystander privacy, by construction.** Frames are processed in memory on the phone and dropped;
  only numbers (class, box size, distance band, confidence) are kept. No face detection, recognition,
  or storage; if a photo is ever kept (owner toggle, dog-focused), people are blurred before saving.
  The capture LED is never obscured; the app shows its own "camera on" state; recording stops when
  the glasses are folded or removed (DAT pauses streams on hinge close).

## On-device dog and person vision: what exists

| Option | What it gives | Size / runtime | Licence | Fit |
|---|---|---|---|---|
| MediaPipe Object Detector, EfficientDet-Lite0 (COCO: `person`, `dog`) <https://developers.google.com/edge/mediapipe/solutions/vision/object_detector?tab=Web> | Boxes for person / dog | Model 4.6 MB int8 (<https://huggingface.co/litert-community/MediaPipe-ObjectDetector-EfficientDet-Lite0>), but the web runtime `vision_wasm_internal.wasm` is ~11 MB (measured from npm 0.10.35) | Apache-2.0 | Best first detector for the native app (LiteRT on Android). Too big to vendor in the web page under the 5 MB budget. |
| Ultralytics YOLO11/YOLO26 detect + **dog-pose** (24 keypoints, 6,773 train / 1,703 val images) <https://docs.ultralytics.com/datasets/pose/dog-pose> | Boxes; dog keypoints (legs, tail, ears, face) | Nano ONNX ≈ 5 MB FP16 (e.g. <https://huggingface.co/flotek/yolo26n-onnx>) + onnxruntime-web WASM (several MB) | **AGPL-3.0** (or paid enterprise licence) <https://ultralytics.com/blog/is-yolo-free-for-commercial-use> | Technically good. AGPL-3.0 can be combined with GPL-3.0 but makes the combined work AGPL; needs a deliberate licence decision first. |
| DeepLabCut **SuperAnimal-Quadruped** (39 keypoints, Quadruped-80K) <https://huggingface.co/mwmathis/DeepLabCutModelZoo-SuperAnimal-Quadruped>, paper <https://www.nature.com/articles/s41467-024-48792-2> | Research-grade quadruped pose, zero-shot | HRNet-w32 / ResNet-50: far too heavy for a browser; offline/desktop analysis of walk video | Code LGPL-3.0; weights' licence changed across model-card revisions (**unverified, check before use**) | Good for consultants analysing recorded clips offline, not for a live HUD. |
| StanfordExtra (12k dogs, 2D keypoints + masks) <https://github.com/benjiebob/StanfordExtra> | Training data | — | Repo code MIT; annotations reported as CC BY-NC-SA 4.0 (**unverified**); images from Stanford Dogs/ImageNet (non-commercial) | Training/eval only. |
| MediaPipe pose | Human pose only; **no dog pose model** | — | Apache-2.0 | Not useful for the dog. |

**Body-language and "emotion" classifiers.** Published work exists (e.g. DogFACS-based recognition of
anticipation vs. frustration in Labrador retrievers in a controlled setup:
<https://pmc.ncbi.nlm.nih.gov/articles/PMC9803655>; dog facial landmarks:
<https://pmc.ncbi.nlm.nih.gov/articles/PMC12218811>; video emotion recognition:
<https://link.springer.com/article/10.1007/s00521-024-10042-3>). Limits that matter for OpenPaw:
small, lab-staged or single-breed datasets; labels are inferred from the eliciting situation, not
from the dog; faces need close, frontal, well-lit views (not a dog 2 m ahead on a leash, from behind);
breed morphology (ears, coat, brachycephaly) shifts features; no validation on reactive dogs in the
field. Conclusion: **no classifier output is shown as the dog's feeling.** At most, keypoints become
observable measurements ("ears back", "tail height"), owner-confirmed, with `origin: model`,
`algorithm_version` and `confidence` if ever stored (PROTOCOL.md derived-state rules).

Owners do benefit from training here: studies show owners under-recognise subtle stress and pain
signals (e.g. Mariti et al., J. Vet. Behav. 2012 <https://doi.org/10.1016/j.jveb.2011.09.004>;
<https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0344512>). That is why Field mode
asks the owner to *tag what they see*, and why the learn page trains the vocabulary.

**Browser feasibility (Field mode).** A detector in the web page is feasible technically (WASM/WebGPU),
but every candidate runtime + model is above the 5 MB vendoring budget or AGPL, and the rule is no
third-party/CDN requests. So Field mode ships **without** a model and exposes a hook:

```js
// app/field.js — register any on-device detector; suggestions only, owner confirms.
window.OpenPawVision.register(async (videoEl) => [{ label: 'person', score: 0.82, box: [x, y, w, h] }]);
```

When the camera is on and a detector is registered, a `person`/`dog` hit with score ≥ 0.6 and no open
episode shows "Camera sees a person. Mark as trigger?". Nothing is stored unless the owner taps.

## Roadmap

| Phase | What | Status |
|---|---|---|
| **P0 Field mode (web)** | `app/field.html`: big one-handed buttons, distance chips, episode timer and time-to-calm, voice tagging (Web Speech), live collar strip with "Mark as reaction?" prompts, simulated glasses HUD + tone/TTS/vibration, rear-camera snapshot with owner tags (photo off by default), wake lock. Works in Chrome on Android today; voice and Web Bluetooth degrade gracefully elsewhere. | **Built** (this change) |
| **P1 Android companion (DAT)** | Native Kotlin app: register with Meta AI, DAT camera stream + glasses taps + on-device transcription → same events; collar over BLE; Mock Device Kit tests in CI. Detector: EfficientDet-Lite0 (Apache-2.0) via LiteRT, frames never stored. | Needs developer access + glasses |
| **P2 HUD on Display glasses** | DAT display session with the Field mode cue set (glyph + ≤4 words + timer). Cheaper alternative to evaluate first: Field mode's HUD as a **Display Web App** (HTTPS page, arrow/Enter input, `speechSynthesis`); limits: no camera/mic/Bluetooth there, localStorage only, so it would mirror the phone rather than replace it. | Needs Meta Ray-Ban Display |
| **P3 Vision-assisted distance + precursor prompts** | Person/dog box → distance band estimate (owner-calibrated against known distances), "Trigger? 30 ft" prompt before the dog reacts; dog-pose pre-highlights tag candidates. Validate against owner-marked bands before showing estimates by default. | Research |

Long-term analytics (track/patterns pages) consume the same events: trigger distance over weeks,
time-to-calm trend, reactions per walk, which interventions preceded faster recovery (associations,
never causes).

## What needs Kevin

1. **Create a Meta Wearables Developer Center account / organization** (<https://wearables.developer.meta.com/>) and enable Developer Mode in the Meta AI app (Settings → App Info → tap version 5×).
2. **Hardware decision**: Ray-Ban Meta Gen 2 or Oakley Meta (camera + audio, P1) vs. **Meta Ray-Ban Display + Neural Band** (adds the HUD, P2). Display is the only path to visual cues.
3. **An Android phone** with Android 10+ for the companion app (iOS 17.2+ also supported later).
4. **Licence call on vision**: stay Apache-2.0 (MediaPipe/LiteRT) or accept AGPL for Ultralytics dog-pose.
5. **Field test**: one real walk with Field mode to calibrate the distance bands and the cue wording with his consultant.
6. **Deploy**: `.github/workflows/pages.yml` currently copies only `app/index.html` and `app/openpaw-ble.js`; `field.html`, `field.js` and `store.js` must be added for Field mode to go live (left for the integrating change, since other app pages are being added in parallel).
