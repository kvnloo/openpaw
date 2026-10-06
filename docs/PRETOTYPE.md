# Pretotype plan

## Goal

Validate whether a synchronized dog timeline is useful enough to change how owners, veterinarians, and behavior professionals reason about reactivity and health.

Do **not** validate custom collar hardware yet.

## Core hypothesis

A professional reviewing one week of synchronized physiology + behavior + context + intervention + recovery data can extract useful information that is difficult to get from owner recall alone.

## Prototype story

Use one fictional or consented dog and tell one coherent week-long story.

The interface should make these moments obvious:

1. normal baseline;
2. poor sleep / incomplete recovery;
3. elevated pre-walk state;
4. trigger appears;
5. observable body-language change;
6. reaction / peak;
7. intervention;
8. recovery trajectory;
9. owner annotation;
10. behaviorist and veterinary interpretation.

## Required screens

### 1. Today

- current baseline state;
- recent recovery quality;
- notable deviations;
- evidence behind every summary;
- no diagnostic language.

### 2. Timeline

A zoomable event timeline with aligned tracks:

- physiology;
- movement / sleep;
- observed behavior;
- context and triggers;
- interventions;
- annotations.

### 3. Episode

Deep view of one trigger episode:

```
before -> rising -> peak -> intervention -> recovery
```

Show the raw evidence and the derived Arousal Envelope together.

### 4. Behavior professional view

Prioritize:

- trigger class;
- approximate distance;
- precursor behaviors;
- intensity;
- intervention;
- recovery;
- repeated-trigger load;
- owner notes / video.

### 5. Veterinary view

Prioritize:

- longitudinal physiology;
- resting trends;
- sleep/activity changes;
- medication / medical-event context;
- anomalies and provenance;
- raw export.

## Data

Start with:

1. simulated data shaped like plausible wearable streams;
2. manually entered behavior/context annotations;
3. imported real wearable exports only when convenient.

All simulated events MUST be labeled `simulated`.

## Validation sessions

Target an initial mix of:

- 3-5 veterinarians;
- 3-5 credentialed behavior professionals / experienced trainers;
- 3-5 owners of reactive dogs.

The pretotype succeeds if experts independently identify decisions or questions the timeline improves.

## Interview outcomes to capture

For every surfaced insight:

- useful / not useful;
- trustworthy / not trustworthy;
- why;
- missing context;
- acceptable uncertainty;
- action it would change;
- minimum sensor fidelity required;
- frequency with which it matters.

## Kill / pivot criteria

Pause custom hardware work if professionals consistently say:

- the data would not alter questions, decisions, or monitoring;
- owner annotations dominate the value and physiology adds little;
- signal uncertainty makes the outputs misleading;
- the workflow burden outweighs the information gain.

If owner-entered timelines are useful but biometrics are not, pivot toward the collaboration/protocol layer.

## Build order

### P0 — validation surface
- event schema;
- synthetic one-week dataset;
- timeline;
- episode view;
- expert annotation;
- export.

### P1 — realism
- wearable import adapter;
- richer baseline/recovery calculations;
- media references;
- owner capture flow.

### P2 — sensing
- evaluate accessible physiological sensors;
- open reference collar proof of concept;
- compare reference hardware against known devices.

### P3 — ambient assistance
- phone/watch context;
- camera/body-language observations;
- Meta glasses companion;
- expert-authored real-time cues.

## Pretotype success statement

> A professional can inspect an episode, trace every inference to evidence, add an interpretation, and explain at least one useful decision or follow-up question that would have been harder from owner recall alone.
