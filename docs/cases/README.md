# OpenPaw published case corpus

This is a convenience sample, not a systematic review or a treatment guide. One row represents one dog within a publication, not one encounter or event. We do not link dogs across sources. Clinical case publications, retrospective owner reports, and prospective follow-up are distinct evidence types; don't pool their outcomes. See [analysis.md](analysis.md) and [sources.csv](sources.csv).

## Provenance and extraction

- **Riemer (2019), PLOS ONE.** Data are adapted from [Riemer’s Figshare v1 workbook](https://doi.org/10.6084/m9.figshare.9657395.v1), CC BY 4.0. Included all 639 rows flagged by the paper's affected-dog rule (owner rating 3–5). `Data!A…:BT…` is the physical spreadsheet range; row 2 has headers. Progression is the workbook's ordinal response (1–2 lower reported severity, 3 no change, 4–5 higher). Recovery is a reported category, not a measured duration. Product flags are reported exposure only; `Drugs` is a prescription flag, not a medication class. Training includes preventive and post-onset training. No free-text product names, owner details, raw IDs, or breed free text were imported.
- **Monteny and Moons (2020), Animals.** Five dogs transcribed from Tables 1–2 and individual narrative. Follow-up is time in the behaviour modification program. An empty medication-class list here refers to the exclusion of psychotropics during the program, not lifetime medication history.
- **Aggression case (2026).** One clinical narrative, §§2–3. The GI condition was documented, but its contribution to the presenting behaviour was suggested, not established. Adverse events refer only to the reported follow-up, not all possible reactions.
- **Bohland et al. (2023), PLOS ONE.** Adapted from [S4 CSV](https://doi.org/10.1371/journal.pone.0289356.s004), CC BY 4.0. Included dogs with a recorded first-wave loud-noise item above zero. The first wave is nominally day 7 in the paper, though the export labels it “10 days”; elapsed paired follow-up is approximated from nominal day 7 to day 180. Record numbers are one-based logical CSV records including the header (not physical lines). Response change uses the same item, not a diagnostic cut-off or a full subscale. The first-wave prescription flag is restricted to behaviour-modifying medication and does not establish exposure through follow-up. No owner/dog identifiers, free text, dates, or unrelated fields are exported. S5 demographics were not joined; neuter status is reported by the paper for the full sample.

## Mapping to OpenPaw

| Corpus concept | Episode-model interpretation |
|---|---|
| `case_id`, `signalment` | Publication-local dog key and profile buckets, not a real dog identifier |
| `source_id`, `source_location` | Import provenance; keep owner report distinct from clinician interpretation |
| `triggers`, `context`, `threshold` | Trigger/context notes and measured or estimated exposure if reported |
| `precursor_signals`, `recovery_time`, `frequency_baseline` | Observable actions and time/count summaries; not an inferred emotional state |
| `medical` | Reported health history and attributed expert annotations, not inferred diagnoses |
| `interventions`, `outcome`, `adverse_events` | Reported intervention and subsequent observations, not attribution |

Rows are not [event exports](../../schema/openpaw-event.schema.json): no synthetic timestamps or episode IDs were assigned. `null` means no usable value in this extraction; an empty list means none reported for the relevant item/window. Breed-group labels are harmonized only coarsely and are not a breed registry classification. Clinical age and weight are bucketed using the recorded years/kg; survey age bands use the workbook's age.

## Reproduce

From this directory, run:

```sh
# Python 3 and xlrd 2.0.1 are needed only to rebuild cases.jsonl.
curl -fL 'https://s3-eu-west-1.amazonaws.com/pfigshare-u-files/17317577/Riemer_2019_dogs_fireworks_data.xls' -o /tmp/fireworks.xls
curl -fL 'https://journals.plos.org/plosone/article/file?type=supplementary&id=10.1371/journal.pone.0289356.s004' -o /tmp/openpaw-s4.csv
python3 -I import_cases.py /tmp/fireworks.xls /tmp/openpaw-s4.csv
python3 -I analyze.py > analysis.md
npm ci --ignore-scripts --no-audit --no-fund
node --test
```

The importer checks the input hashes. Do not commit the source files; the repository contains only selected normalized fields and paraphrased clinical summaries.
