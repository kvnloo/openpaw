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
  for (const e of c.examples) assert.match(e.url, /^https:\/\/www\.youtube\.com\/watch\?v=(Sp3B0KmBVFQ|z85LFeypIMM)&t=\d+s$/, e.url);
  assert.ok(c.examples.some((e) => /car/i.test(e.label) && /dog/i.test(e.label)), 'an example names the stacked triggers');
  // Stacking can be seen before any reaction: the trainer's own caption at 24:30, then extra distance.
  const near = c.examples.find((e) => e.url === 'https://www.youtube.com/watch?v=z85LFeypIMM&t=1470s');
  assert.ok(near, 'an unedited example of stacking with no reaction (V17 24:30)');
  assert.match(near.label, /voices/i);
  assert.match(near.label, /kid/i);
  assert.match(near.label, /no reaction|not reacting|wasn\u2019t reacting/i);
  assert.match(near.label, /distance/i);
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

test('c-door-knock card: getting up after a knock means step back down; rule of thumb, not a finding', () => {
  const c = CARDS.find((x) => x.id === 'c-door-knock');
  assert.ok(c, 'c-door-knock card exists');
  assert.equal(c.lesson, 'threshold');
  const right = c.choices[c.answer];
  assert.match(right, /softer|quieter|fewer/i);
  assert.doesNotMatch(right, /louder|harder|tell her|make her/i);
  assert.ok(c.choices.some((x, i) => i !== c.answer && /louder|harder/i.test(x)), 'a distractor pushes the knock harder');
  assert.ok(c.choices.some((x, i) => i !== c.answer && /(tell|make) her (to )?(lie|sit|stay)/i.test(x)), 'a distractor commands her back down');
  assert.ok(c.evidence && c.evidence.includes('riemer2023-therapy-and-prevention-of-noise-fears-in-dogs'), 'cites riemer2023');
  assert.ok(c.evidence.includes('butler2011-the-efficacy-of-systematic-desensitization-for-treating-the'), 'cites butler2011');
  assert.ok(c.evidence.includes('avsab2021-position-statement-on-humane-dog-training'), 'cites AVSAB');
  // Getting up as an early sign is a trainer's rule of thumb: the copy must say so.
  assert.match(c.explain, /rule of thumb/i);
  assert.match(c.explain, /not (a )?measured|no study/i);
  // butler2011 is small and about separation, not door reactivity: say both.
  assert.match(c.explain, /8 dogs/);
  assert.match(c.explain, /separation/i);
  assert.doesNotMatch(c.explain, /proven|guarantee|for good|cure/i);
  assert.ok(Array.isArray(c.examples) && c.examples.length >= 3, 'video examples');
  for (const e of c.examples) assert.match(e.url, /^https:\/\/www\.youtube\.com\/watch\?v=G_HJC6G4lcc&t=\d+s$/, e.url);
  assert.ok(c.examples.some((e) => /stand|gets? up/i.test(e.label)), 'an example shows her getting up after a harder knock');
  assert.ok(c.examples.some((e) => /chew|eat/i.test(e.label)), 'an example shows eating pause / continue');
});

