# Contributing

OpenPaw is in pretotype / expert-discovery mode. Small experiments that reduce uncertainty are preferred over broad implementations.

## Before coding

Check whether the change advances one of these questions:

1. Does the joined timeline help a veterinarian or behavior professional?
2. Which measurements are actually needed?
3. Can every inference be traced to evidence?
4. Does the design preserve owner control of the underlying data?

If not, open a discussion/issue before adding infrastructure.

## Safety boundary

Do not introduce outputs that:

- diagnose a medical condition;
- claim a dog's emotion as fact;
- prescribe veterinary treatment;
- invent behavior interventions outside an expert-authored protocol;
- hide uncertainty or source provenance.

## Provenance and credit

Always preserve the source of ideas and evidence.

When a veterinarian, behavior professional, researcher, contributor, or existing project materially influences a change:

- credit them by name when permission allows;
- link the originating issue, conversation, paper, commit, or project;
- distinguish the original idea from the implementation;
- preserve credit as work moves between issues, docs, and code.

See `CREDITS.md`.

## Pretotype bias

Prefer:

- deterministic/explainable logic before ML;
- synthetic fixtures before hardware dependencies;
- one coherent dog story before many edge cases;
- local-first components before cloud infrastructure;
- replaceable adapters over vendor coupling;
- measured expert feedback over feature count.

## Pull requests

Keep changes narrow. Include:

- hypothesis or user need;
- what changed;
- evidence / source provenance;
- how it was tested;
- any safety or interpretation risk;
- what uncertainty remains.
