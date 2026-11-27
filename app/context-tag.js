// OpenPaw Field context tag "another dog in the home reacted first". In two-dog homes one dog's barking
// can set the other off (research/video-notes V12, It's Me or the Dog, 0:28-0:31: the guardian says one
// dog "sets him off"). A collar on one dog can't tell its own trigger from a follow-on reaction, so the
// owner marks it on the Trigger sheet and a behavior consultant sees it as context.
// Owner observation only: one Consultant "Context" row, never a score, no inference.
// SPDX-License-Identifier: GPL-3.0-only

export const CONTEXT_TAG = {
  rule: 'openpaw-context/1',
  value: 'other_dog_first',
  label: 'Another dog in the home reacted first',
  row: 'Another dog in the home reacted first (owner mark; the collar can\u2019t tell)',
  note: 'Tick it if another dog in your home barked or rushed first and this dog joined in.',
};

// Extra fields for the trigger.seen event when the owner ticked the switch.
export function contextExtra(otherDogFirst) {
  return otherDogFirst ? { context: [CONTEXT_TAG.value], context_rule: CONTEXT_TAG.rule } : {};
}

// Known context values on one event payload; anything else on record is ignored.
export function contextOf(payload) {
  const v = payload && Array.isArray(payload.context) ? payload.context : [];
  return v.filter((c) => c === CONTEXT_TAG.value);
}

export function contextText(context) {
  return context && context.includes(CONTEXT_TAG.value) ? CONTEXT_TAG.row : null;
}