test('c-quiet-aroused card: no barking after punishment is not calm; add distance; cites vieiradecastro2020 with its numbers', () => {
  const c = CARDS.find((x) => x.id === 'c-quiet-aroused');
  assert.ok(c, 'c-quiet-aroused card exists');
  assert.equal(c.lesson, 'threshold');
  const right = c.choices[c.answer];
  assert.match(right, /distance|further away/i);
  assert.match(right, /not the same as (calm|relaxed)/i);
  assert.doesNotMatch(right, /firmer|correct|punish|closer/i);
  assert.ok(c.choices.some((x, i) => i !== c.answer && /fixed|cured/i.test(x)), 'a distractor says no bark = fixed');
  assert.ok(c.choices.some((x, i) => i !== c.answer && /firmer|correct/i.test(x)), 'a distractor enforces the cue harder');
  assert.ok(c.evidence && c.evidence.includes('vieiradecastro2020-does-training-method-matter-evidence-for-the-negative'), 'cites vieiradecastro2020');
  assert.ok(c.evidence.includes('avsab2021-position-statement-on-humane-dog-training'), 'cites AVSAB');
  // The study's own design and limits: 92 dogs, 7 schools, not randomised.
  assert.match(c.explain, /92 dogs/);
  assert.match(c.explain, /not (randomi[sz]ed|assigned at random)|chose the school/i);
  assert.doesNotMatch(c.explain, /proven|guarantee|stress score/i);
  assert.ok(Array.isArray(c.examples) && c.examples.length >= 2, 'video examples');
  for (const e of c.examples) assert.match(e.url, /^https:\/\/www\.youtube\.com\/watch\?v=(jdWysYtU7HY|EBfq1Wz8jHw)&t=\d+s$/, e.url);
  // Second source (force-free, no punishment): quiet over threshold at a door (eileenanddogs V14).
  const door = c.examples.filter((e) => /EBfq1Wz8jHw/.test(e.url));
  assert.ok(door.length >= 1, 'a force-free example of quiet over threshold (V14)');
  assert.ok(door.some((e) => /door/i.test(e.label) && /sit/i.test(e.label) && /(no|not) (answer|respon)/i.test(e.label)), 'V14 example: known sit cue at the door gets no answer');
  assert.ok(door.some((e) => /food|treat/i.test(e.label) && /(not|doesn.t|won.t|does not) (take|eat)/i.test(e.label)), 'V14 example: food offered, not taken');
  for (const e of door) assert.doesNotMatch(e.label, /stress/i, 'visible signs only, not the author\'s feeling word');
  assert.match(c.explain, /without (any )?punish/i, 'explain: quiet over threshold also happens without punishment');
  // This dog's tail is high and curled with no dogs around (1:30), so the examples must not read it as a sign.
  assert.ok(c.examples.every((e) => !/tail/i.test(e.label)), 'no example reads this dog\'s natural tail carriage as a signal');
  assert.match(c.context, /higher|stiffer|than (on )?(his )?(usual|normal)/i, 'scenario compares the tail with his own normal carriage');
  assert.ok(c.examples.some((e) => /lead|leash/i.test(e.label) && /taut|pulled up/i.test(e.label)), 'an example shows the sit held by upward lead tension');
  assert.ok(c.examples.some((e) => /not recommended|aversive/i.test(e.label)), 'an example flags the technique');
});

test('c-one-step card: a scary thing is added one change at a time by a person the dog knows; graded-steps evidence with its limits', () => {
  const c = CARDS.find((x) => x.id === 'c-one-step');
  assert.ok(c, 'c-one-step card exists');
  assert.equal(c.lesson, 'threshold');
  const right = c.choices[c.answer];
  assert.match(right, /one (change|step) at a time/i);
  assert.match(right, /ground|floor/i, 'the object starts off the person');
  assert.match(right, /stops? eating|won.t eat|doesn.t eat/i, 'food stopping means go back a step');
  assert.doesNotMatch(right, /stranger|walk (straight )?up|correct|punish/i);
  assert.ok(c.choices.some((x, i) => i !== c.answer && /stranger/i.test(x) && /walk (straight )?up/i.test(x)), 'a distractor floods him with a stranger walking up');
  assert.ok(c.choices.some((x, i) => i !== c.answer && /correct|punish/i.test(x)), 'a distractor corrects the bark');
  for (const slug of ['riemer2023-therapy-and-prevention-of-noise-fears-in-dogs', 'butler2011-the-efficacy-of-systematic-desensitization-for-treating-the', 'avsab2021-position-statement-on-humane-dog-training']) {
    assert.ok(c.evidence && c.evidence.includes(slug), `cites ${slug}`);
  }
  // Limits stated: butler2011 is 8 dogs, separation problems, no comparison group; hats were not studied.
  assert.match(c.explain, /8 dogs/);
  assert.match(c.explain, /separation/i);
  assert.match(c.explain, /hats? (were|was) not studied|no study (of|on) hats/i);
  assert.match(c.explain, /out of reach|cannot reach|can.t reach/i, 'the video\'s own bite-safety warning');
  assert.doesNotMatch(c.explain, /proven|guarantee|for good|cure/i);
  assert.ok(Array.isArray(c.examples) && c.examples.length >= 3, 'video examples');
  for (const e of c.examples) assert.match(e.url, /^https:\/\/www\.youtube\.com\/watch\?v=LXCELHDT2fs&t=\d+s$/, e.url);
  assert.ok(c.examples.some((e) => /hat/i.test(e.label) && /ground|grass/i.test(e.label)), 'an example: the hat starts on the ground');
  assert.ok(c.examples.some((e) => /coat/i.test(e.label)), 'an example: the next step adds a coat');
  assert.ok(c.examples.some((e) => /door/i.test(e.label)), 'an example: the same steps at a doorway');
  // The video does not show a fearful dog: no example may say it does.
  for (const e of c.examples) assert.doesNotMatch(e.label, /scared|afraid|fearful|stress|calm/i, 'visible facts only');
});

