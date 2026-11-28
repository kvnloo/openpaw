// The app side of the collar's chest-strap link: "Pair strap to collar" sends control 0x30,
// "Forget strap" sends 0x31 (firmware/openpaw-collar/openpaw-collar.ino ctrl_write_cb), and the
// bpm the collar logs in each record (hr_bpm + flag HR_VALID) is shown under Right now.
// The collar does not report the strap link itself, so the app reads it from the records.
// node --test app/test/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CMD_STRAP_PAIR, CMD_STRAP_FORGET, collarHr, strapStatus, FLAGS } from '../openpaw-ble.js';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const ino = readFileSync(new URL('../../firmware/openpaw-collar/openpaw-collar.ino', import.meta.url), 'utf8');
const core = readFileSync(new URL('../../firmware/openpaw-collar/openpaw_core.h', import.meta.url), 'utf8');

test('pair and forget are the control bytes the sketch handles', () => {
  assert.deepEqual([...CMD_STRAP_PAIR], [0x30]);
  assert.deepEqual([...CMD_STRAP_FORGET], [0x31]);
  const cb = ino.slice(ino.indexOf('static void ctrl_write_cb'), ino.indexOf('static void connect_cb'));
  assert.match(cb, /data\[0\] == 0x30\)[^\n]*\n\s*g_strap_pair_req = true/);
  assert.match(cb, /data\[0\] == 0x31\)[^\n]*\n\s*g_strap_forget_req = true/);
});

const rec = (o) => ({ hr_bpm: 0, flags: 0, no_sample: false, ...o });

test('collarHr reads the bpm only from a record flagged HR_VALID', () => {
  assert.equal(collarHr(rec({ hr_bpm: 72, flags: FLAGS.HR_VALID })), 72);
  assert.equal(collarHr(rec({ hr_bpm: 72, flags: FLAGS.HR_VALID | FLAGS.LOWRATE })), 72);
  assert.equal(collarHr(rec({ hr_bpm: 72, flags: 0 })), null, 'no HR_VALID flag');
  assert.equal(collarHr(rec({ hr_bpm: 0, flags: FLAGS.HR_VALID })), null, '0 bpm is no reading');
  assert.equal(collarHr(rec({ hr_bpm: 72, flags: FLAGS.HR_VALID | FLAGS.NOSAMPLE, no_sample: true })), null);
  assert.equal(collarHr(null), null);
});

test('strapStatus: nothing asked and no bpm seen says nothing', () => {
  assert.equal(strapStatus({ now: 1e6 }), null);
});

test('strapStatus: looking during the 30 s pair window plus a 15 s grace for the next records', () => {
  const askedAt = 1e6;
  for (const dt of [0, 10e3, 44e3]) {
    const s = strapStatus({ askedAt, now: askedAt + dt });
    assert.equal(s.state, 'looking', String(dt));
    assert.match(s.text, /30 s/);
    assert.match(s.text, /wet/i);
  }
  assert.match(core, /#define OPENPAW_STRAP_PAIR_MS 30000u/, 'the window the text promises');
});

test('strapStatus: no bpm after the window says what to check and which firmware cannot pair', () => {
  const s = strapStatus({ askedAt: 1e6, now: 1e6 + 46e3 });
  assert.equal(s.state, 'none');
  assert.match(s.text, /pair again/i);
  assert.match(s.text, /0\.4\.0/);
});

test('strapStatus: a bpm in a record after the ask means linked, with the value', () => {
  const s = strapStatus({ askedAt: 1e6, lastHrAt: 1e6 + 12e3, lastHr: 81, now: 1e6 + 14e3 });
  assert.equal(s.state, 'linked');
  assert.match(s.text, /81 bpm/);
  // a strap paired before this page was opened is shown too
  assert.equal(strapStatus({ lastHrAt: 5e5, lastHr: 70, now: 5e5 + 5e3 }).state, 'linked');
});

test('strapStatus: bpm stops for more than 30 s -> lost, the collar keeps retrying for an hour', () => {
  const s = strapStatus({ askedAt: 1e6, lastHrAt: 1e6 + 12e3, lastHr: 81, now: 1e6 + 12e3 + 31e3 });
  assert.equal(s.state, 'lost');
  assert.match(s.text, /hour/);
  assert.match(core, /#define OPENPAW_STRAP_GIVEUP_MS 3600000u/, 'the hour the text promises');
});

test('strapStatus: forget wins over older bpm and asks; a later ask starts looking again', () => {
  assert.equal(strapStatus({ askedAt: 1e6, lastHrAt: 1e6 + 5e3, lastHr: 80, forgotAt: 1e6 + 9e3, now: 1e6 + 10e3 }).state, 'forgotten');
  assert.equal(strapStatus({ forgotAt: 1e6, askedAt: 1e6 + 5e3, now: 1e6 + 6e3 }).state, 'looking');
});

test('Device & data has the two strap buttons, disabled until a collar connects', () => {
  const dev = html.slice(html.indexOf('id="dv-h"'), html.indexOf('</section>', html.indexOf('id="dv-h"')));
  assert.match(dev, /<button id="btnStrapPair" class="btn" disabled>Pair strap to collar<\/button>/);
  assert.match(dev, /<button id="btnStrapForget" class="btn" disabled>Forget strap<\/button>/);
  assert.match(dev, /id="strapState"[^>]*aria-live="polite"/);
});

test('the script sends the commands, reads bpm from live records and disables the buttons on disconnect', () => {
  const js = html.slice(html.indexOf('<script type="module">'));
  assert.match(js, /\$\('btnStrapPair'\)\.onclick[\s\S]{0,300}writeValue\(CMD_STRAP_PAIR\)/);
  assert.match(js, /\$\('btnStrapForget'\)\.onclick[\s\S]{0,300}writeValue\(CMD_STRAP_FORGET\)/);
  const show = js.slice(js.indexOf('function show(rec)'), js.indexOf('// ---------- collar ----------'));
  assert.match(show, /collarHr\(rec\)/);
  const disc = js.slice(js.indexOf("'gattserverdisconnected'"), js.indexOf("'gattserverdisconnected'") + 500);
  assert.match(disc, /btnStrapPair'\)\.disabled = true/);
  assert.match(disc, /btnStrapForget'\)\.disabled = true/);
  const conn = js.slice(js.indexOf("$('btnSync').disabled = false"));
  assert.match(conn.slice(0, 200), /btnStrapPair'\)\.disabled = false/);
});

test('forget and disconnect take a collar-logged bpm off Right now (no stale value)', () => {
  const js = html.slice(html.indexOf('<script type="module">'));
  const forget = js.slice(js.indexOf("$('btnStrapForget').onclick"), js.indexOf("$('btnStrapForget').onclick") + 400);
  assert.match(forget, /hideCollarHr\(\)/);
  const disc = js.slice(js.indexOf("'gattserverdisconnected'"), js.indexOf("'gattserverdisconnected'") + 500);
  assert.match(disc, /hideCollarHr\(\)/);
  assert.match(js, /function hideCollarHr\(\)[^}]*via the collar[^}]*hidden = true/);
});

test('Right now names where the bpm came from', () => {
  assert.match(html, /<p class="note" id="mHr" hidden>Heart rate <span data-k="hrsrc">[^<]*<\/span> <b class="hr-chip">/);
  assert.match(html, /via the collar/);
});
