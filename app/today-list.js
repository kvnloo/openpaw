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
export function todayRows(n, showAll) {
  const shown = Math.min(n, showAll ? CAP : LIMIT);
  return { shown, more: showAll ? 0 : Math.min(n, CAP) - shown };
}