test('c-greet-away card: a dog turning away mid-greeting is let go and rewarded, whatever the other owner says; cites mariti2017 with its numbers', async () => {
  const c = CARDS.find((x) => x.id === 'c-greet-away');
  assert.ok(c, 'c-greet-away card exists');
  assert.equal(c.lesson, 'turn-paw');
  // The scenario carries a spoken label ("they're fine") that the dog's body disagrees with.
  assert.match(c.context, /turns? (her|his) head away/i);
  assert.match(c.context, /fine/i);
  const { askFor } = await import('../learn-content.js');
  assert.match(askFor(c), /\bdo\b.*\?$/i, 'an action question');
  const right = c.choices[c.answer];
  assert.match(right, /let (her|him) (move|walk) away/i);
  assert.match(right, /space|distance/i);
  assert.doesNotMatch(right, /finish|hold|tell (her|him) off|nose to nose/i);
  assert.ok(c.choices.some((x, i) => i !== c.answer && /finish the greeting|back so they can/i.test(x)), 'a distractor brings her back to finish the greeting');
  assert.ok(c.choices.some((x, i) => i !== c.answer && /rude|tell (her|him) off/i.test(x)), 'a distractor calls it rude');
  const slug = 'mariti2017-analysis-of-the-intraspecific-visual-communication-in-the-domestic';
  assert.ok(c.evidence && c.evidence.includes(slug), 'cites mariti2017');
  assert.ok(c.evidence.includes('avsab2021-position-statement-on-humane-dog-training'), 'cites AVSAB');
  assert.ok(c.sources.includes(SRC.mariti2017), 'links the paper');
  // The study's own numbers and limits: 24 dogs, pilot; 73 of 109; 58 of 73.
  assert.match(c.explain, /24 dogs/);
  assert.match(c.explain, /73 of 109/);
  assert.match(c.explain, /58 of (those )?73/);
  assert.match(c.explain, /pilot/i);
  assert.match(c.explain, /not (tell you )?what .* feels|does not tell you what/i, 'no feeling read off one signal');
  assert.doesNotMatch(c.explain, /proven|guarantee|always|rude/i);
  assert.ok(Array.isArray(c.examples) && c.examples.length >= 3, 'video examples');
  for (const e of c.examples) assert.match(e.url, /^https:\/\/www\.youtube\.com\/watch\?v=SbR0YXaMyvM&t=\d+s$/, e.url);
  assert.ok(c.examples.some((e) => /between/i.test(e.label) && /handler/i.test(e.label)), 'an example: she puts her handler between herself and the puppy');
  assert.ok(c.examples.some((e) => /break/i.test(e.label) && /eye contact/i.test(e.label)), 'an example: eye contact, then she walks off for a break');
  assert.ok(c.examples.some((e) => /switch(es)? sides/i.test(e.label) && /(go|step) back a step/i.test(e.label)), 'an example: on a walk she switches sides; the trainer goes back a step');
  for (const e of c.examples) assert.doesNotMatch(e.label, /scared|afraid|fearful|stress|uncomfortable/i, 'visible facts only');
  // The evidence card itself carries the study's design.
  const { readFileSync } = await import('node:fs');
  const card = readFileSync(new URL(`../../docs/evidence/cards/${slug}.md`, import.meta.url), 'utf8');
  assert.match(card, /doi: "10\.1016\/j\.jveb\.2016\.12\.009"/);
  assert.match(card, /n_dogs: 24/);
});

