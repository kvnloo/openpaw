// node --test app/test/
// Guards the trainer's safety boundary: every lesson and card is sourced, answers are valid,
// and the copy avoids emotion-as-fact and diagnosis wording.
// SPDX-License-Identifier: GPL-3.0-only
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { LESSONS, CARDS, SOURCE_NAMES, SRC } from '../learn-content.js';

test('8 to 12 lessons, each with at least two named https sources', () => {
  assert.ok(LESSONS.length >= 8 && LESSONS.length <= 12);
  for (const l of LESSONS) {
    assert.ok(l.sources.length >= 2, l.id);
    for (const u of l.sources) {
      assert.match(u, /^https:\/\//, `${l.id} ${u}`);
      assert.ok(SOURCE_NAMES[u], `${l.id}: unnamed source ${u}`);
    }
    assert.ok(l.figs.length >= 1, l.id);
  }
});

test('every practice card has one valid answer, sources and an existing lesson', () => {
  const ids = new Set(LESSONS.map((l) => l.id));
  for (const c of CARDS) {
    assert.ok(c.choices.length >= 3 && c.choices.length <= 4, c.id);
    assert.ok(Number.isInteger(c.answer) && c.answer >= 0 && c.answer < c.choices.length, c.id);
    assert.ok(ids.has(c.lesson), c.id);
    assert.ok(c.sources.length >= 1 && c.sources.every((u) => SOURCE_NAMES[u]), c.id);
  }
  assert.equal(new Set(CARDS.map((c) => c.id)).size, CARDS.length);
});

test('evidence links resolve to docs/evidence cards, and the collar-recovery card is evidence-backed', () => {
  const dir = new URL('../../docs/evidence/cards/', import.meta.url);
  const linked = [...LESSONS, ...CARDS].filter((x) => x.evidence);
  for (const x of linked) {
    assert.ok(Array.isArray(x.evidence) && x.evidence.length >= 1, x.id);
    for (const slug of x.evidence) assert.ok(existsSync(new URL(`${slug}.md`, dir)), `${x.id}: missing evidence card ${slug}`);
  }
  // The collar measures movement only; the card that interprets a settled movement line must
  // send the reader back to observable recovery signs and cite the evidence base.
  const settle = CARDS.find((c) => c.id === 'c-collar-settle');
  assert.ok(settle, 'c-collar-settle card exists');
  assert.equal(settle.lesson, 'recovery');
  assert.ok(settle.evidence.length >= 2);
  assert.match(settle.choices[settle.answer], /movement/i);
  assert.doesNotMatch(settle.choices[settle.answer], /recovered|calm|relaxed/i);
});

test('held-still card: stillness close to a trigger is not read as relaxed, with timestamped public video examples', () => {
  const c = CARDS.find((x) => x.id === 'c-held-still');
  assert.ok(c, 'c-held-still card exists');
  assert.ok(c.evidence && c.evidence.length >= 2, 'cites docs/evidence cards');
  const right = c.choices[c.answer];
  assert.match(right, /distance|way out/i);
  assert.doesNotMatch(right, /\b(relaxed|calm) now\b|has settled/i);
  // Examples are links (no media copied) to public footage at a timestamp; at least one
  // shows the risky pattern and at least one shows the distance-first contrast.
  assert.ok(Array.isArray(c.examples) && c.examples.length >= 2, 'video examples');
  for (const e of c.examples) {
    assert.match(e.url, /^https:\/\/www\.youtube\.com\/watch\?v=[\w-]{11}&t=\d+s$/, e.url);
    assert.ok(e.label && e.label.length >= 10, e.url);
  }
});

test('food card: unedited footage where food and name stop working before the reaction', () => {
  const c = CARDS.find((x) => x.id === 'c-food');
  assert.ok(Array.isArray(c.examples) && c.examples.length >= 2, 'video examples');
  for (const e of c.examples) assert.match(e.url, /^https:\/\/www\.youtube\.com\/watch\?v=MiMU7y93x4Y&t=\d+s$/, e.url);
  assert.ok(c.examples.some((e) => /name|food|treat/i.test(e.label)), 'an example shows food/name stopping');
  assert.ok(c.examples.some((e) => /distance|away/i.test(e.label)), 'an example shows the distance response');
});

test('stacking card: session footage of triggers adding up, then distance and recovery, citing evidence', () => {
  const c = CARDS.find((x) => x.id === 'c-stack');
  assert.ok(Array.isArray(c.examples) && c.examples.length >= 2, 'video examples');
  for (const e of c.examples) assert.match(e.url, /^https:\/\/www\.youtube\.com\/watch\?v=Sp3B0KmBVFQ&t=\d+s$/, e.url);
  assert.ok(c.examples.some((e) => /car/i.test(e.label) && /dog/i.test(e.label)), 'an example names the stacked triggers');
  assert.ok(c.examples.some((e) => /distance|away|leav/i.test(e.label) && /sniff|nose/i.test(e.label)), 'an example shows distance then a recovery cue');
  assert.ok(c.evidence && c.evidence.includes('beerda1998-behavioural-saliva-cortisol-and-heart-rate-responses-to'), 'cites docs/evidence');
  assert.match(c.explain, /minutes/);
});

test('sniff card: a first sniff after a reaction is the start of recovery, not the end, with timestamped footage', () => {
  const c = CARDS.find((x) => x.id === 'c-sniff');
  assert.ok(Array.isArray(c.examples) && c.examples.length >= 2, 'video examples');
  for (const e of c.examples) assert.match(e.url, /^https:\/\/www\.youtube\.com\/watch\?v=[\w-]{11}&t=\d+s$/, e.url);
  assert.ok(c.examples.some((e) => /nose|sniff/i.test(e.label) && /seconds/i.test(e.label)), 'an example shows sniffing returning within seconds');
  assert.ok(c.examples.some((e) => /tail/i.test(e.label) && /(again|back up)/i.test(e.label)), 'an example shows arousal signs coming back after the first sniff');
  assert.match(c.explain, /start of recovery, not the end/i);
  assert.ok(c.evidence && c.evidence.includes('beerda1998-behavioural-saliva-cortisol-and-heart-rate-responses-to'), 'cites docs/evidence');
});

test('route card: a dog refusing a route after a loud event gets a different route and a vet check, citing noise evidence', () => {
  const c = CARDS.find((x) => x.id === 'c-route');
  assert.ok(c, 'c-route card exists');
  assert.equal(c.lesson, 'pain');
  const right = c.choices[c.answer];
  assert.match(right, /different route|another route/i);
  assert.match(right, /vet/i);
  // Wrong answers include making the dog walk the feared route; the right one must not.
  assert.doesNotMatch(right, /same route|make him|keep walking (him )?there/i);
  assert.ok(c.choices.some((x, i) => i !== c.answer && /same route|back there/i.test(x)), 'a distractor offers the forced route');
  for (const slug of ['lopesfagundes2018-noise-sensitivities-in-dogs-an-exploration-of-signs', 'riemer2023-therapy-and-prevention-of-noise-fears-in-dogs']) {
    assert.ok(c.evidence && c.evidence.includes(slug), `cites ${slug}`);
  }
  assert.match(c.explain, /8 of 10/);
  assert.match(c.explain, /2 of 10/);
  assert.ok(Array.isArray(c.examples) && c.examples.length >= 2, 'video examples');
  for (const e of c.examples) assert.match(e.url, /^https:\/\/www\.youtube\.com\/watch\?v=[\w-]{11}&t=\d+s$/, e.url);
  assert.ok(c.examples.some((e) => /pain|vet/i.test(e.label) && /fear|noise/i.test(e.label)), 'an example where a trainer rules out pain and fear first');
});

test('c-sound card: stops eating during sound practice = step too big; go quieter, never louder', () => {
  const c = CARDS.find((x) => x.id === 'c-sound');
  assert.ok(c, 'c-sound card exists');
  assert.equal(c.lesson, 'threshold');
  const right = c.choices[c.answer];
  assert.match(right, /quieter|lower|turn it down/i);
  assert.match(right, /stop|end/i);
  assert.doesNotMatch(right, /louder|turn it up|more volume/i);
  assert.ok(c.choices.some((x, i) => i !== c.answer && /louder|turn it up/i.test(x)), 'a distractor pushes the volume up');
  assert.ok(c.evidence && c.evidence.includes('riemer2023-therapy-and-prevention-of-noise-fears-in-dogs'), 'cites riemer2023');
  assert.match(c.explain, /refus\w* food|stops? eating/i);
  assert.match(c.explain, /tucked tail/i);
  assert.match(c.explain, /owner/i, 'success rates are labelled as owner reports');
  assert.ok(Array.isArray(c.examples) && c.examples.length >= 2, 'video examples');
  for (const e of c.examples) assert.match(e.url, /^https:\/\/www\.youtube\.com\/watch\?v=[\w-]{11}&t=\d+s$/, e.url);
});

test('c-hackles-play card: play bows restart play after a pause; cites byosiere2016 and shows a mutual pause', () => {
  const c = CARDS.find((x) => x.id === 'c-hackles-play');
  assert.ok(c, 'c-hackles-play card exists');
  assert.ok(c.evidence && c.evidence.includes('byosiere2016-investigating-the-function-of-play-bows-in-adult-pet-dogs'), 'cites byosiere2016');
  assert.match(c.explain, /pause/i);
  assert.match(c.explain, /restart|start .*again/i);
  // Hackles stay framed as arousal, never as a mood read off one signal.
  assert.match(c.explain, /arousal/i);
  assert.ok(Array.isArray(c.examples) && c.examples.length >= 2, 'video examples');
  for (const e of c.examples) assert.match(e.url, /^https:\/\/www\.youtube\.com\/watch\?v=[\w-]{11}&t=\d+s$/, e.url);
  assert.ok(c.examples.some((e) => /both .*(stop|still|pause)/i.test(e.label)), 'an example shows both dogs pausing together');
  assert.ok(c.examples.some((e) => /sound|growl|noise/i.test(e.label)), 'an example warns that play noise can sound like a fight');
  // The "step in" advice needs a picture of play that is not mutual.
  const oneSided = c.examples.find((e) => /emKIZgprH48/.test(e.url));
  assert.ok(oneSided, 'a one-sided play example (one dog keeps pursuing, the other turns away)');
  assert.match(oneSided.label, /one-sided/i);
  assert.match(oneSided.label, /turn/i);
});

test('c-play-sound card: noise misleads both ways; cites farago2017 with its numbers and links both directions', () => {
  const c = CARDS.find((x) => x.id === 'c-play-sound');
  assert.ok(c, 'c-play-sound card exists');
  assert.ok(c.evidence && c.evidence.includes('farago2017-dog-growls-express-various-contextual-and-affective-content-for'), 'cites farago2017');
  assert.ok(c.sources.includes(SRC.farago2017), 'links the paper');
  // The study's own numbers, not a paraphrase that overstates it.
  assert.match(c.explain, /40 adults/);
  assert.match(c.explain, /63%/);
  assert.match(c.explain, /33%/);
  assert.match(c.explain, /bod(y|ies)/i);
  // Never a verdict from sound alone.
  assert.doesNotMatch(c.explain, /always|never/i);
  assert.ok(Array.isArray(c.examples) && c.examples.length >= 2, 'video examples');
  for (const e of c.examples) assert.match(e.url, /^https:\/\/www\.youtube\.com\/watch\?v=[\w-]{11}&t=\d+s$/, e.url);
  assert.ok(c.examples.some((e) => /ZrG3SIYDILc/.test(e.url) && /play/i.test(e.label)), 'rough-sounding play example');
  assert.ok(c.examples.some((e) => /Q9BsLd6KQqM/.test(e.url) && /wag/i.test(e.label)), 'wagging-but-reacting example');
});

test('c-visitor-touch card: a visitor lets a nervous dog approach and does not reach; cites pedretti2023 with its numbers', () => {
  const c = CARDS.find((x) => x.id === 'c-visitor-touch');
  assert.ok(c, 'c-visitor-touch card exists');
  assert.equal(c.lesson, 'consent');
  const right = c.choices[c.answer];
  assert.match(right, /no reach|not reach|without reaching|keep(s)? (her|their) hands? (to|in)/i);
  assert.match(right, /toss|throw/i);
  assert.doesNotMatch(right, /pet him now|hold (him|out)|stare/i);
  assert.ok(c.choices.some((x, i) => i !== c.answer && /reach|pet/i.test(x)), 'a distractor reaches to pet');
  assert.ok(c.evidence && c.evidence.includes('pedretti2023-appeasement-function-of-displacement-behaviours-dogs-behavioural-displays'), 'cites pedretti2023');
  assert.ok(c.evidence.includes('avsab2021-position-statement-on-humane-dog-training'), 'cites AVSAB');
  // The study's own numbers: threatening (slow, staring, bent-over) vs ordinary approach.
  assert.match(c.explain, /26 of 53/);
  assert.match(c.explain, /11 of 53/);
  assert.match(c.explain, /star(e|ing)/i);
  // The study measured responses, not a training method: no "proven" claim for the technique.
  assert.doesNotMatch(c.explain, /proven|guarantee/i);
  assert.ok(Array.isArray(c.examples) && c.examples.length >= 2, 'video examples');
  for (const e of c.examples) assert.match(e.url, /^https:\/\/www\.youtube\.com\/watch\?v=_0WoUtmkoBI&t=\d+s$/, e.url);
  assert.ok(c.examples.some((e) => /hand/i.test(e.label) && /(ask|trigger)/i.test(e.label)), 'an example treats the reaching hand as its own trigger');
  assert.ok(c.examples.some((e) => /sideways|crouch/i.test(e.label)), 'an example shows the small, still, side-on stance');
});

test('every card example is a timestamped https link with a label', () => {
  for (const c of CARDS.filter((x) => x.examples)) {
    for (const e of c.examples) {
      assert.match(e.url, /^https:\/\//, `${c.id} ${e.url}`);
      assert.ok(typeof e.label === 'string' && e.label.length > 0, c.id);
    }
  }
});

test('all registered sources are used and named', () => {
  const used = new Set([...LESSONS.flatMap((l) => l.sources), ...CARDS.flatMap((c) => c.sources)]);
  for (const u of Object.values(SRC)) assert.ok(used.has(u), `unused source ${u}`);
});

test('copy hedges interpretations and never diagnoses', () => {
  const text = JSON.stringify({ LESSONS, CARDS });
  for (const bad of [/\bis (happy|angry|guilty|jealous|dominant)\b/i, /\bdiagnos(is|ed|e) (of|with)\b/i, /\balpha\b/i, /\bcorrection collar\b/i]) {
    assert.doesNotMatch(text, bad);
  }
  assert.ok(LESSONS.filter((l) => l.contested).length >= 4, 'contested topics are marked');
});
