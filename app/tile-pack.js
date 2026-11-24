// OpenPaw Track: pack category groups into a fixed-column grid with no empty cells.
// Groups flow left to right; when the next group does not fit, the row's leftover cells go to the
// row's last group, and that group's last tile spans them (CSS: --last). DOM order is unchanged.
// SPDX-License-Identifier: GPL-3.0-only
export function packGroups(counts, cols = 4) {
  const out = counts.map((c) => ({ span: Math.min(cols, Math.max(1, c)), last: 1 }));
  let used = 0, lastIdx = -1;
  const close = () => { if (lastIdx >= 0 && used < cols) { out[lastIdx].span += cols - used; out[lastIdx].last += cols - used; } used = 0; };
  out.forEach((g, i) => {
    if (used + g.span > cols) close();
    used += g.span; lastIdx = i;
    if (used === cols) { used = 0; lastIdx = -1; }
  });
  close();
  return out;
}