test('c-noise-find card: after a sudden noise, food straight away (a find it) is the next step, not withholding it; cites the noise-fear evidence', async () => {
  const c = CARDS.find((x) => x.id === 'c-noise-find');
  assert.ok(c, 'c-noise-find card exists');
  assert.equal(c.lesson, 'threshold');
  assert.match(c.context, /sudden (noise|clatter|bang)/i);
  assert.match(c.context, /head (comes )?up/i);
  assert.match(c.context, /still/i);
  const { askFor } = await import('../learn-content.js');
  assert.match(askFor(c), /\bdo\b.*\?$/i, 'an action question');
  const right = c.choices[c.answer];
  assert.match(right, /find it/i);
  assert.match(right, /scatter|toss/i);
  assert.match(right, /(will not|won.t|does not) (take|eat)/i, 'the right answer says what to do if he will not eat');
  assert.ok(c.choices.some((x, i) => i !== c.answer && /reward (his|her) fear/i.test(x)), 'a distractor withholds food so as not to reward fear');
  assert.ok(c.choices.some((x, i) => i !== c.answer && /sit and stay/i.test(x)), 'a distractor holds him in a sit');
  assert.ok(c.choices.some((x, i) => i !== c.answer && /toward|over to/i.test(x)), 'a distractor walks him to the noise');
  assert.deepEqual(c.evidence, ['riemer2023-therapy-and-prevention-of-noise-fears-in-dogs', 'riemer2020-effectiveness-of-treatments-for-firework-fears-in-dogs', 'avsab2021-position-statement-on-humane-dog-training']);
  assert.ok(c.sources.includes(SRC.riemer2023) && c.sources.includes(SRC.avsabHumane));
  // What the review and the survey actually say, with their limits.
  assert.match(c.explain, /food or play during noise/i);
  assert.match(c.explain, /sudden noises/i);
  assert.match(c.explain, /owner reports?, not a trial/i);
  assert.match(c.explain, /not what he feels|does not tell you what/i, 'no feeling read off a head-up pause');
  assert.doesNotMatch(c.explain, /serotonin|dopamine|cortisol|heart rate|proven|always|guarantee/i, 'no physiology claims the sources do not make');
  assert.ok(Array.isArray(c.examples) && c.examples.length >= 2);
  for (const e of c.examples) assert.match(e.url, /^https:\/\/www\.youtube\.com\/watch\?v=GH7nSv1Pt08&t=\d+s$/, e.url);
  assert.ok(c.examples.some((e) => /still/i.test(e.label) && /nose (down|to the floor)/i.test(e.label)), 'an example: still and head up, then nose down for the scatter');
  assert.ok(c.examples.some((e) => /recall|comes when called/i.test(e.label)), 'an example: he answers a cue afterwards');
  for (const e of c.examples) assert.doesNotMatch(e.label, /scared|afraid|fearful|stress|nervous|anxious/i, 'visible facts only');
});

test('c-wait-look card: after a real lunge, wait quietly and reward the first look back, then add distance; cites shnookal2025 with its limit', async () => {
  const c = CARDS.find((x) => x.id === 'c-wait-look');
  assert.ok(c, 'c-wait-look card exists');
  assert.equal(c.lesson, 'threshold');
  assert.match(c.context, /lunge/i);
  assert.match(c.context, /tight lead/i);
  assert.match(c.context, /does not (turn|look)/i, 'she is not hearing her name yet');
  const { askFor } = await import('../learn-content.js');
  assert.match(askFor(c), /\bdo\b.*\?$/i, 'an action question');
  const right = c.choices[c.answer];
  assert.match(right, /wait/i);
  assert.match(right, /looks? (back|round) at you|turns? (her head )?(back|round) to you/i);
  assert.match(right, /yes/i, 'marks the look');
  assert.match(right, /distance|further|away from the road/i);
  assert.doesNotMatch(right, /repeat|pull|tell (her|him) off|sit/i);
  assert.ok(c.choices.some((x, i) => i !== c.answer && /repeat/i.test(x)), 'a distractor keeps repeating cues');
  assert.ok(c.choices.some((x, i) => i !== c.answer && /pull/i.test(x)), 'a distractor pulls her round');
  assert.ok(c.choices.some((x, i) => i !== c.answer && /tell (her|him) off/i.test(x)), 'a distractor tells her off');
  assert.deepEqual(c.evidence, ['shnookal2025-exploring-trainer-insights-and-understanding-of-on-lead', 'avsab2021-position-statement-on-humane-dog-training']);
  assert.ok(c.sources.includes(SRC.shnookal2025) && c.sources.includes(SRC.avsabHumane) && c.sources.includes(SRC.latEastBay));
  assert.ok(SOURCE_NAMES[SRC.shnookal2025], 'shnookal2025 has a readable source name');
  // What the interview study actually says, with its limit.
  assert.match(c.explain, /ten (professional )?trainers|10 trainers/i);
  assert.match(c.explain, /counterconditioning/i);
  assert.match(c.explain, /(remains |is )?unclear|not (a trial|measured)/i, 'states the study did not test what works');
  assert.doesNotMatch(c.explain, /proven|always|guarantee|cure|stress score|happy|fearful|afraid/i);
  assert.ok(Array.isArray(c.examples) && c.examples.length >= 2);
  for (const e of c.examples) assert.match(e.url, /^https:\/\/www\.youtube\.com\/watch\?v=I5HEz-lfQ7I&t=\d+s$/, e.url);
  assert.ok(c.examples.some((e) => /lung|jump/i.test(e.label) && /looks? (round|back)|turns/i.test(e.label)), 'an example: the lunge, then the first look back');
  assert.ok(c.examples.some((e) => /wag/i.test(e.label) && /cat/i.test(e.label)), 'an example: a wagging tail at a cat, and a quicker look back');
  assert.ok(c.examples.every((e) => /approximate|edited/i.test(e.label) || !/\bs\b|seconds/.test(e.label)), 'times from an edited clip are flagged approximate');
  for (const e of c.examples) assert.doesNotMatch(e.label, /scared|afraid|fearful|stress|nervous|anxious|happy/i, 'visible facts only');
});

