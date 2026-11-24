# Published dog behaviour records

**722 dogs:** 639 in an owner survey, 77 in a prospective adoption cohort and 6 in clinical case publications. This meets the numerical target for published dog-level records, not for clinical cases or prospective intervention outcomes.

| Source | Design | Dogs | Reported outcome |
|---|---|---:|---:|
| [riemer2019](https://doi.org/10.1371/journal.pone.0218150) | owner_survey | 639 | 566 |
| [monteny2020](https://doi.org/10.3390/ani10010161) | case_series | 5 | 5 |
| [aggression2026](https://doi.org/10.1155/crve/9804544) | case_report | 1 | 1 |
| [bohland2023](https://doi.org/10.1371/journal.pone.0289356) | prospective_cohort | 77 | 60 |

### Signalment

| Field | Observed counts (including missing) |
|---|---|
| breed_group | mixed breed: 302; herding: 147; missing: 78; retriever: 34; companion: 33; terrier: 32; spitz: 27; molossian: 15; sighthound: 13; hound: 12; pointer: 9; flushing: 8; other: 6; pinscher: 6 |
| age_band | 2_to_under_7y: 306; 7y_and_over: 247; missing: 142; 1_to_under_2y: 25; under_1y: 2 |
| sex | male: 326; female: 319; missing: 77 |
| neutered | True: 569; False: 149; missing: 4 |
| weight_band | missing: 721; 10_to_under_25kg: 1 |

## Medical contributors

- Clinical reports (6 dogs): 0 explicitly identified contributors; 1 suspected; 5 none reported; 0 unknown.
- Survey: 226/639 owners reported a general health problem. No dog-level contributor assessment was available; this is not a rate of medical contributors.
- None reported is not ruled out. The clinical sources are selected reports, including a series that selected dogs described as healthy; these counts cannot estimate a prevalence.
- As context only, [Lopes Fagundes et al.](https://doi.org/10.3389/fvets.2018.00017) deliberately sampled 10 noise-sensitivity dogs with a pain focus and 10 without an identified pain focus. Results are mostly aggregate, so those dogs are not counted here and the 10/20 split is not a prevalence estimate.

## Intervention mixes and reported outcomes

### Firework survey

Groups are based on any listed management measure, any targeted training (preventive or after onset), and reported prescription use. Different questions refer to different time windows. A ‘no’ means not reported for that survey item, not verified non-use. Progression is a retrospective owner rating, not measured change from a baseline.

| Management / training / prescription | Dogs | improved | unchanged | worsened | mixed | missing |
|---|---:|---:|---:|---:|---:|---:|
| no / no / no | 14 | 4 | 5 | 1 | 0 | 4 |
| no / yes / no | 6 | 2 | 0 | 1 | 0 | 3 |
| yes / no / no | 258 | 54 | 101 | 69 | 0 | 34 |
| yes / no / yes | 41 | 6 | 18 | 16 | 0 | 1 |
| yes / unknown / no | 1 | 0 | 1 | 0 | 0 | 0 |
| yes / unknown / yes | 1 | 0 | 0 | 1 | 0 | 0 |
| yes / yes / no | 233 | 109 | 52 | 47 | 0 | 25 |
| yes / yes / yes | 85 | 34 | 18 | 27 | 0 | 6 |

### Prospective adoption cohort

A positive first-wave loud-noise item defined inclusion; the result is the six-month minus first-wave rating (negative means a lower reported response). Missing six-month assessments remain missing. First-wave prescription reporting is an exposure snapshot, not a treatment assignment; management and training mixes cannot be established from this extraction. Selecting positive baseline scores also leaves room for regression to the mean.

| First-wave prescription reported | Dogs | improved | unchanged | worsened | mixed | missing |
|---|---:|---:|---:|---:|---:|---:|
| no | 64 | 22 | 18 | 12 | 0 | 12 |
| yes | 13 | 5 | 2 | 1 | 0 | 5 |

### Clinical publications

The series excluded psychotropic medication; interventions reflect the published plan, not verified adherence. These outcomes are not pooled with survey or cohort outcomes.

| Management / behaviour modification / medication class | Dogs | improved | unchanged | worsened | mixed | missing |
|---|---:|---:|---:|---:|---:|---:|
| yes / yes / no | 5 | 5 | 0 | 0 | 0 | 0 |
| yes / yes / yes | 1 | 1 | 0 | 0 | 0 | 0 |

Volunteer selection, recall and reporting biases, confounding by baseline severity, and non-concurrent intervention/outcome windows limit interpretation of the survey. The tiny clinical sample and publication bias favour notable or positive outcomes. Outcomes and follow-up are heterogeneous; no causal or comparative treatment claims are supported.

## Missing data

Missing means the extraction has no usable value. Explicit negatives and empty arrays are not missing. This is a corpus audit, not a systematic estimate for all published literature. The clinical column shows how the large survey influences the pooled rank.

| Field | All missing | Survey missing | Cohort missing | Clinical missing |
|---|---:|---:|---:|---:|
| `frequency_baseline` | 722/722 (100.0%) | 639/639 (100.0%) | 77/77 (100.0%) | 6/6 (100.0%) |
| `threshold` | 722/722 (100.0%) | 639/639 (100.0%) | 77/77 (100.0%) | 6/6 (100.0%) |
| `adverse_events` | 721/722 (99.9%) | 639/639 (100.0%) | 77/77 (100.0%) | 5/6 (83.3%) |
| `precursor_signals` | 721/722 (99.9%) | 639/639 (100.0%) | 77/77 (100.0%) | 5/6 (83.3%) |
| `signalment.weight_band` | 721/722 (99.9%) | 639/639 (100.0%) | 77/77 (100.0%) | 5/6 (83.3%) |
| `interventions.medication_classes` | 716/722 (99.2%) | 639/639 (100.0%) | 77/77 (100.0%) | 0/6 (0.0%) |
| `interventions.owner_education` | 716/722 (99.2%) | 639/639 (100.0%) | 77/77 (100.0%) | 0/6 (0.0%) |
| `medical.contributor_status` | 716/722 (99.2%) | 639/639 (100.0%) | 77/77 (100.0%) | 0/6 (0.0%) |
| `medical.findings` | 716/722 (99.2%) | 639/639 (100.0%) | 77/77 (100.0%) | 0/6 (0.0%) |
| `follow_up_months` | 656/722 (90.9%) | 639/639 (100.0%) | 17/77 (22.1%) | 0/6 (0.0%) |
| `context` | 639/722 (88.5%) | 639/639 (100.0%) | 0/77 (0.0%) | 0/6 (0.0%) |
| `recovery_time` | 152/722 (21.1%) | 69/639 (10.8%) | 77/77 (100.0%) | 6/6 (100.0%) |
| `signalment.age_band` | 142/722 (19.7%) | 65/639 (10.2%) | 77/77 (100.0%) | 0/6 (0.0%) |
| `outcome` | 90/722 (12.5%) | 73/639 (11.4%) | 17/77 (22.1%) | 0/6 (0.0%) |
| `medical.owner_health_problem` | 83/722 (11.5%) | 0/639 (0.0%) | 77/77 (100.0%) | 6/6 (100.0%) |
| `interventions.behavior_modification` | 79/722 (10.9%) | 2/639 (0.3%) | 77/77 (100.0%) | 0/6 (0.0%) |
| `signalment.breed_group` | 78/722 (10.8%) | 1/639 (0.2%) | 77/77 (100.0%) | 0/6 (0.0%) |
| `interventions.management` | 77/722 (10.7%) | 0/639 (0.0%) | 77/77 (100.0%) | 0/6 (0.0%) |
| `signalment.sex` | 77/722 (10.7%) | 0/639 (0.0%) | 77/77 (100.0%) | 0/6 (0.0%) |
| `interventions.prescription_reported` | 5/722 (0.7%) | 0/639 (0.0%) | 0/77 (0.0%) | 5/6 (83.3%) |
| `signalment.neutered` | 4/722 (0.6%) | 4/639 (0.6%) | 0/77 (0.0%) | 0/6 (0.0%) |
| `presenting_problems` | 0/722 (0.0%) | 0/639 (0.0%) | 0/77 (0.0%) | 0/6 (0.0%) |
| `triggers` | 0/722 (0.0%) | 0/639 (0.0%) | 0/77 (0.0%) | 0/6 (0.0%) |

## Implications for OpenPaw

Ranked by missingness in this corpus (ties alphabetical). Keep owner observations and expert annotations distinct. These are measurement features, not treatment advice. Training references follow the [AVSAB 2021 humane-training position](https://avsab.org/wp-content/uploads/2021/08/AVSAB-Humane-Dog-Training-Position-Statement-2021.pdf).

1. **frequency_baseline** (722/722 missing): Pair episode counts with time watched or opportunities for exposure, including zero-event windows.
2. **threshold** (722/722 missing): Record trigger distance or intensity, units, and whether estimated or measured; allow not applicable.
3. **adverse_events** (721/722 missing): Track possible adverse events and whether anyone checked; do not infer causation.
4. **precursor_signals** (721/722 missing): Log timestamped visible actions and their order, separately from interpretations.
5. **interventions.medication_classes** (716/722 missing): Optionally log clinician-reported class and change dates; never suggest doses.
6. **interventions.owner_education** (716/722 missing): Record what was explained, when, and by whom, separately from adherence.
7. **medical.contributor_status** (716/722 missing): Separate owner history from clinician findings and explicitly mark uncertainty.
8. **follow_up_months** (656/722 missing): Schedule check-ins with elapsed time and reuse the baseline measure.
9. **context** (639/722 missing): Record setting, activity, and exposure circumstances separately from trigger type.
10. **recovery_time** (152/722 missing): Time from trigger end to a defined observed baseline; allow approximate ranges and not-yet-recovered.
11. **outcome** (90/722 missing): Store the measure, reporter, observation window, and result rather than a global score.
