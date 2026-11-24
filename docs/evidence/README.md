# OpenPaw evidence

This is a rapid, single-reviewer evidence map, not a systematic review, clinical
guideline, or dataset of individual dogs. The goal is to identify what OpenPaw
can measure, what those measurements do **not** establish, and where it should
show uncertainty rather than make a prediction.

## Start here

- [Leash reactivity and recovery](topics/leash-reactivity.md)
- [Fear-related behavior and aggression](topics/fear-and-aggression.md)
- [Behavior modification and training welfare](topics/training-and-welfare.md)
- [Observable behavior and ethograms](topics/observable-signals.md)
- [Pain, mobility and behavior](topics/pain-and-behavior.md)
- [Sleep, activity and enrichment](topics/sleep-activity-and-enrichment.md)
- [Separation-related behavior](topics/separation.md)
- [Noise responses and medication evidence](topics/noise-and-medication-evidence.md)
- [Wearables, heart rate and HRV](topics/wearables-and-cardiac-signals.md)
- [Owner reports, scales and aging](topics/owner-scales-and-aging.md)

The quantitative tables are **study-specific anchors**, not recommended targets,
product thresholds, or individual reference intervals. The app should distinguish
direct measurement, caregiver observation, and interpretation. We follow the
[AVSAB 2021 humane training position](cards/avsab2021-position-statement-on-humane-dog-training.md);
aversive methods appear only in evidence about outcomes or risks. Medication
cards describe study evidence, not dosing, treatment recommendations, or
comparative prescribing guidance.

## Methods and coverage

Search snapshot: 2026-11-24. The [query matrix](queries.md) covers 15 clusters
across Europe PMC (core records) and OpenAlex (work records with available
abstracts). This is a bounded first-page search of each cluster, with targeted
source follow-up for gaps and article versions. Database hits were consolidated by
case-insensitive DOI, or normalized title for missing DOIs; alternate versions
identified during extraction are marked in the log. Studies from the same
cohort can still overlap and should not be counted as independent replications.

The [screening log](screening.csv) contains 791 records (685 with a database
abstract) and 176 selections. The first pass used title/abstract triage and
scope rules; a single reviewer extracted selected records for relevance to
behavior observations, outcomes, or sensor/questionnaire validity. An
`include=n` with “not selected for first-pass extraction” means deferred, **not**
irrelevant, and does not imply that each deferred record received a manual
eligibility determination. Common false positives included assay reactivity,
medical procedures, and human outcomes. Rankings, abstract coverage, and the
single-reviewer approach limit recall and favor some recent or easy-to-access
studies. Cards generally reflect screened abstracts; where a full article was
consulted its details are used selectively. This is not a search for every
publication and cannot rule out evidence outside the sample.

## Card fields

Every card has a fixed, flat YAML mapping: quote strings using JSON syntax and
use JSON arrays for `tags` and `openpaw_use`. Use `null` for a DOI that is
unavailable and for a dog count that cannot be verified or is not a single
denominator; use zero only if the work directly enrolled no dogs. In multi-sample
studies, describe the denominators in the population or findings. `open_access:
"y"` is an index or source indicator for openly available full text, not a
redistribution licence; `"n"` includes OA not confirmed. The source URL is
separate from the DOI so a source may point to an indexed abstract, a publisher,
or a public copy. Findings are paraphrases, not reproduced abstracts.

### Evidence levels (A–D)

| Level | How to read it |
| --- | --- |
| A | Directly applicable replicated controlled evidence or a high-quality synthesis of consistent, comparable evidence; none assigned in this pass. |
| B | Relatively strong evidence for the specific measured comparison, such as a blinded trial or a multi-setting comparison with convergent measures and important caveats. |
| C | Informative but limited evidence: observational comparisons, context-specific experiments and validations, or reviews with heterogeneous underlying studies. |
| D | Hypothesis-generating or practice context: case series, exploratory pilots, unreviewed preprints, protocols, commentary, and consensus statements. |

Design is separate from level: a small or narrowly measured RCT may be C, and
expert consensus can establish a project policy without establishing an effect
size. These are editorial grades for fitness to the stated finding, not formal
risk-of-bias assessments or levels for clinical decisions.

## Maintain

Link topic claims directly to cards (`../cards/<card-name>.md`). Add one card per
work, check for a version of record before adding a preprint, and log a reason for
the screening decision. State the population, instrument, units and comparison
for each quantitative anchor. Run:

```sh
node docs/evidence/validate.mjs
node --test app/test/*.test.mjs
```