test('c-step-back card: when he stops taking treats closer to a person, go back to the last distance that worked; cites the trainer study with its scope', async () => {
  const c = CARDS.find((x) => x.id === 'c-step-back');
  assert.ok(c, 'c-step-back card exists');
  assert.equal(c.lesson, 'threshold');
  assert.equal(c.art.prop, 'person', 'stranger-directed: the trigger is a person');
  assert.match(c.context, /helper|friend/i, 'a set-up the owner controls');
  assert.match(c.context, /\b\d+ (steps|metres|m)\b.*\b\d+ (steps|metres|m)\b/i, 'two distances: the one that worked and the closer one');
  assert.match(c.context, /(stops|won.t|will not) (taking|take) (the )?(treats|food)/i);
  const { askFor } = await import('../learn-content.js');
  assert.match(askFor(c), /\bdo\b.*\?$/i, 'an action question');
  const right = c.choices[c.answer];
  assert.match(right, /back to/i);
  assert.match(right, /(took|taking|takes) (the )?(treats|food)/i, 'the last distance where he still ate');
  assert.match(right, /small(er)? steps|another day|next time/i);
  assert.doesNotMatch(right, /hold|sit|closer now|greet/i);
  assert.ok(c.choices.some((x, i) => i !== c.answer && /stay/i.test(x) && /used to/i.test(x)), 'a distractor waits it out at the closer distance');
  assert.ok(c.choices.some((x, i) => i !== c.answer && /sit/i.test(x)), 'a distractor holds him in a sit');
  assert.ok(c.choices.some((x, i) => i !== c.answer && /closer|sniff|say hello/i.test(x)), 'a distractor moves him in to meet her');
  assert.deepEqual(c.evidence, ['shnookal2025-exploring-trainer-insights-and-understanding-of-on-lead', 'butler2011-the-efficacy-of-systematic-desensitization-for-treating-the', 'avsab2021-position-statement-on-humane-dog-training']);
  assert.ok(c.sources.includes(SRC.shnookal2025) && c.sources.includes(SRC.butler2011) && c.sources.includes(SRC.avsabHumane));
  // Each study is stated with its real scope and limit.
  assert.match(c.explain, /other dogs/i, 'the trainer study was about dogs reacting to dogs');
  assert.match(c.explain, /varied|differ/i, 'trainers applied controlled exposure differently');
  assert.match(c.explain, /unclear/i);
  assert.match(c.explain, /8 dogs|eight dogs/i);
  assert.match(c.explain, /separation|left alone/i, 'butler2011 is a different problem');
  assert.match(c.explain, /consultant/i);
  assert.doesNotMatch(c.explain, /proven|always|guarantee|cure|stress score|happy|fearful|afraid/i);
  assert.ok(Array.isArray(c.examples) && c.examples.length >= 2);
  for (const e of c.examples) assert.match(e.url, /^https:\/\/www\.youtube\.com\/watch\?v=mY-pXoYOUjs&t=\d+s$/, e.url);
  assert.ok(c.examples.some((e) => /20/.test(e.label) && /17/.test(e.label)), 'an example: back from 17 to 20 feet');
  assert.ok(c.examples.some((e) => /treat/i.test(e.label) && /take/i.test(e.label)), 'an example: not taking the treat as the signal');
  for (const e of c.examples) assert.doesNotMatch(e.label, /scared|afraid|fearful|stress|nervous|anxious|happy/i, 'visible facts only');
});

