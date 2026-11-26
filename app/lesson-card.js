// Foot row of a Learn lesson card: how many sources the lesson cites, plus a visual "Read" cue.
// The cue is aria-hidden; the card link already names the lesson.
// SPDX-License-Identifier: GPL-3.0-only

export function lessonFoot(lesson, isRead) {
  const n = lesson.sources.length;
  return `<p class="lfoot mono">${n} source${n === 1 ? '' : 's'}<span class="go" aria-hidden="true">${isRead ? 'Read again' : 'Read'} \u2192</span></p>`;
}
