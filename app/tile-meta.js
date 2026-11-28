// OpenPaw Track: the line a tracker tile shows before anything is logged today.
// Same shape as the logged line ("2 cups", "3× today", "avg 3"), at zero, so the tile reads as
// today's tally from the first visit. Rating scales have no zero: they say "no rating" and keep
// the range ("1-5") so the scale is still visible. A counted scale (Episode) says "none today".
// SPDX-License-Identifier: GPL-3.0-only
export function emptyLine(t) {
  if (t.type === 'check') return '0× today';
  if (t.type === 'scale') {
    if (t.count) return 'none today';
    const range = t.unit && (t.unit.match(/\d+\s*-\s*\d+/) || [t.unit])[0];
    return range ? `no rating · ${range}` : 'no rating';
  }
  return t.unit ? `0 ${t.unit} today` : '0 today';
}
