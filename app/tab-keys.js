// Keyboard model for a horizontal ARIA tablist (WAI-ARIA APG Tabs pattern):
// Left/Right move one tab and wrap, Home/End jump to the ends.
// SPDX-License-Identifier: GPL-3.0-only

/** Index of the tab a key selects from tab i of n, or null if the key is not a tab key. */
export function tabStep(i, key, n) {
  if (key === 'ArrowRight') return (i + 1) % n;
  if (key === 'ArrowLeft') return (i - 1 + n) % n;
  if (key === 'Home') return 0;
  if (key === 'End') return n - 1;
  return null;
}
