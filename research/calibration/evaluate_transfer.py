# SPDX-License-Identifier: GPL-3.0-only
"""Select collar features on Vehkaoja dogs, then measure two dataset holdouts."""
import argparse
import hashlib
from itertools import combinations
import json
from pathlib import Path
import sys

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.dont_write_bytecode = True

import numpy as np
import pandas as pd
from sklearn.metrics import confusion_matrix, f1_score

from evaluate import CLASSES, FIELDS, classifier, folds_for, primary, secondary
from transfer_features import TRANSFER_FIELDS

VERSION = "openpaw-classifier-transfer/1"
SHARED = (0, 1, 4)
BASE = ("vedba_mean_mg", "vedba_max_mg", "active_frac", "bursts")
ADDITIONS = (TRANSFER_FIELDS[:2], TRANSFER_FIELDS[2:3], TRANSFER_FIELDS[3:])
HASHES = ("47f9e41428c0591d3c980aff1b59981eac14567a02019cc044f69ef4648a3b46",
          "ac04f51f35f5396c5c73a651974bba56070177bfb30a393266f5a02dd41c0c93")
BASELINE = 0.643
MIN_GAIN = 0.05
MIN_DEV = 0.85


def read(loader, path):
    return pd.DataFrame(loader(path, transfer=True),
                        columns=["source", "subject", "band", "cls", *FIELDS, *TRANSFER_FIELDS])


def measure(y, pred, labels):
    by_class = f1_score(y, pred, labels=labels, average=None, zero_division=0)
    return {"epochs": len(y), "macro_f1": float(by_class.mean()),
            "per_class_f1": by_class.tolist(),
            "confusion": confusion_matrix(y, pred, labels=labels).tolist()}


def select(primary_data):
    # Form folds before filtering, exactly as v1 (including unclassified
    # band-only windows in split stratification).
    splits = folds_for(primary_data, primary_data.cls)
    candidates = []
    for size in range(len(ADDITIONS) + 1):
        for groups in combinations(ADDITIONS, size):
            features = [*BASE, *(f for group in groups for f in group)]
            rows = []
            for train, test in splits:
                tr, te = (primary_data.iloc[idx].query("cls >= 0") for idx in (train, test))
                pred = classifier().fit(tr[features], tr.cls).predict(te[features])
                rows.append(measure(te.cls, pred, list(range(len(CLASSES)))))
            scores = [r["macro_f1"] for r in rows]
            candidates.append({"features": features, "macro_f1": float(np.mean(scores)),
                               "macro_sd": float(np.std(scores)), "folds": rows,
                               "confusion": np.sum([r["confusion"] for r in rows], axis=0).tolist()})
    # Score first, then fewer fields, then fixed enumeration order.
    winner = max(range(len(candidates)), key=lambda i: (
        candidates[i]["macro_f1"], -len(candidates[i]["features"])))
    return {"labels": CLASSES, "winner": winner, "candidates": candidates}


def transfer(source, target, features):
    tr, te = (d.loc[d.cls.isin(SHARED)] for d in (source, target))
    if set(tr.cls) != set(SHARED) or set(te.cls) != set(SHARED):
        raise ValueError("Each release must contain all three shared labels")
    tree = classifier().fit(tr[features], tr.cls)
    result = measure(te.cls, tree.predict(te[features]), SHARED)
    return tree, dict(result, train_epochs=len(tr),
                      train_dogs=int(tr.subject.nunique()), test_dogs=int(te.subject.nunique()))


def verify(path, expected):
    with path.open("rb") as handle:
        digest = hashlib.file_digest(handle, "sha256").hexdigest()
    if digest != expected:
        raise ValueError(f"{path.name}: unexpected SHA-256 {digest}")
    print(f"{path.name}: SHA-256 {digest} verified", flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("primary", type=Path)
    parser.add_argument("external", type=Path)
    parser.add_argument("--output", type=Path, default=HERE / "score.json",
                        help="existing v1 scoreboard to augment")
    args = parser.parse_args()
    score = json.loads(args.output.read_text())
    verify(args.primary, HASHES[0])
    vehkaoja = read(primary, args.primary)
    dev = select(vehkaoja)
    winner = dev["candidates"][dev["winner"]]
    features = winner["features"]
    print(f"Frozen dev winner: {features}; macro-F1 {winner['macro_f1']:.6f}", flush=True)

    # External data are not loaded until selection is complete.
    verify(args.external, HASHES[1])
    marcato = read(secondary, args.external)
    _, forward = transfer(vehkaoja, marcato, features)
    _, reverse = transfer(marcato, vehkaoja, features)
    ship = forward["macro_f1"] >= BASELINE + MIN_GAIN and winner["macro_f1"] >= MIN_DEV
    score[VERSION] = {
        "dev": dev,
        "transfer": {"labels": [CLASSES[i] for i in SHARED],
                     "vehkaoja_to_marcato": forward, "marcato_to_vehkaoja": reverse},
        "gate": {"baseline": BASELINE, "minimum_gain": MIN_GAIN, "minimum_dev": MIN_DEV,
                 "passed": ship},
    }
    args.output.write_text(json.dumps(score, indent=2) + "\n")
    print(f"Vehkaoja → Marcato: {forward}; Marcato → Vehkaoja: {reverse}; gate passed: {ship}")


if __name__ == "__main__":
    main()
