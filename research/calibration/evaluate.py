# SPDX-License-Identifier: GPL-3.0-only
"""Dog-held-out evaluation for OpenPaw's six quantized movement features."""
import argparse
import json
from pathlib import Path
import sys
from zipfile import ZipFile

import numpy as np
import pandas as pd
from scipy.signal import resample_poly
from sklearn.metrics import confusion_matrix, f1_score
from sklearn.model_selection import StratifiedGroupKFold
from sklearn.tree import DecisionTreeClassifier

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.dont_write_bytecode = True
from core import EPOCH, FIELDS, extract

BANDS = ("still", "low", "moderate", "vigorous")
CLASSES = ("rest", "walk", "sniff", "play", "shake")
BAND_MAP = {"Lying chest": 0, "Sitting": 0, "Standing": 0, "Sniffing": 1,
            "Walking": 2, "Trotting": 3, "Playing": 3, "Galloping": 3}
CLF_MAP = {"Lying chest": 0, "Sitting": 0, "Standing": 0, "Walking": 1,
           "Sniffing": 2, "Playing": 3, "Shaking": 4}
AXES = ["ANeck_x", "ANeck_y", "ANeck_z"]
ANNOT = ["Behavior_1", "Behavior_2", "Behavior_3"]
WINDOW_RAW = EPOCH * 2
VERSION = "openpaw-calibration/1"


def label_epochs(annotations, mapping, shake=False):
    n = len(annotations) // WINDOW_RAW
    # Multiple concurrent mapped labels are ambiguous. Unmapped labels
    # (e.g. panting) do not override an annotated locomotion/posture.
    counts = np.zeros((n, len(set(mapping.values()))), dtype=int)
    votes = np.stack([np.any(annotations == name, axis=1) for name in mapping], axis=1)
    for label in set(mapping.values()):
        match = votes[:, [v == label for v in mapping.values()]].any(axis=1)
        counts[:, label] = match[:n*WINDOW_RAW].reshape(n, WINDOW_RAW).sum(axis=1)
    candidates = counts >= int(.8 * WINDOW_RAW)
    if shake:
        # Shake is an event, not a sustained state; >=0.5 s annotated in
        # one epoch. Exclude shorter shake fragments from the other classes.
        candidates[counts[:, 4] > 0] = False
        candidates[:, 4] = counts[:, 4] >= 50
    return np.where(candidates.sum(axis=1) == 1, candidates.argmax(axis=1), -1)


def features_for_run(g_values):
    # FIR anti-aliasing at the 50 Hz grid; edge pad with the local line.
    g50 = resample_poly(g_values, 1, 2, axis=0, padtype="line")
    # Approximate the board's ±8 g measurement range in signed integer mg.
    return extract(np.clip(np.rint(g50 * 1000), -8000, 8000).astype(np.int16))


