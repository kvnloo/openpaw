// Field status card: placeholder steps shown in the chain row before any episode, in the
// order an episode's marks fill in (the action pad's own button names).
// SPDX-License-Identifier: GPL-3.0-only
export const CHAIN_SLOTS = ['Trigger', 'Reaction', 'Calm again'];

// The chain row stays one line so the status card, and the action pad under it, do not grow
// when marks land. Given the chips' widths (oldest first), the gap between them and the row
// width, returns the index of the first chip to keep: the newest chips that fit, never fewer
// than the newest one.
export function chipsThatFit(widths, gap, avail) {
  let used = 0;
  for (let i = widths.length - 1; i >= 0; i--) {
    used += widths[i] + (i < widths.length - 1 ? gap : 0);
    if (used > avail) return Math.min(i + 1, widths.length - 1);
  }
  return 0;
}
