# OpenPaw

**An open protocol for understanding a dog's health, arousal, behavior, and recovery over time.**

OpenPaw is an open-source pretotype for combining wearable signals, owner observations, environmental context, and expert interpretation into one longitudinal timeline.

The first use case is **reactivity**: help owners notice elevated baseline arousal, understand triggers and recovery, and bring better evidence to veterinarians and qualified behavior professionals.

> **Status:** pretotype / expert discovery. OpenPaw does not diagnose disease, infer emotion as ground truth, or replace veterinary or behavior care.

## Thesis

Most existing tools observe only part of the dog:

- wearables measure activity or physiology;
- reactivity apps record owner-reported triggers;
- cameras can observe body language;
- veterinarians see medical context;
- behavior professionals interpret behavior and interventions.

OpenPaw's core primitive is a synchronized event stream connecting:

```
baseline -> context -> signal change -> observable behavior -> intervention -> recovery -> expert annotation
```

The goal is not a universal "stress score." The goal is to learn **this dog's baseline and recovery dynamics** and make the evidence inspectable.

## Pretotype question

> Can a vet or credentialed behavior professional look at one week of an OpenPaw timeline and say: "this gives me information I currently wish owners could bring me"?

If the answer is no, better hardware does not fix the product.

## v0

The first pretotype should demonstrate:

1. a dog profile and personal baseline;
2. a synchronized longitudinal timeline;
3. physiology, behavior, context, trigger, intervention, and recovery events;
4. an **Arousal Envelope**: baseline / elevated / near-threshold, with evidence;
5. owner annotations;
6. separate expert views for veterinary and behavior review;
7. raw-data export and provenance for every derived insight;
8. simulated or imported sensor data before custom collar R&D.

See:

- [Protocol v0](docs/PROTOCOL.md)
- [Pretotype plan](docs/PRETOTYPE.md)
- [Expert interview guide](docs/EXPERT-INTERVIEWS.md)
- [Pretotype architecture](docs/ARCHITECTURE.md)
- [Market snapshot](docs/MARKET.md)
- [Initial event schema](schema/openpaw-event.schema.json)
- [Credits and provenance](CREDITS.md)

## Principles

**Dog-specific, not population magic.** Compare signals primarily against an individual's context-aware baseline.

**Evidence before inference.** Derived states must point back to the measurements and observations that produced them.

**Arousal is not emotion.** Elevated physiological arousal can have many causes. OpenPaw should describe evidence rather than claim to know what a dog feels.

**Recovery matters.** Peak response alone is incomplete. Time and trajectory back toward baseline are first-class signals.

**Experts stay in the loop.** AI should organize evidence and select from expert-approved guidance, not improvise diagnoses or behavior treatment.

**Owner-controlled data.** Exportable raw data, documented schemas, replaceable models, local-first operation where practical, and no mandatory subscription for access to a dog's history.

**Hardware is replaceable.** The protocol should work with commercial exports, DIY/reference hardware, and future sensors.

## Event model

Every observation is timestamped and attributable:

```
Dog
 ├─ Baseline
 ├─ Physiology
 ├─ Behavior
 ├─ Context
 ├─ Trigger
 ├─ Intervention
 ├─ Recovery
 └─ ExpertAnnotation
```

A reaction episode can therefore be reconstructed rather than reduced to one score.

## Later

If expert validation is strong:

- open reference collar: IMU + BLE first, physiology/GNSS/radio modules later;
- adapters for existing wearable data;
- handler-state correlation from phone/watch;
- behaviorist-authored intervention protocols;
- veterinarian/behaviorist collaboration workflow;
- Meta glasses companion for minimal real-time cues;
- privacy-preserving research datasets with explicit consent.

## Safety

OpenPaw is currently a research/prototyping project. Health and behavior outputs should be treated as observations or decision-support signals, not medical diagnoses. Acute health concerns should be evaluated by a veterinarian; behavior plans should be developed with appropriately qualified professionals.

## License

Software and protocol work in this repository are licensed under GPL-3.0. Future reference hardware may use a dedicated open-hardware license.

## Acknowledgments

The "Blueprint" framing is inspired by Bryan Johnson's public quantified-self/longitudinal measurement work. OpenPaw is independent and not affiliated with Bryan Johnson or Blueprint.

OpenPaw also builds on the work of veterinary researchers, behavior professionals, open-hardware communities, and existing pet-wearable teams who established many of the sensing and longitudinal-monitoring primitives this project hopes to connect rather than reinvent.

See [CREDITS.md](CREDITS.md) for provenance.
