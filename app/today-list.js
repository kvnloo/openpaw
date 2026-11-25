// OpenPaw Track: how many of today's entries the Today card shows.
// Collapsed, the newest LIMIT entries show and the rest wait behind "Show all N", so a busy day
// does not push the logging tiles down. Expanded, every entry shows up to CAP.
// SPDX-License-Identifier: GPL-3.0-only
export const LIMIT = 3, CAP = 40;
export function todayRows(n, showAll) {
  const shown = Math.min(n, showAll ? CAP : LIMIT);
  return { shown, more: showAll ? 0 : Math.min(n, CAP) - shown };
}