test('c-bite-first card: after a bite on a person, keep people away, vet check, reward-based professional; a "dominance" label is not a plan', async () => {
  const c = CARDS.find((x) => x.id === 'c-bite-first');
  assert.ok(c, 'c-bite-first card exists');
  assert.equal(c.lesson, 'pain', 'the "see your vet first" lesson');
  assert.equal(c.art.prop, 'person', 'stranger-directed: the trigger is a person');
  assert.match(c.context, /bit(ten)?\b/i, 'a bite has happened');
  assert.match(c.context, /dominant|boss/i, 'someone offers the dominance reading');
  const { askFor } = await import('../learn-content.js');
  assert.match(askFor(c), /\bdo\b.*\?$/i, 'an action question');
  const right = c.choices[c.answer];
  assert.match(right, /vet/i);
  assert.match(right, /reward-based/i);
  assert.match(right, /away from|distance/i, 'keep people safe while you get help');
  assert.doesNotMatch(right, /correct|hold|boss|used to/i);
  assert.ok(c.choices.some((x, i) => i !== c.answer && /correct/i.test(x)), 'a distractor: lead corrections');
  assert.ok(c.choices.some((x, i) => i !== c.answer && /hold|pin/i.test(x) && /still|quiet/i.test(x)), 'a distractor: hold him down until he goes still');
  assert.ok(c.choices.some((x, i) => i !== c.answer && /used to/i.test(x)), 'a distractor: bring people close so he gets used to them');
  assert.deepEqual(c.evidence, ['amat2024-the-relationship-between-aggression-and-physical-disease-in', 'mikkola2021-aggressive-behaviour-is-affected-by-demographic-environmental-and', 'vieiradecastro2020-does-training-method-matter-evidence-for-the-negative', 'avsab2021-position-statement-on-humane-dog-training']);
  for (const k of ['amat2024', 'mikkola2021', 'vieiradecastro2020', 'avsabHumane']) assert.ok(SRC[k] && c.sources.includes(SRC[k]), k);
  // Each study with its real scope and limit.
  assert.match(c.explain, /review/i, 'amat2024 is a clinical review');
  assert.match(c.explain, /pain/i);
  assert.match(c.explain, /9,?270 dogs/, 'mikkola2021 size');
  assert.match(c.explain, /owner/i);
  assert.match(c.explain, /(cannot|does not|can.t) show (what )?caus/i, 'mikkola2021 is cross-sectional owner report');
  assert.match(c.explain, /92 dogs/);
  assert.match(c.explain, /not randomi[sz]ed/i);
  assert.match(c.explain, /write down/i, 'record what you see instead of a label');
  // AVSAB 2021 FAQ names these techniques and the dominance framing explicitly.
  assert.match(c.explain, /choke chain/i);
  assert.match(c.explain, /dominance/i);
  assert.match(c.explain, /management/i);
  assert.doesNotMatch(c.explain, /proven|always|guarantee|cure|stress score|is dominant/i);
  assert.ok(Array.isArray(c.examples) && c.examples.length >= 2);
  for (const e of c.examples) assert.match(e.url, /^https:\/\/www\.youtube\.com\/watch\?v=7s7C4yKRphk&t=\d+s$/, e.url);
  assert.ok(c.examples.some((e) => /not recommended|aversive/i.test(e.label)), 'an example flags the technique');
  for (const e of c.examples) assert.doesNotMatch(e.label, /scared|afraid|fearful|stress|nervous|anxious|happy|submissive/i, 'visible facts only');
});

test('c-make-space card: people coming on a narrow path means make distance early, not hold him in a sit; cites the trainer study with its scope', async () => {
  const c = CARDS.find((x) => x.id === 'c-make-space');
  assert.ok(c, 'c-make-space card exists');
  assert.equal(c.lesson, 'threshold');
  assert.equal(c.art.prop, 'person', 'stranger-directed: the trigger is people');
  assert.match(c.context, /people/i);
  assert.match(c.context, /narrow path/i);
  assert.match(c.context, /cyclists?/i);
  const { askFor } = await import('../learn-content.js');
  assert.match(askFor(c), /\bdo\b.*\?$/i, 'an action question');
  const right = c.choices[c.answer];
  assert.match(right, /early/i, 'before he reacts');
  assert.match(right, /turn and walk|walk the other way/i);
  assert.match(right, /off the path/i);
  assert.match(right, /further|distance/i);
  assert.match(right, /sniff/i, 'recovery once they have gone');
  assert.doesNotMatch(right, /hold|sit|\bno\b|pick/i);
  assert.ok(c.choices.some((x, i) => i !== c.answer && /sit/i.test(x) && /\bno\b/i.test(x)), 'a distractor: hold him in a sit and say no');
  assert.ok(c.choices.some((x, i) => i !== c.answer && /straight/i.test(x)), 'a distractor: walk straight at them');
  assert.ok(c.choices.some((x, i) => i !== c.answer && /pick him up/i.test(x)), 'a distractor: pick him up facing them');
  assert.deepEqual(c.evidence, ['shnookal2025-exploring-trainer-insights-and-understanding-of-on-lead', 'avsab2021-position-statement-on-humane-dog-training']);
  assert.ok(c.sources.includes(SRC.shnookal2025) && c.sources.includes(SRC.avsabHumane));
  // shnookal2025 abstract: ten trainers; all discussed management, enrichment or relationship building;
  // restraint by the lead among the causes named; controlled exposure applied differently; effectiveness unclear.
  assert.match(c.explain, /ten trainers/i);
  assert.match(c.explain, /management/i);
  assert.match(c.explain, /restraint by the lead/i);
  assert.match(c.explain, /other dogs/i, 'the study was about dogs reacting to dogs');
  assert.match(c.explain, /not people/i, 'states the scope gap for a person-directed case');
  assert.match(c.explain, /unclear/i);
  assert.match(c.explain, /reward-based/i);
  assert.match(c.explain, /consultant/i);
  assert.doesNotMatch(c.explain, /proven|always|guarantee|cure|stress score|happy|fearful|afraid|is dominant/i);
  assert.ok(Array.isArray(c.examples) && c.examples.length >= 2);
  for (const e of c.examples) assert.match(e.url, /^https:\/\/www\.youtube\.com\/watch\?v=SVfr7vUSIZc&t=\d+s$/, e.url);
  assert.ok(c.examples.some((e) => /off the path|grass bank|verge/i.test(e.label)), 'an example: leaving the path');
  assert.ok(c.examples.some((e) => /cyclists?/i.test(e.label) && /tight lead/i.test(e.label) && /sit/i.test(e.label)), 'an example: held in a sit, then up at the end of a tight lead');
  assert.ok(c.examples.some((e) => /estimate|not readable/i.test(e.label)), 'distances from frames are flagged as estimates');
  for (const e of c.examples) assert.doesNotMatch(e.label, /scared|afraid|fearful|stress|nervous|anxious|happy/i, 'visible facts only');
});

