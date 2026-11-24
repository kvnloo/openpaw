# SPDX-License-Identifier: GPL-3.0-only
"""Compare Python feature output with C-generated golden packet fields."""
import json
from pathlib import Path
import subprocess
import sys
from tempfile import TemporaryDirectory

import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.dont_write_bytecode = True
from core import EPOCH, extract

ROOT = HERE.parents[1]


def main():
    fixture = json.loads((ROOT / "app/test/golden.json").read_text())
    with TemporaryDirectory() as tmp:
        exe, output = Path(tmp) / "golden", Path(tmp) / "golden.json"
        subprocess.run(["cc", "-std=c99", "-O1", "-ffp-contract=off", "-Wall",
                        "-Wextra", "-Werror", "-DOPENPAW_DUMP_GOLDEN_SAMPLES",
                        str(ROOT / "firmware/test/test_core.c"), "-lm", "-o", str(exe)],
                       check=True)
        run = subprocess.check_output([exe, output], text=True)
        assert json.loads(output.read_text()) == fixture
    samples = np.array([line.split()[1:] for line in run.splitlines()
                        if line.startswith("sample ")], dtype=np.int16)
    assert len(samples) == 6 * EPOCH
    # The C test shares state across rest and two trot epochs; other scenarios
    # reboot. The first trot epoch is a warm-up not included in the fixture.
    features = np.concatenate([extract(samples[:3*EPOCH])[[0, 2]]] +
                              [extract(x) for x in np.split(samples[3*EPOCH:], 3)])
    cases = [r for r in fixture if r["name"] not in ("roundtrip", "anchor")]
    for got, r in zip(features, cases, strict=True):
        want = [r["vedba_mean_mg"], r["vedba_max_mg"], r["active_frac"],
                r["pitch_deg"], r["roll_deg"] // 2, r["bursts"], bool(r["flags"] & 4)]
        np.testing.assert_array_equal(got, want, err_msg=r["name"])
    print(f"{len(cases)} Python feature vectors match C; all {len(fixture)} C packets match app fixture")


if __name__ == "__main__":
    main()
