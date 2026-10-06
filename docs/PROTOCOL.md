# OpenPaw Protocol v0

## Purpose

OpenPaw describes a dog's longitudinal state as observable, timestamped events. It intentionally separates **measurement**, **annotation**, **inference**, and **recommendation** so later models can improve without rewriting history.

## Core objects

### DogProfile
Relatively stable context:

- pseudonymous dog ID;
- age / approximate date of birth;
- breed or mix when known;
- sex / reproductive status when relevant;
- weight history;
- medications and medical conditions only when explicitly entered;
- known trigger classes;
- owner-defined goals;
- linked expert relationships and consent scopes.

### Measurement
Raw or minimally processed sensor input.

Examples:

- heart rate;
- HRV metric + calculation method;
- respiratory rate;
- IMU / movement;
- sleep estimate;
- temperature;
- location;
- audio-derived events.

A measurement MUST record source, units, sampling/window information, and whether it is observed, imported, simulated, or derived.

### Observation
Something a person or model observed.

Examples:

- body stiffening;
- freezing;
- scanning;
- panting;
- lip licking;
- barking;
- lunging;
- orientation toward trigger.

Observations are not emotions. Confidence and observer provenance are required for machine-derived observations.

### Context
What was happening around the dog.

Examples:

- walk / home / clinic;
- location;
- weather;
- time of day;
- sleep debt;
- recent exercise;
- unfamiliar environment;
- trigger class and approximate distance.

### Intervention
An action taken by an owner or professional.

Examples:

- create distance;
- route change;
- stop / rest;
- enrichment;
- protocol step specified by a behavior professional.

OpenPaw itself should not invent treatment protocols.

### Episode
A bounded period joining context, measurements, observations, interventions, and recovery.

Suggested phases:

```
pre_baseline -> rising -> peak -> recovery -> post_baseline
```

### ExpertAnnotation
Interpretation entered by a veterinarian or qualified behavior professional.

The original event stream remains immutable. Corrections or revised interpretations are appended with provenance.

## Derived state: Arousal Envelope

v0 exposes a coarse state rather than a pseudo-precise universal score:

- `baseline`
- `elevated`
- `near_threshold`
- `unknown`

Every state MUST include:

- model/rule version;
- evidence event IDs;
- confidence or uncertainty;
- baseline window used;
- time generated.

It MUST NOT claim an emotion or diagnosis.

## Recovery

Recovery is first-class.

Useful derived measures may include:

- time from peak to personal baseline band;
- area above baseline;
- post-event scanning / locomotion duration;
- repeated trigger load;
- incomplete recovery before the next episode.

These are hypotheses for expert validation, not validated clinical endpoints.

## Provenance

Every datum should answer:

1. Who or what produced this?
2. When?
3. Was it raw, imported, transformed, annotated, or inferred?
4. Which source events produced a derived value?
5. Which code/model/rule version produced it?

## Data ownership

The protocol should make full-fidelity export the default capability.

Minimum export:

- JSON/JSONL event stream;
- media references + consent metadata;
- derived state with provenance;
- expert annotations;
- schema/version information.

No OpenPaw implementation should require a subscription merely to retrieve the owner's historical data.

## Consent / sharing

Access should be scoped by relationship and purpose:

- owner;
- veterinarian;
- behavior professional;
- research export.

Sharing should be revocable. Research use should require explicit opt-in and support de-identification.

## Compatibility

The protocol is hardware-agnostic. Producers may include:

- manual owner input;
- commercial wearable exports/APIs;
- phone/watch sensors;
- open reference collar;
- camera/glasses observations;
- simulated data used by the pretotype.

## Versioning

Events carry a `schema_version`. Derived outputs additionally carry an `algorithm_version`.

Backward-compatible additions increment the minor protocol version. Breaking semantic changes require a major version.

## Non-goals for v0

- diagnosing disease;
- inferring a dog's emotion as fact;
- universal physiological thresholds across dogs;
- automated treatment plans;
- custom production hardware;
- population-level clinical claims.
