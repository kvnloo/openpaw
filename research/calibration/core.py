# SPDX-License-Identifier: GPL-3.0-only
"""Default 50 Hz OpenPaw feature core; input signed integer milligravity."""
import math

import numpy as np
from numba import njit
from transfer_features import COEFF, HIST_BINS, TRANSFER_FIELDS, summarize, update

EPOCH = 250
FIELDS = ("vedba_mean_mg", "vedba_max_mg", "active_frac", "pitch_deg",
          "roll_half_deg", "bursts", "clipped")


@njit
def round_away(x):
    # Promote before adding 0.5: lroundf rounds the input float, not the sum.
    return int(math.copysign(math.floor(abs(np.float64(x)) + 0.5), x))


@njit
def extract(samples, flush=False, transfer=False):
    """Return quantized fields; a flushed trailing row represents a GAP."""
    out = np.empty(((len(samples) + (EPOCH - 1 if flush else 0)) // EPOCH,
                    len(FIELDS) + (len(TRANSFER_FIELDS) if transfer else 0)), np.int32)
    f = np.float32
    dt = f(1) / f(50)
    alpha = dt / (f(2) + dt)
    sx = sy = sz = f(0)
    above = False
    total = pitch = roll = 0.0
    peak = f(0)
    active = bursts = n = j = 0
    clipped = False
    # Optional statistics share packet VeDBA and gravity state, not pitch/roll.
    hist = np.zeros(HIST_BINS if transfer else 0, np.uint8)
    prev = np.zeros(len(COEFF) if transfer else 0, np.float64)
    prev2 = np.zeros_like(prev)
    first_v = gx = gy = gz = 0.0
    for i in range(len(samples)):
        xi, yi, zi = samples[i]
        x, y, z = f(xi), f(yi), f(zi)
        clipped |= abs(int(xi)) >= 7950 or abs(int(yi)) >= 7950 or abs(int(zi)) >= 7950
        if i == 0:
            sx, sy, sz = x, y, z
        else:
            mag = np.sqrt(x*x + y*y + z*z)
            a = alpha if abs(mag - f(1000)) < f(350) else alpha * f(.05)
            sx += a * (x - sx)
            sy += a * (y - sy)
            sz += a * (z - sz)
        dx, dy, dz = x - sx, y - sy, z - sz
        v = np.sqrt(dx*dx + dy*dy + dz*dz)
        if transfer:
            if n == 0:
                first_v = float(np.float64(v))
                gx, gy, gz = np.float64(sx), np.float64(sy), np.float64(sz)
            update(np.float64(v), first_v, hist, prev, prev2)
        total += v
        peak = max(peak, v)
        active += v > f(120)
        if v > f(1500):
            bursts += not above
            above = True
        elif v < f(1500) * f(.7):
            above = False
        pitch += np.arctan2(-sx, np.sqrt(sy*sy + sz*sz)) * f(57.29578)
        roll += np.arctan2(sy, sz) * f(57.29578)
        n += 1
        if n == EPOCH or (flush and i == len(samples) - 1):
            out[j, 0] = int(min(f(65535), f(total / n) + f(.5)))
            out[j, 1] = int(min(f(65535), peak + f(.5)))
            out[j, 2] = (255 * active + n // 2) // n
            out[j, 3] = round_away(f(pitch / n))
            out[j, 4] = round_away(f(roll / n) / f(2))
            out[j, 5] = min(bursts, 255)
            out[j, 6] = clipped
            if transfer:
                summarize(out[j, len(FIELDS):], hist, prev, prev2, n, gx, gy, gz,
                          np.float64(sx), np.float64(sy), np.float64(sz))
                hist.fill(0)
                prev.fill(0)
                prev2.fill(0)
            j += 1
            total = pitch = roll = 0.0
            peak = f(0)
            active = bursts = n = 0
            clipped = False
    return out
