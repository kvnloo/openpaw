# Market snapshot

_Last updated: 2026-10-06._

OpenPaw should not compete by merely adding another health dashboard to a collar. Existing products already validate continuous pet monitoring. The clearer gap is the **open, owner-controlled layer joining physiology + context + observable behavior + intervention + recovery + expert interpretation**.

## Current landscape

| Product / project | Existing strengths | OpenPaw opportunity |
|---|---|---|
| PetPace | Continuous pulse, HRV, temperature, respiration; veterinarian-facing dashboard | Reactivity episodes, intervention/recovery model, open event layer |
| Invoxia Biotracker | Heart rate, respiratory rate, HRV, sleep/activity, personalized trends, GPS, veterinary sharing | Open/raw protocol, behavior-professional workflow, multimodal episode reconstruction |
| Tractive DOG 6 | Resting HR/RR, sleep/activity, bark/scratch/separation-anxiety monitoring, GPS | Evidence-linked arousal/recovery rather than separate health/behavior counters |
| OpenDogTracker | OSS ESP32-C3 + LoRa + GPS tracking hardware | Possible future hardware primitives without rebuilding tracking from scratch |
| Meta Wearables Device Access Toolkit | Camera, microphone/audio, motion/IMU and compatible display surfaces from a mobile app | Later hands-free body-language/context capture and expert-authored real-time cues |

## Strategic conclusion

### Do not lead with
- generic GPS;
- activity rings;
- a universal stress score;
- a closed AI health summary;
- custom hardware before workflow validation.

### Lead with
```
personal baseline
    + physiology
    + observable body language
    + environmental context
    + trigger / distance
    + intervention
    + recovery trajectory
    + expert annotation
```

The pretotype's job is to discover whether that joined timeline improves real expert reasoning.

## Competitive principle

OpenPaw should treat commercial wearables as **possible data producers**, not enemies.

If an owner already has a useful sensor, OpenPaw should ingest its data when permitted. The protocol, provenance, longitudinal model, collaboration workflow, and owner-controlled history are the product boundary.

## Later glasses surface

Meta's Wearables Device Access Toolkit 1.0 began rolling out September 30, 2026 and supports extending iOS/Android apps to Meta AI glasses. Current documented capabilities include camera, microphone/audio, motion/IMU, and display capabilities on compatible devices, plus simulated development devices.

That makes a later OpenPaw companion technically plausible without making glasses part of the v0 critical path.

## Sources

- PetPace veterinarian sharing: https://petpace.com/use-cases/share-with-your-vet/
- Invoxia Biotracker: https://www.invoxia.com/en-US/petcare/minitailz-dog-tracker
- Invoxia 2026 edition: https://www.invoxia.com/blog/petcare/new-biotracker-2026-edition/
- Tractive feature overview: https://help.tractive.com/hc/en-us/articles/360001234789-What-features-does-Tractive-offer
- Tractive DOG tracker: https://tractive.com/en/pd/gps-tracker-dog
- OpenDogTracker: https://github.com/LeylinFeyler/OpenDogTracker
- Meta Wearables Device Access Toolkit: https://developers.meta.com/wearables/device-access-toolkit/
- Meta Wearables FAQ: https://developers.meta.com/wearables/faq/

Vendor capability statements above are based on vendor documentation and should be independently validated before making clinical, purchasing, or compatibility claims.