def windows(block, axes, clock, labels, source, subject):
    xyz = block[axes].to_numpy(dtype=float)
    valid = np.isfinite(xyz).all(axis=1)
    continuous = np.isclose(np.diff(clock), .01, atol=1e-5, rtol=0)
    edges = np.flatnonzero(~continuous | ~valid[1:] | ~valid[:-1]) + 1
    for ids in np.split(np.arange(len(block)), edges):
        if len(ids) < WINDOW_RAW or not valid[ids[0]]:
            continue
        f = features_for_run(xyz[ids])[:len(ids)//WINDOW_RAW]
        # Ignore startup transient (but warm up using the actual data).
        for feat, (band, cls) in zip(f[1:], zip(*(v[1:] for v in labels(ids))), strict=True):
            if band >= 0 or cls >= 0:
                yield source, subject, band, cls, *map(int, feat)


def primary(path):
    with ZipFile(path) as z, z.open("DogMoveData.csv") as handle:
        data = pd.read_csv(handle, usecols=["DogID", "TestNum", "t_sec", *AXES, *ANNOT],
                           dtype={k: "category" for k in ANNOT})
    print(f"primary: {len(data)} samples, {data.DogID.nunique()} dogs, "
          f"{data.groupby(['DogID', 'TestNum']).ngroups} recordings", flush=True)
    for (dog, _), block in data.groupby(["DogID", "TestNum"], sort=True):
        annotations = block[ANNOT].to_numpy()
        yield from windows(block, AXES, block.t_sec.to_numpy(),
                           lambda ids: (label_epochs(annotations[ids], BAND_MAP),
                                        label_epochs(annotations[ids], CLF_MAP, shake=True)),
                           "vehkaoja", dog)


def secondary(path):
    axes = ["Neck.Acc.X", "Neck.Acc.Y", "Neck.Acc.Z"]
    data = pd.read_csv(path, usecols=["Subject", "Timestamp", "Position", *axes])
    mapping = {"standing": 0, "sitting": 0, "lying down": 0, "walking": 1}
    print(f"external: {len(data)} samples, {data.Subject.nunique()} dogs, "
          f"labels {sorted(data.Position.unique())}", flush=True)
    # Map contiguous label runs without joining annotation gaps.
    for dog, block in data.groupby("Subject", sort=True):
        stamp = pd.to_datetime(block.Timestamp, format="ISO8601")
        clock = (stamp - stamp.iloc[0]).dt.total_seconds().to_numpy()
        ann = block.Position.to_numpy()[:, None]

        def labels(ids):
            n = len(ids) // WINDOW_RAW
            raw = label_epochs(ann[ids], mapping)
            shakes = (ann[ids[:n*WINDOW_RAW], 0] == "body shake").reshape(n, WINDOW_RAW).sum(axis=1)
            raw[shakes > 0] = -1
            raw[shakes >= 50] = 4
            return np.full(n, -1), raw

        yield from windows(block, axes, clock, labels, "marcato", dog)


def fit_bands(x, y):
    # Exact maximum macro-F1 over a fixed integer grid. Each band's F1
    # depends only on its two endpoints, so dynamic programming suffices.
    cuts = np.r_[0, np.arange(5, 2001, 5), 65536]
    prefix = np.array([[np.count_nonzero((x < t) & (y == k))
                        for t in cuts] for k in range(4)])
    total = prefix.sum(axis=0)
    dp = np.full(len(cuts), -np.inf)
    dp[0] = 0.
    paths = []
    for k in range(4):
        score = np.full_like(dp, -np.inf)
        prev = np.zeros(len(cuts), dtype=int)
        for end in range(1, len(cuts)):
            denom = total[end] - total[:end] + prefix[k, -1]
            tp = prefix[k, end] - prefix[k, :end]
            f1 = np.divide(2*tp, denom, out=np.zeros(end), where=denom != 0)
            prev[end] = np.argmax(dp[:end] + f1)
            score[end] = dp[prev[end]] + f1[prev[end]]
        paths.append(prev)
        dp = score
    end = len(cuts) - 1
    thresholds = []
    for prev in paths[:0:-1]:
        end = prev[end]
        thresholds.append(int(cuts[end]))
    return thresholds[::-1]


def folds_for(data, label):
    groups = data.subject
    splitter = StratifiedGroupKFold(n_splits=5, shuffle=True, random_state=2026)
    # The same fold assignment is shared by both tasks.
    result = list(splitter.split(data, label, groups))
    for tr, te in result:
        assert set(groups.iloc[tr]).isdisjoint(groups.iloc[te])
    return result


def classifier():
    return DecisionTreeClassifier(max_depth=5, min_samples_leaf=12,
                                  class_weight="balanced", random_state=2026)


def evaluate(data):
    primary_data = data.loc[data.source == "vehkaoja"].reset_index(drop=True)
    external = data.loc[data.source == "marcato"]
    features = list(FIELDS[:-1])
    splits = folds_for(primary_data, primary_data.cls)
    result = {"version": VERSION, "band_labels": BANDS, "classifier_labels": CLASSES, "folds": []}
    for train, test in splits:
        fold = {"dogs_train": int(primary_data.subject.iloc[train].nunique()),
                "dogs_test": int(primary_data.subject.iloc[test].nunique())}
        for task, names in [("band", BANDS), ("cls", CLASSES)]:
            tr, te = (primary_data.iloc[idx].query(f"{task} >= 0") for idx in (train, test))
            y = te[task]
            if task == "band":
                cuts = fit_bands(tr.vedba_mean_mg.to_numpy(), tr.band.to_numpy())
                fold["cuts_mg"] = cuts
                pred = np.searchsorted(cuts, te.vedba_mean_mg, side="right")
                fold["placeholder_f1"] = f1_score(y, np.searchsorted([30, 150, 500],
                    te.vedba_mean_mg, side="right"), labels=range(4), average="macro", zero_division=0)
            else:
                pred = classifier().fit(tr[features], tr.cls).predict(te[features])
            if task == "band":
                collapse = np.array([0, 1, 1, 2])
                fold["grouped_band_f1"] = f1_score(collapse[y], collapse[pred],
                    labels=range(3), average="macro", zero_division=0)
                fold["grouped_band_confusion"] = confusion_matrix(
                    collapse[y], collapse[pred], labels=range(3)).tolist()
            labels = range(len(names))
            fold[task] = {
                "f1": f1_score(y, pred, labels=labels, average=None, zero_division=0).tolist(),
                "confusion": confusion_matrix(y, pred, labels=labels).tolist(),
            }
        result["folds"].append(fold)

    for task, prefix in [("band", "bands"), ("cls", "clf")]:
        scores = np.array([f[task]["f1"] for f in result["folds"]])
        result[prefix + "_macro_f1"] = float(scores.mean(axis=1).mean())
        result[prefix + "_macro_sd"] = float(scores.mean(axis=1).std())
        result[prefix + "_per_class_f1"] = scores.mean(axis=0).tolist()
        result[prefix + "_per_class_sd"] = scores.std(axis=0).tolist()
        result[prefix + "_confusion"] = np.sum([f[task]["confusion"] for f in result["folds"]], axis=0).tolist()

    grouped = [f["grouped_band_f1"] for f in result["folds"]]
    result["grouped_band_macro_f1"] = float(np.mean(grouped))
    result["grouped_band_macro_sd"] = float(np.std(grouped))
    result["grouped_band_confusion"] = np.sum(
        [f["grouped_band_confusion"] for f in result["folds"]], axis=0).tolist()

    bands = primary_data.query("band >= 0")
    result["cuts_mg"] = fit_bands(bands.vedba_mean_mg.to_numpy(), bands.band.to_numpy())
    if len(external):
        tr = primary_data.query("cls >= 0")
        pred = classifier().fit(tr[features], tr.cls).predict(external[features])
        result["external"] = {"dogs": int(external.subject.nunique()),
                              "confusion": confusion_matrix(external.cls, pred, labels=range(5)).tolist(),
                              "f1_rest_walk_shake": f1_score(external.cls, pred, labels=[0, 1, 4],
                                                           average=None, zero_division=0).tolist()}
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("primary", type=Path, help="DogMoveData_csv_format.zip (v4)")
    parser.add_argument("--external", type=Path, help="optional Marcato df_raw.csv (v1)")
    parser.add_argument("--output", type=Path, default=HERE / "score.json")
    args = parser.parse_args()
    rows = list(primary(args.primary))
    if args.external:
        rows.extend(secondary(args.external))
    data = pd.DataFrame(rows, columns=["source", "subject", "band", "cls", *FIELDS])
    print(data.groupby(["source", "band", "cls"]).size().to_string(), flush=True)
    score = evaluate(data)
    args.output.write_text(json.dumps(score, indent=2) + "\n")
    print(f"bands {score['bands_macro_f1']:.4f}; classifier {score['clf_macro_f1']:.4f}; "
          f"thresholds {score['cuts_mg']} mg")


if __name__ == "__main__":
    main()
