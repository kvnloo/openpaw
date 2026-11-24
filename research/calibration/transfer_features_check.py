# SPDX-License-Identifier: GPL-3.0-only
"""Synthetic checks for the quantized, rotation-invariant window features."""
from pathlib import Path
import sys

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.dont_write_bytecode = True
from core import EPOCH, FIELDS, extract
from evaluate_transfer import BASE
from transfer_features import COEFF, HIST_BINS, summarize, update


def statistics(signal, first_gravity, last_gravity):
    hist = np.zeros(HIST_BINS, np.uint8)
    prev, prev2 = np.zeros(len(COEFF)), np.zeros(len(COEFF))
    for v in signal:
        update(v, signal[0], hist, prev, prev2)
    out = np.empty(4, np.int32)
    summarize(out, hist, prev, prev2, len(signal), *first_gravity, *last_gravity)
    return out


def main():
    t = np.arange(EPOCH) / 50
    flat = np.full(EPOCH, 125.)
    np.testing.assert_array_equal(statistics(flat, (0., 0., 1.), (1., 0., 0.)),
                                  [2, 2, 90, 0])
    np.testing.assert_array_equal(statistics(flat, (0., 0., 1.), (0., 0., -1.)),
                                  [2, 2, 180, 0])
    # 25 upper outliers: p90 is still the 225th sample, not the 226th.
    flat[-25:] = 20000.
    assert statistics(flat, (0., 0., 0.), (0., 0., 1.))[1] == 2
    flat[-26] = 20000.
    assert statistics(flat, (0., 0., 0.), (0., 0., 1.))[1] == HIST_BINS - 1
    for hz, band in [(0.6, 1), (1., 2), (2., 3), (3., 4), (4., 5), (5., 5)]:
        signal = 500. + 200. * np.cos(2 * np.pi * hz * t)
        assert statistics(signal, (0., 0., 1.), (0., 0., 1.))[3] == band

    # A 90° remount is exactly representable at integer mg. Repeated windows
    # exercise carry-over of the gravity filter and reset of added accumulators.
    t = np.tile(t, 3)
    samples = np.rint(np.column_stack((800*np.sin(2*np.pi*2*t),
                                       600*np.cos(2*np.pi*3*t),
                                       1000 + 1400*np.sin(2*np.pi*t)))).astype(np.int16)
    remounted = samples[:, [1, 0, 2]] * np.array([-1, 1, 1], dtype=np.int16)
    original, rotated = (extract(v, transfer=True) for v in (samples, remounted))
    np.testing.assert_array_equal(original[:, :len(FIELDS)], extract(samples))
    invariant = [FIELDS.index(f) for f in BASE] + list(range(len(FIELDS), original.shape[1]))
    np.testing.assert_array_equal(original[:, invariant], rotated[:, invariant])
    print("Synthetic percentile, angle, band, packet parity and 90° remount checks passed")


if __name__ == "__main__":
    main()
