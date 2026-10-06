# Pretotype architecture

OpenPaw v0 should stay deliberately boring.

```
synthetic/imported events
        |
        v
 event store / JSONL
        |
        +--> baseline + recovery transforms
        |
        +--> Arousal Envelope (explainable v0 rules)
        |
        v
      API
        |
        +--> owner view
        +--> behavior-professional view
        +--> veterinary view
```

## Separation of concerns

### Source layer
Accept manual, simulated, imported, and eventually live sensor events. Never erase source provenance.

### Event layer
Canonical OpenPaw events. Append corrections rather than mutating historical meaning silently.

### Derived layer
Baseline, recovery, and Arousal Envelope computations. Derived outputs reference their evidence IDs and algorithm version.

### Presentation layer
Different views of the same event graph. Do not create separate incompatible owner/vet/behavior data models.

## v0 implementation bias

Optimize for the fastest expert-feedback loop:

- local fixture data;
- one dog;
- one week;
- one excellent reaction episode;
- inspectable calculations;
- no auth;
- no cloud dependency;
- no custom hardware;
- no real-time inference.

## First derivations

Start deterministic before ML:

1. rolling context-aware baseline bands;
2. deviation from baseline;
3. trigger episode segmentation;
4. peak;
5. recovery duration;
6. incomplete-recovery / trigger-stacking marker;
7. evidence-backed categorical Arousal Envelope.

The point is to validate the abstraction and UX before optimizing prediction.

## Future boundaries

Adapters, models, hardware, and glasses should all sit behind the protocol. A new sensor or model must not require rewriting historical events or expert annotations.
