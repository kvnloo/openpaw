// OpenPaw Field "session check": a stop rule the owner runs during a walk or training session.
// Signs are things you can see; any one of them -> stop the session or move further away.
// Sources: East Bay SPCA LAT handout (threshold = can't look away, stops taking favourite food; make distance),
// Grisha Stewart's BAT demo (shivering, pacing, panting -> stop or add distance; research/video-notes V2 05:50),
// AVSAB 2021 (reward-based, distance-first). clark2020: panting is common and ambiguous on its own.
// Owner observation only: no score, no feelings, no diagnosis.
// SPDX-License-Identifier: GPL-3.0-only

export const SESSION_SIGNS = ['won\u2019t take food', 'can\u2019t look away', 'pacing', 'panting', 'shivering'];

export const SESSION_CHECK = {
  rule: 'openpaw-session-check/1',
  title: 'Session check',
  prompt: 'Tap what you see right now.',
  note: 'Any one of these means this is not a moment for practice. Panting can also be heat or exercise.',
  evidence: ['avsab2021-position-statement-on-humane-dog-training', 'clark2020-therapy-dogs-and-handlers-behavior-and-salivary-cortisol'],
  sources: [
    'https://eastbayspca.org/wp-content/uploads/2024/05/Look-At-That_A-Reactivity-Exercise.pdf',
    'https://www.youtube.com/watch?v=Q9BsLd6KQqM&t=350s',
  ],
};

export function sessionAdvice(signs) {
  if (!signs.length) return { stop: false, text: 'No stop signs marked. Check again after the next trigger.' };
  const onlyPanting = signs.length === 1 && signs[0] === 'panting';
  return {
    stop: true,
    text: `Stop the session or move further away.${onlyPanting ? ' Panting alone can also be heat or exercise.' : ''}`,
  };
}

export function sessionCheckPayload(signs) {
  for (const s of signs) if (!SESSION_SIGNS.includes(s)) throw new Error(`unknown sign: ${s}`);
  return { metric: 'session.check', value: signs.slice(), extra: { rule: SESSION_CHECK.rule, advice_shown: sessionAdvice(signs).text } };
}
