// OpenPaw Learn: the on-screen order of a practice card's choices.
// Fisher-Yates, so every order is equally likely and the right answer's position is no clue.
// (Sorting with a random comparator is not a fair shuffle: the right answer showed first ~27%
// of the time instead of 25%.)
// SPDX-License-Identifier: GPL-3.0-only
export function choiceOrder(n, rand = Math.random) {
  const o = [...Array(n).keys()];
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [o[i], o[j]] = [o[j], o[i]];
  }
  return o;
}
