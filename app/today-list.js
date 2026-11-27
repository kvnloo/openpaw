// OpenPaw Track: how many of today's entries the Today card shows.
// Collapsed, the newest LIMIT entries show and the rest wait behind "Show all N", so a busy day
// does not push the logging tiles down. Expanded, every entry shows up to CAP.
// SPDX-License-Identifier: GPL-3.0-only
export const LIMIT = 3, CAP = 40;
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
// The card's label: the local day it covers (its entries end at local midnight).
export function dayLabel(d = new Date()) {
  return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}
// The card's day ruler: now and each of today's entry times as a fraction of the local day
// (0 = midnight, 1 = next midnight; a DST day uses its real length). Other days and future
// timestamps are left out.
export function dayRuler(timestamps, now = new Date()) {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const len = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime() - start;
  const t = now.getTime();
  const marks = timestamps.filter((x) => x >= start && x <= t).map((x) => (x - start) / len).sort((a, b) => a - b);
  return { now: (t - start) / len, marks };
}
export function todayRows(n, showAll) {
  const shown = Math.min(n, showAll ? CAP : LIMIT);
  return { shown, more: showAll ? 0 : Math.min(n, CAP) - shown };
}
