# SPDX-License-Identifier: GPL-3.0-only
"""Window statistics on the same VeDBA and gravity estimates as the packet core."""
import math

import numpy as np
from numba import njit

TRANSFER_FIELDS = ("vedba_p50_bin", "vedba_p90_bin", "gravity_change_deg",
                   "dominant_hz_band")
HIST_BINS = 280
# Five seconds gives 0.2 Hz spacing. Search 0.6–5 Hz inclusive.
FFT_BINS = np.arange(3, 26)
# Read-only constants; a C port may store these in flash.
COEFF = 2 * np.cos(2 * np.pi * FFT_BINS / 250)


@njit
def update(v, first_v, hist, prev, prev2):
    # Counts fit in bytes (250 samples); no per-window sample buffer.
    hist[min(int(v / 50), HIST_BINS - 1)] += 1
    centered = v - first_v  # A constant does not affect nonzero DFT bins.
    for i in range(len(COEFF)):
        state = centered + COEFF[i] * prev[i] - prev2[i]
        prev2[i] = prev[i]
        prev[i] = state


@njit
def summarize(out, hist, prev, prev2, n, gx, gy, gz, sx, sy, sz):
    # Percentiles are nearest rank, expressed in 50 mg bins; top bin saturates.
    count = 0
    p50, p90 = (n + 1) // 2, (9*n + 9) // 10
    for i in range(HIST_BINS):
        before = count
        count += hist[i]
        if before < p50 <= count:
            out[0] = i
        if before < p90 <= count:
            out[1] = i
            break

    # atan2 of cross-product norm and dot product is stable near 0 and 180°.
    # A zero gravity vector carries no direction: use the neutral 0 sentinel.
    x, y, z = gy*sz - gz*sy, gz*sx - gx*sz, gx*sy - gy*sx
    dot = gx*sx + gy*sy + gz*sz
    out[2] = int(math.degrees(math.atan2(math.sqrt(x*x + y*y + z*z), dot)) + .5)

    best_power = 0.
    out[3] = 0  # constant signal / no positive in-band power
    for i in range(len(COEFF)):
        a, b = prev[i], prev2[i]
        power = a*a + b*b - COEFF[i]*a*b
        if power > best_power:
            best_power = power
            # 1: [0.6, 1); 2: [1, 2); ... 5: [4, 5] Hz.
            out[3] = min(5, 1 + (i + 3) // 5)