test('every card example is a timestamped https link with a label', () => {
  for (const c of CARDS.filter((x) => x.examples)) {
    for (const e of c.examples) {
      assert.match(e.url, /^https:\/\//, `${c.id} ${e.url}`);
      assert.ok(typeof e.label === 'string' && e.label.length > 0, c.id);
    }
  }
});

test('each card asks a question that fits its answer: action cards ask what to do, not what the dog is telling you', async () => {
  const { askFor, DEFAULT_ASK } = await import('../learn-content.js');
  assert.match(DEFAULT_ASK, /telling you\?$/);
  // These cards' right answers are a next step for the owner, not a reading of a signal.
  const action = ['c-sound', 'c-door-knock', 'c-one-step', 'c-visitor-touch', 'c-sniff', 'c-route', 'c-make-space', 'c-see-first'];
  for (const id of action) {
    const c = CARDS.find((x) => x.id === id);
    assert.ok(c, id);
    const q = askFor(c);
    assert.doesNotMatch(q, /telling you/i, `${id}: "${q}" does not fit an action answer`);
    assert.match(q, /\?$/, `${id}: ask is a question`);
    assert.match(q, /\b(do|next|help)\b/i, `${id}: asks for an action`);
  }
  // Reading cards keep the default question.
  for (const id of ['c-loose', 'c-whale', 'c-yawn']) assert.equal(askFor(CARDS.find((x) => x.id === id)), DEFAULT_ASK, id);
  // No card asks two questions: the scenario is a statement, the ask is the only question.
  for (const c of CARDS) assert.doesNotMatch(c.context.trim(), /\?$/, `${c.id}: context ends in a question; move it to ask`);
  // The quiz renders the per-card ask, not a hard-coded line.
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../learn.js', import.meta.url), 'utf8');
  assert.match(src, /askFor\(c\)/);
  assert.doesNotMatch(src, /<p class="k">What is this dog most likely telling you\?<\/p>/);
});

test('c-stretch-reach card: a long stretch to take food from a stranger, back feet planted, reads as wanting the food but not the closeness', async () => {
  const c = CARDS.find((x) => x.id === 'c-stretch-reach');
  assert.ok(c, 'c-stretch-reach card exists');
  assert.equal(c.lesson, 'consent');
  assert.equal(c.art.prop, 'person', 'stranger-directed: the trigger is a person');
  assert.match(c.context, /stretch/i);
  assert.match(c.context, /back (feet|legs)/i, 'weight stays back');
  assert.match(c.context, /bend/i, 'the person bends over him');
  assert.match(c.context, /pet/i, 'the person wants to pet next');
  const { askFor, DEFAULT_ASK } = await import('../learn-content.js');
  assert.equal(askFor(c), DEFAULT_ASK, 'a reading card');
  const right = c.choices[c.answer];
  assert.match(right, /food/i);
  assert.match(right, /not (yet )?sure|unsure|not ready/i);
  assert.match(right, /close/i);
  assert.ok(c.choices.some((x, i) => i !== c.answer && /relaxed|likes him|fine/i.test(x)), 'a distractor: he is fine with him now');
  assert.ok(c.choices.some((x, i) => i !== c.answer && /steal|sneak/i.test(x)), 'a distractor: he is being sneaky');
  assert.ok(c.choices.some((x, i) => i !== c.answer && /play/i.test(x)), 'a distractor: an invitation to play');
  assert.deepEqual(c.evidence, ['pedretti2023-appeasement-function-of-displacement-behaviours-dogs-behavioural-displays', 'avsab2021-position-statement-on-humane-dog-training']);
  assert.ok(c.sources.includes(SRC.pedretti2023) && c.sources.includes(SRC.avsabHumane));
  // pedretti2023 full text (PMC10066101): 26/53 "reactive" to a slow, bent-over, staring approach vs 11/53 to a friendly one.
  assert.match(c.explain, /26 of 53/);
  assert.match(c.explain, /11 of 53/);
  assert.match(c.explain, /bent/i);
  assert.match(c.explain, /trainer/i, 'the stretch reading is a trainer reading, stated as such');
  assert.match(c.explain, /not a (measured|tested)/i);
  assert.match(c.explain, /straighten|stand up/i, 'what the person can change');
  assert.match(c.explain, /toss/i);
  assert.ok(Array.isArray(c.examples) && c.examples.length >= 2);
  for (const e of c.examples) {
    assert.match(e.url, /^https:\/\/www\.youtube\.com\/watch\?v=NVJE2NpUVaQ&t=\d+s$/);
    assert.match(e.label, /\(\d+:\d\d( to \d+:\d\d)?/);
  }
});

test('c-see-first card: start the treats once he has seen the person, not before; the order rule is stated as a trainer rule, not a tested finding', async () => {
  const c = CARDS.find((x) => x.id === 'c-see-first');
  assert.ok(c, 'c-see-first card exists');
  assert.equal(c.lesson, 'threshold');
  assert.equal(c.art.prop, 'person', 'stranger-directed: the trigger is a person');
  assert.match(c.context, /not (yet )?seen/i, 'he has not noticed the person yet');
  const { askFor, DEFAULT_ASK } = await import('../learn-content.js');
  assert.notEqual(askFor(c), DEFAULT_ASK, 'an action card');
  assert.match(askFor(c), /\b(do|next|when)\b.*\?$/i);
  const right = c.choices[c.answer];
  assert.match(right, /(has )?seen/i);
  assert.match(right, /then/i, 'food comes after the look');
  assert.match(right, /further|distance/i, 'if he cannot eat, add distance');
  assert.doesNotMatch(right, /before he sees|quiet the whole/i);
  assert.ok(c.choices.some((x, i) => i !== c.answer && /before he (sees|has seen)/i.test(x)), 'a distractor: feed before he sees the person');
  assert.ok(c.choices.some((x, i) => i !== c.answer && /quiet/i.test(x)), 'a distractor: food only if he stays quiet');
  assert.ok(c.choices.some((x, i) => i !== c.answer && /nose/i.test(x) && /cannot see|can\u2019t see|can't see/i.test(x)), 'a distractor: block his view with a treat');
  assert.deepEqual(c.evidence, ['shnookal2025-exploring-trainer-insights-and-understanding-of-on-lead', 'riemer2023-therapy-and-prevention-of-noise-fears-in-dogs', 'avsab2021-position-statement-on-humane-dog-training']);
  for (const s of [SRC.shnookal2025, SRC.riemer2023, SRC.latEastBay, SRC.avsabHumane]) assert.ok(c.sources.includes(s), s);
  assert.match(c.explain, /order/i);
  assert.match(c.explain, /trainer/i);
  assert.match(c.explain, /no study|not (been )?tested/i, 'the order rule is not a trial result');
  assert.match(c.explain, /ten trainers/i);
  assert.match(c.explain, /unclear/i);
  assert.match(c.explain, /some support/i, 'riemer2023: some support for counterconditioning, noise fears');
  assert.match(c.explain, /nois/i, 'states the review was about noise fears');
  assert.match(c.explain, /reward-based/i);
  assert.match(c.explain, /consultant/i);
  assert.doesNotMatch(c.explain, /proven|always|guarantee|cure|stress score|happy|fearful|afraid|is dominant/i);
  assert.ok(Array.isArray(c.examples) && c.examples.length >= 2);
  for (const e of c.examples) {
    assert.match(e.url, /^https:\/\/www\.youtube\.com\/watch\?v=V3rAm-qoV7A&t=\d+s$/, e.url);
    assert.match(e.label, /\(\d+:\d\d( to \d+:\d\d)?/);
    assert.doesNotMatch(e.label, /scared|afraid|fearful|stress|nervous|anxious|happy/i, 'visible facts only');
  }
  assert.ok(c.examples.some((e) => /person|jogger/i.test(e.label)), 'an example with a person passing');
  assert.ok(c.examples.some((e) => /estimate|not readable/i.test(e.label)), 'distances from frames are flagged as estimates');
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
