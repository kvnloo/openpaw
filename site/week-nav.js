// Week selection for the landing "protocol scoreboard": which week a point or a key picks.
// SPDX-License-Identifier: GPL-3.0-only

/** Index of the x position nearest to fx (ties go to the earlier week). */
export function nearestIndex(xs, fx) {
  let best = 0;
  for (let i = 1; i < xs.length; i++) if (Math.abs(xs[i] - fx) < Math.abs(xs[best] - fx)) best = i;
  return best;
}

/** Next index for a key press over n weeks, or null if the key is not a week key. */
export function stepIndex(i, key, n) {
  if (key === 'ArrowLeft') return Math.max(0, i - 1);
  if (key === 'ArrowRight') return Math.min(n - 1, i + 1);
  if (key === 'Home') return 0;
  if (key === 'End') return n - 1;
  return null;
}
