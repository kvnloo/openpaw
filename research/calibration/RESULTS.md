# Collar movement calibration — v1

**Use 250, 570 and 585 mg as provisional upper cutoffs** (exclusive)
for still, low and moderate, respectively. Vigorous starts at 585 mg.
These are bands of measured five-second mean VeDBA, **not** recognized
behaviours, individual reference values, or clinical thresholds. The four-band
calibration is weak: just 2 of 988 walk-reference epochs landed in moderate.
Walking and sniffing overlap substantially on mean VeDBA, and the fitted
moderate band spans only 15 mg. The UI retains a calibration caveat.

## Sources and size preflight

| Candidate | License | Published file bytes | Use |
|---|---|---:|---|
| [Vehkaoja et al., Movement Sensor Dataset for Dog Behavior Classification, v4](https://data.mendeley.com/datasets/vxhx934tbn/4) | CC BY 4.0 | 892,854,948 | Collar acceleration and video annotations; 45 dogs, 62 recordings. |
| [Marcato et al., Inertial sensor dataset for Dog Posture Recognition, v1](https://data.mendeley.com/datasets/mpph6bmn7g/1) | CC BY 4.0 | 572,622,506 | Neck acceleration and posture annotations; 42 dogs, external classifier check only. |
| [Karimjee et al., activity data and code](https://datadryad.org/dataset/doi:10.5061/dryad.m0cfxppbs), found via [OpenAlex](https://openalex.org/W4400672757) and [Zenodo](https://zenodo.org/records/11175815) | Dryad data CC0 1.0; Zenodo MATLAB code MIT | 514,497 Dryad; 1,633 Zenodo | Not used; deposit contains aggregate model inputs and code, not the raw labelled triaxial time series needed here. |

Related primary papers: Vehkaoja et al., [data descriptor (10.1016/j.dib.2022.107822)](https://jyx.jyu.fi/bitstreams/f82fe7ff-533f-4e48-a444-f29a636fa607/download);
Kumpulainen et al., [original classification study (10.1016/j.applanim.2021.105393)](https://jyx.jyu.fi/bitstream/handle/123456789/77085/1/1-s2.0-S0168159121001805-main.pdf);
Marcato et al., [canine posture estimation](https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0286311).
No source records or dog IDs are committed.

## Reproduce

From repo root, with Python 3.12 and a C99 compiler:

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -r research/calibration/requirements.txt
.venv/bin/python -I research/calibration/test_golden.py
.venv/bin/python -I research/calibration/evaluate.py DogMoveData_csv_format.zip --external df_raw.csv --output score.json
```

Download only these two files from the linked release pages; use
`--external` only for the optional transfer check. Inputs used (SHA-256):

| File | Bytes | SHA-256 |
|---|---:|---|
| DogMoveData_csv_format.zip | 440,933,845 | `47f9e41428c0591d3c980aff1b59981eac14567a02019cc044f69ef4648a3b46` |
| df_raw.csv | 572,620,563 | `ac04f51f35f5396c5c73a651974bba56070177bfb30a393266f5a02dd41c0c93` |

## Protocol

- Use only the published neck/collar X/Y/Z acceleration in g, in native
  sensor coordinates. Neck columns are selected by CSV header in X/Y/Z
  order. Split each recording at missing acceleration or non-10-ms steps.
  Polyphase FIR with linear edge padding resamples from 100 to 50 Hz; round
  to integer mg and saturate to ±8 g. Keep firmware gravity and burst latch
  state across consecutive 250-sample epochs; skip the first epoch of each
  run for warm-up, and incomplete tails. Attitude remains sensor-frame, not
  a body-frame orientation estimate.
- Use all three primary behaviour annotation columns, not the task cue.
  Require one mapped target to occupy at least 80% of the original 500
  samples. Annotation of a shake for at least 0.5 s overrides the classifier
  label; briefer shake fragments are excluded from classifier scoring.
  This tests shake-containing epochs, not precise shake onset or duration.
- Four-band evaluation needs four reference labels: still = lying on chest,
  sitting or standing; low = sniffing; moderate = walking; vigorous =
  trotting, playing or galloping. The walking/sniffing split is a proxy,
  not established intensity ground truth. Also score the requested three
  groupings by merging low and moderate in references and predictions.
- Five deterministic stratified **dog-grouped** folds (seed 2026), with
  repeat recordings in the same fold. Fit thresholds on each training fold
  by exact dynamic programming over a fixed 5 mg grid (5–2,000 mg) to
  maximize macro-F1. Evaluate on held-out dogs; refit on all primary dogs
  for the shipped cuts. The classifier is a class-balanced depth-5 tree
  (minimum 12 training epochs per leaf) using mean/max VeDBA, active
  fraction, pitch, roll and burst count in their firmware representation.
  No metadata, dog ID, time of day, gyroscope or raw samples enter the tree.
- Report unweighted mean ± population SD across folds, not confidence
  intervals. The pooled matrices are counts of held-out epoch predictions.
  Keep split seed, sources and target rules fixed for comparable
  hill-climbs; if tuning repeatedly on these folds, reserve new dogs for
  confirmation rather than treating the tuned CV score as independent.

## Held-out results

11,186 band epochs and 10,376 classifier epochs. See [score.json](score.json)
for fold sizes, cutoffs and confusion matrices. Rows = reference, columns =
prediction, in the documented class order.

**Bands macro-F1 0.648 ± 0.016** (old 30/150/500 mg cutoffs: 0.422 mean).

| Still | Low | Moderate | Vigorous |
|---:|---:|---:|---:|
| 0.941 ± 0.017 | 0.682 ± 0.041 | 0.004 ± 0.005 | 0.964 ± 0.016 |

```text
5638  306    3     9
 118 1427   19    54
 241  743    2     2
   5   68   42  2509
```

**Grouped bands macro-F1 0.914 ± 0.022** (still, walk/sniff, vigorous):

```text
5638  309     9
 359 2191    56
   5  110  2509
```

**Classifier macro-F1 0.896 ± 0.028.**

| Rest | Walk | Sniff | Play | Shake |
|---:|---:|---:|---:|---:|
| 0.944 ± 0.027 | 0.750 ± 0.076 | 0.971 ± 0.013 | 0.943 ± 0.027 | 0.874 ± 0.041 |

```text
5392  523   28   11    1
  30  939   10    6    0
   3   19 1579   17    0
   5   41   12 1409   61
   0    3    1   17  269
```

A transfer check fit on all primary dogs and predicted all five classes on
the independent Marcato set (2,729 eligible epochs, 21 shake epochs);
rest/walk/shake F1 dropped to **0.752 / 0.569 / 0.609** (macro 0.643 for
those three labels). That dataset has no sniff or play reference class;
predictions of those two classes still count as misses for the reference.
The transfer gap, scripted primary observations and different sensor/mount
from deployed OpenPaw hardware limit generalization. The classifier is
research-only; neither the app nor firmware ships it.
