// OpenPaw Field mode: one-handed / hands-free walk companion.
// Web prototype of the planned smart-glasses experience (docs/GLASSES.md).
// Every tap or spoken word becomes an OpenPaw v0.1 owner event in the shared local store (app/store.js).
// Measurements and owner observations only: no diagnosis, no emotion-as-fact, no stress score.
// No third-party network requests; camera frames never leave the device.
// SPDX-License-Identifier: GPL-3.0-only

import * as S from './store.js';
import { UUIDS, decodeRecord, decodeStatus, recordToEvents, makeClock } from './openpaw-ble.js';
import { episodesFrom, consultRows, ownerRows, vetRows } from './episodes.js';
import { SESSION_SIGNS, sessionAdvice, sessionCheckPayload } from './session-check.js';

const $ = (id) => document.getElementById(id);
const SOURCE = 'openpaw-field';
const EP_KEY = 'field:openEpisode';

// ---------------------------------------------------------------- vocabulary
// metric names: kept apart from the tracker metrics (track.*) used by track.html.
export const ACTS = {
  trigger: { kind: 'trigger', metric: 'trigger.seen', label: 'Trigger' },
  reaction: { kind: 'observation', metric: 'behavior.reacted', label: 'Reaction' },
  calm: { kind: 'observation', metric: 'behavior.calm', label: 'Calm' },
  treat: { kind: 'intervention', metric: 'intervention.reward', label: 'Treat' },
  turn: { kind: 'intervention', metric: 'intervention.distance', label: 'U-turn' },
  tags: { kind: 'observation', metric: 'body_language.tags', label: 'Body language' },
  check: { kind: 'observation', metric: 'session.check', label: 'Session check' },
};
export const BANDS = { '<10': [0, 10], '10-20': [10, 20], '20-40': [20, 40], '40+': [40, null] };
const BAND_LABEL = { '<10': '<10 ft', '10-20': '10–20 ft', '20-40': '20–40 ft', '40+': '40+ ft' };
// Observable body signals (owner-chosen). Descriptions of the body, never of feelings.
export const BODY_TAGS = ['hard stare', 'freeze', 'lip lick', 'whale eye', 'ears back', 'ears forward', 'tail high', 'tail tucked',
  'weight forward', 'hackles up', 'closed mouth', 'yawn', 'scanning', 'sniffing', 'loose wiggly', 'soft eyes', 'took treat', 'refused treat'];

// Spoken word -> action. Also pulls a distance out of phrases like "trigger thirty feet".
const NUM = { five: 5, ten: 10, fifteen: 15, twenty: 20, 'twenty five': 25, thirty: 30, forty: 40, fifty: 50, sixty: 60, hundred: 100 };
export function parseSpeech(text) {
  const t = ` ${text.toLowerCase().replace(/[^a-z0-9 ]/g, ' ')} `;
  let act = null;
  if (/\b(trigger|stranger|person|dog ahead|incoming)\b/.test(t)) act = 'trigger';
  else if (/\b(react|reaction|reacting|lunge|lunging|barking)\b/.test(t)) act = 'reaction';
  else if (/\b(calm|settled|recovered|done)\b/.test(t)) act = 'calm';
  else if (/\b(treat|reward|good)\b/.test(t)) act = 'treat';
  else if (/\b(turn|u turn|uturn|distance|away)\b/.test(t)) act = 'turn';
  if (!act) return null;
  let ft = null;
  const d = t.match(/\b(\d{1,3})\b/);
  if (d) ft = Number(d[1]);
  else for (const [w, n] of Object.entries(NUM).sort((a, b) => b[0].length - a[0].length)) if (t.includes(` ${w} `)) { ft = n; break; }
  return { act, band: ft == null ? null : bandFor(ft) };
}
export function bandFor(ft) { return ft < 10 ? '<10' : ft < 20 ? '10-20' : ft < 40 ? '20-40' : '40+'; }
export function fmt(s) { s = Math.max(0, Math.round(s)); const m = Math.floor(s / 60); return `${m}:${String(s % 60).padStart(2, '0')}`; }

// ---------------------------------------------------------------- state
let dog = 'my-dog';
let ep = null;          // open episode: { id, start (ms), band, cls, reactionAt, chain: [{act, t}] }
let lastDone = null;    // last closed episode summary, for the status card
const walkLog = [];     // events stored from this page this session (newest first)

async function persistEpisode() { await S.setMeta(EP_KEY, ep); }

// ---------------------------------------------------------------- feedback
const buzz = (p) => { if ($('optBuzz').checked && navigator.vibrate) navigator.vibrate(p); };
let actx = null;
function tone(freq = 660, ms = 120) {
  if (!$('optTone').checked) return;
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = 'sine'; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, actx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.18, actx.currentTime + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + ms / 1000);
    o.connect(g).connect(actx.destination); o.start(); o.stop(actx.currentTime + ms / 1000 + 0.02);
  } catch (_) { /* audio unavailable */ }
}
function speak(text) {
  if (!$('optSpeak').checked || !('speechSynthesis' in window) || !('SpeechSynthesisUtterance' in window)) return;
  try { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(text); u.rate = 1.1; u.lang = 'en-US'; speechSynthesis.speak(u); } catch (_) { /* no voice */ }
}
let toastT = 0;
function toast(msg) { const el = $('toast'); el.textContent = msg; el.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('on'), 1800); }

// ---------------------------------------------------------------- HUD preview (what the Display glasses would show)
const GLYPHS = {
  idle: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="9" opacity=".4"/></svg>',
  trigger: '<svg viewBox="0 0 24 24"><path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17v.5"/></svg>',
  reaction: '<svg viewBox="0 0 24 24"><path d="M3 12c2-4 4-4 6 0s4 4 6 0 4-4 6 0"/><path d="M12 3v3M12 18v3" opacity=".5"/></svg>',
  turn: '<svg viewBox="0 0 24 24"><path d="M8 20V9a5 5 0 0 1 10 0v4"/><path d="m14 10 4 4 4-4"/></svg>',
  treat: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="7"/><path d="M9 12h6"/></svg>',
  calm: '<svg viewBox="0 0 24 24"><path d="m5 12 4 4 10-10"/></svg>',
};
let hudHold = 0; // keep a transient cue up for a moment before the live episode line returns
function hud(tone_, glyph, text, sub, holdMs = 0) {
  $('hud').dataset.tone = tone_;
  $('hudGlyph').innerHTML = GLYPHS[glyph] || GLYPHS.idle;
  $('hudText').innerHTML = '';
  $('hudText').append(document.createTextNode(text));
  if (sub) { const s = document.createElement('small'); s.textContent = sub; $('hudText').append(s); }
  if (holdMs) hudHold = Date.now() + holdMs;
}

// ---------------------------------------------------------------- render
const CHAIN_LABEL = (c) => (c.act === 'trigger' ? `Trigger ${c.band ? BAND_LABEL[c.band] : '?'}` : ACTS[c.act]?.label || c.act);
function render() {
  const st = $('status');
  $('chain').innerHTML = '';
  if (ep) {
    const reacted = ep.chain.some((c) => c.act === 'reaction');
    st.dataset.phase = reacted ? 'reaction' : 'trigger';
    $('statusLabel').textContent = `Episode open · ${ep.id.slice(-6)}`;
    $('phase').firstChild.textContent = reacted ? 'Reacting' : 'Trigger in view';
    $('phaseSub').textContent = reacted ? 'Create distance. Tap Calm again when settled.' : `${ep.cls ? `${ep.cls}, ` : ''}${ep.band ? BAND_LABEL[ep.band] : 'distance unknown'}. Breathe.`;
    ep.chain.slice(-3).forEach((c) => { const s = document.createElement('span'); s.className = `k-${c.act}`; s.textContent = `${fmt((c.t - ep.start) / 1000)} ${CHAIN_LABEL(c)}`; $('chain').append(s); });
  } else if (lastDone) {
    st.dataset.phase = 'calm';
    $('statusLabel').textContent = `Last episode · ${lastDone.id.slice(-6)}`;
    $('phase').firstChild.textContent = 'Calm again';
    $('phaseSub').innerHTML = '';
    $('phaseSub').append(document.createTextNode('Time to calm '));
    const b = document.createElement('b'); b.id = 'ttc'; b.textContent = fmt(lastDone.ttc); b.style.color = 'var(--calm)'; $('phaseSub').append(b);
    if (lastDone.fromReaction != null) $('phaseSub').append(document.createTextNode(` · ${fmt(lastDone.fromReaction)} after reaction`));
    $('timer').textContent = fmt(lastDone.ttc);
    (lastDone.chain || []).slice(-3).forEach((c) => { const s = document.createElement('span'); s.className = `k-${c.act}`; s.textContent = `${fmt((c.t - lastDone.start) / 1000)} ${CHAIN_LABEL(c)}`; $('chain').append(s); });
  } else {
    st.dataset.phase = 'idle';
    $('statusLabel').textContent = 'Walk · no open episode';
    $('phase').firstChild.textContent = 'Ready';
    $('phaseSub').textContent = 'Tap when you spot a trigger.';
    $('timer').textContent = '0:00';
  }
  $('btnUndo').disabled = !walkLog.length;
  renderLog();
  renderEpisode();
}

// Last episode in the Owner / Behavior-consultant / Vet lens shapes (app/episodes.js), from everything on record.
const LENS = {
  owner: ['Owner view', (eps) => ownerRows(eps[eps.length - 1], eps[eps.length - 2] || null)],
  consult: ['Consultant view', (eps) => consultRows(eps[eps.length - 1], eps[eps.length - 2] || null)],
  vet: ['Vet view', (eps) => vetRows(eps)],
};
let lens = 'consult';
for (const b of document.querySelectorAll('#epLens [data-lens]')) {
  b.addEventListener('click', () => {
    lens = b.dataset.lens;
    for (const o of document.querySelectorAll('#epLens [data-lens]')) o.setAttribute('aria-pressed', String(o === b));
    renderEpisode();
  });
}
async function renderEpisode() {
  const eps = episodesFrom(await S.allEvents());
  const box = $('epRows');
  if (!eps.length) return;
  const last = eps[eps.length - 1];
  const open = !last.end;
  const [label, rowsOf] = LENS[lens];
  $('epLabel').textContent = `${label} · ${new Date(last.start).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}${open ? ' · open' : ''}`;
  box.innerHTML = '';
  for (const [k, v] of rowsOf(eps)) {
    const row = document.createElement('div');
    const dt = document.createElement('dt'); dt.className = 'micro'; dt.textContent = k;
    const dd = document.createElement('dd'); dd.textContent = v;
    row.append(dt, dd); box.append(row);
  }
}

function renderLog() {
  const ol = $('log');
  ol.innerHTML = '';
  $('logCount').textContent = `This walk · ${walkLog.length} marked`;
  if (!walkLog.length) { const li = document.createElement('li'); li.className = 'empty'; li.textContent = 'Nothing marked yet.'; ol.append(li); return; }
  for (const e of walkLog.slice(0, 30)) {
    const li = document.createElement('li');
    const t = document.createElement('time'); t.textContent = new Date(e.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }).replace(/\s?[AP]M$/i, '');
    const d = document.createElement('span'); d.textContent = describe(e);
    const p = document.createElement('span'); p.className = 'ep'; p.textContent = e.episode_id ? `ep ${e.episode_id.slice(-4)}` : '';
    li.append(t, d, p); ol.append(li);
  }
}
function describe(e) {
  const p = e.payload;
  switch (p.metric) {
    case 'trigger.seen': return `Trigger${p.trigger_class ? ` (${p.trigger_class})` : ''} · ${p.value ? BAND_LABEL[p.value] : 'distance ?'}`;
    case 'behavior.reacted': return 'Reaction';
    case 'behavior.calm': return `Calm again · ${fmt(p.value)} to calm`;
    case 'intervention.reward': return 'Treat / reward';
    case 'intervention.distance': return 'U-turn / distance';
    case 'body_language.tags': return `Body: ${p.value.join(', ')}${p.seen === 'before_reaction' ? ' · seen before the reaction' : ''}${p.photo ? ' · photo kept' : ''}`;
    case 'session.check': return `Session check · ${p.value.length ? p.value.join(', ') : 'no stop signs marked'}`;
    case 'owner.retract': return 'Undid last entry';
    default: return p.metric;
  }
}

// live timer + HUD line, 4x a second
function tick() {
  if (ep) {
    const s = (Date.now() - ep.start) / 1000;
    $('timer').textContent = fmt(s);
    if (Date.now() > hudHold) {
      const reacted = ep.chain.some((c) => c.act === 'reaction');
      if (reacted) hud('reaction', 'turn', 'Breathe · U-turn', fmt(s));
      else hud('trigger', 'trigger', `Trigger ${ep.band ? BAND_LABEL[ep.band] : ''}`.trim(), fmt(s));
    }
  } else if (Date.now() > hudHold) {
    if (lastDone) hud('calm', 'calm', 'Calm again', `in ${fmt(lastDone.ttc)}`);
    else hud('idle', 'idle', 'Walking', 'OpenPaw');
  }
}

// ---------------------------------------------------------------- core: mark an action
async function save(evs) {
  await S.putEvents(evs);
  walkLog.unshift(...evs.slice().reverse());
}

// act: trigger|reaction|calm|treat|turn ; opts: { band, cls, via, evidence }
export async function mark(act, opts = {}) {
  const now = Date.now();
  const via = opts.via || 'tap';
  const spec = ACTS[act];
  const extra = { input: via };
  if (opts.transcript) extra.transcript = opts.transcript;
  let value = null, unit = null;

  if (act === 'trigger' || ((act === 'reaction') && !ep)) {
    if (!ep) ep = { id: S.uid('ep'), start: now, band: null, cls: null, reactionAt: null, chain: [] };
  }
  if (act === 'trigger') {
    if (opts.band) ep.band = opts.band;
    if (opts.cls) ep.cls = opts.cls;
    value = opts.band || null; unit = opts.band ? 'ft' : null;
    extra.distance_band_ft = opts.band ? BANDS[opts.band] : null;
    extra.distance_method = opts.band ? 'owner estimate' : null;
    extra.trigger_class = opts.cls || null;
  }
  if (act === 'reaction' && ep && ep.reactionAt == null) ep.reactionAt = now;
  if (act === 'reaction') value = true;
  if (act === 'treat') value = 'treat';
  if (act === 'turn') value = 'u-turn';

  let closed = null;
  if (act === 'calm') {
    if (!ep) { toast('No open episode'); buzz(30); return null; }
    const ttc = (now - ep.start) / 1000;
    value = Math.round(ttc); unit = 's';
    extra.time_to_calm_s = Math.round(ttc);
    extra.episode_started_at = new Date(ep.start).toISOString();
    extra.reaction_to_calm_s = ep.reactionAt != null ? Math.round((now - ep.reactionAt) / 1000) : null;
    extra.trigger_distance_band = ep.band;
    extra.method = 'owner-marked: from first mark of episode to Calm again';
    closed = { id: ep.id, ttc, fromReaction: extra.reaction_to_calm_s, start: ep.start, chain: ep.chain };
  }

  const e = S.ownerEvent({ dog, kind: spec.kind, metric: spec.metric, value, unit, episodeId: ep ? ep.id : null,
    sourceId: SOURCE, extra, evidence: opts.evidence || [] });
  if (ep) ep.chain.push({ act, t: now, band: act === 'trigger' ? opts.band || null : undefined, eventId: e.event_id });
  if (closed) closed.chain = ep.chain.slice();
  await save([e]);

  // cues: short, distinct per action
  const cue = {
    trigger: () => { tone(880, 110); buzz([40]); hud('trigger', 'trigger', `Trigger ${opts.band ? BAND_LABEL[opts.band] : ''}`.trim(), '0:00'); speak(`Trigger${opts.band ? `, ${BAND_LABEL[opts.band].replace('ft', 'feet')}` : ''}. Breathe.`); },
    reaction: () => { tone(520, 160); buzz([60, 60, 60]); hud('reaction', 'turn', 'Breathe · U-turn', fmt((now - ep.start) / 1000), 2500); speak('Breathe. U-turn.'); },
    treat: () => { tone(990, 70); buzz(25); hud('trigger', 'treat', 'Treat marked', ep ? fmt((now - ep.start) / 1000) : '', 1500); },
    turn: () => { tone(740, 90); buzz([30, 40, 30]); hud('trigger', 'turn', 'Distance', ep ? fmt((now - ep.start) / 1000) : '', 1500); speak('Distance.'); },
    calm: () => { tone(660, 90); setTimeout(() => tone(880, 140), 110); buzz([20, 60, 20]); hud('calm', 'calm', 'Calm again', `in ${fmt(closed.ttc)}`, 4000); speak(`Calm in ${Math.round(closed.ttc)} seconds.`); },
  }[act];
  if (cue) cue();
  const btn = { trigger: 'aTrigger', reaction: 'aReaction', calm: 'aCalm', treat: 'aTreat', turn: 'aTurn' }[act];
  if (btn) { $(btn).classList.remove('flash'); void $(btn).offsetWidth; $(btn).classList.add('flash'); }

  if (closed) { lastDone = closed; ep = null; }
  await persistEpisode();
  hidePrompt();
  render();
  return e;
}

// ---------------------------------------------------------------- distance sheet
let pendingClass = null;
function openDistance() {
  pendingClass = null;
  document.querySelectorAll('#trigClass .chip').forEach((c) => c.setAttribute('aria-pressed', 'false'));
  $('distSheet').hidden = false;
  buzz(15);
  $('distChips').querySelector('[data-band="20-40"]').focus({ preventScroll: true });
}
const closeDistance = () => { $('distSheet').hidden = true; };
$('trigClass').addEventListener('click', (ev) => {
  const c = ev.target.closest('.chip'); if (!c) return;
  const on = c.getAttribute('aria-pressed') !== 'true';
  document.querySelectorAll('#trigClass .chip').forEach((x) => x.setAttribute('aria-pressed', 'false'));
  c.setAttribute('aria-pressed', String(on)); pendingClass = on ? c.dataset.class : null;
});
$('distChips').addEventListener('click', (ev) => {
  const b = ev.target.closest('button[data-band]'); if (!b) return;
  closeDistance(); mark('trigger', { band: b.dataset.band, cls: pendingClass });
});
$('distSkip').onclick = () => { closeDistance(); mark('trigger', { band: null, cls: pendingClass }); };
$('distCancel').onclick = closeDistance;
$('distSheet').addEventListener('click', (ev) => { if (ev.target === $('distSheet')) closeDistance(); });

// ---------------------------------------------------------------- action pad
$('aTrigger').onclick = openDistance;
$('aReaction').onclick = () => mark('reaction');
$('aCalm').onclick = () => mark('calm');
$('aTreat').onclick = () => mark('treat');
$('aTurn').onclick = () => mark('turn');

$('btnUndo').onclick = async () => {
  const last = walkLog.find((e) => e.payload.metric !== 'owner.retract');
  if (!last) return;
  const r = S.retractEvent(dog, last.event_id);
  r.provenance.source_id = SOURCE; r.episode_id = last.episode_id;
  await S.putEvents([r]);
  walkLog.splice(walkLog.indexOf(last), 1);
  // keep the open episode consistent with what is now on record
  if (ep) {
    ep.chain = ep.chain.filter((c) => c.eventId !== last.event_id);
    if (!ep.chain.length) ep = null;
    else if (!ep.chain.some((c) => c.act === 'reaction')) ep.reactionAt = null;
  } else if (last.payload.metric === 'behavior.calm' && lastDone && lastDone.id === last.episode_id) {
    toast('Calm undone; episode stays closed. Mark again if needed.');
  }
  await persistEpisode();
  buzz(20); toast('Undone'); render();
};

// ---------------------------------------------------------------- body-language tags (+ optional snapshot)
let snapDataUrl = null;
function openTags(withSnapshot) {
  const box = $('tagChips'); box.innerHTML = '';
  for (const t of BODY_TAGS) {
    const b = document.createElement('button'); b.className = 'chip'; b.textContent = t; b.dataset.tag = t; b.setAttribute('aria-pressed', 'false');
    b.onclick = () => { b.setAttribute('aria-pressed', String(b.getAttribute('aria-pressed') !== 'true')); $('tagSave').disabled = !box.querySelector('[aria-pressed="true"]'); };
    box.append(b);
  }
  $('tagSave').disabled = true;
  // After Reaction, the owner can say the signs came earlier; they then count as recalled precursors (app/episodes.js).
  $('beforeRow').hidden = !(ep && ep.reactionAt != null);
  $('optBefore').checked = false;
  $('snapPreview').hidden = !withSnapshot;
  $('tagSheet').hidden = false;
}
$('btnTag').onclick = () => { snapDataUrl = null; openTags(false); };
$('tagCancel').onclick = () => { $('tagSheet').hidden = true; snapDataUrl = null; };
$('tagSave').onclick = async () => {
  const tags = [...$('tagChips').querySelectorAll('[aria-pressed="true"]')].map((b) => b.dataset.tag);
  const keep = Boolean(snapDataUrl) && $('optKeepPhoto').checked;
  const extra = { input: snapDataUrl ? 'camera-snapshot' : 'tap', tag_vocabulary: 'openpaw-field/1', photo_kept: keep };
  if (!$('beforeRow').hidden && $('optBefore').checked) extra.seen = 'before_reaction';
  if (keep) { extra.photo = snapDataUrl; extra.photo_consent = 'owner chose to keep this photo on this device'; }
  const e = S.ownerEvent({ dog, kind: 'observation', metric: ACTS.tags.metric, value: tags, episodeId: ep ? ep.id : null, sourceId: SOURCE, extra });
  if (ep) ep.chain.push({ act: 'tags', t: Date.now(), eventId: e.event_id });
  await save([e]); await persistEpisode();
  $('tagSheet').hidden = true; snapDataUrl = null;
  buzz(25); toast(`Saved ${tags.length} tag${tags.length > 1 ? 's' : ''}${keep ? ' + photo' : ''}`); render();
};

// ---------------------------------------------------------------- session check (stop rule, app/session-check.js)
for (const s of SESSION_SIGNS) {
  const b = document.createElement('button'); b.className = 'chip'; b.textContent = s; b.dataset.sign = s; b.setAttribute('aria-pressed', 'false');
  b.onclick = () => b.setAttribute('aria-pressed', String(b.getAttribute('aria-pressed') !== 'true'));
  $('checkChips').append(b);
}
$('checkSave').onclick = async () => {
  const chips = [...$('checkChips').querySelectorAll('[aria-pressed="true"]')];
  const signs = chips.map((b) => b.dataset.sign);
  const p = sessionCheckPayload(signs);
  const advice = sessionAdvice(signs);
  const e = S.ownerEvent({ dog, kind: 'observation', metric: p.metric, value: p.value, episodeId: ep ? ep.id : null, sourceId: SOURCE, extra: { input: 'tap', ...p.extra } });
  if (ep) ep.chain.push({ act: 'check', t: Date.now(), eventId: e.event_id });
  await save([e]); await persistEpisode();
  chips.forEach((b) => b.setAttribute('aria-pressed', 'false'));
  $('checkAdvice').textContent = advice.text;
  if (advice.stop) { buzz([60, 60, 60]); hud('reaction', 'turn', 'Stop · add distance', '', 4000); speak('Stop, or move further away.'); }
  else buzz(20);
  toast(advice.stop ? 'Logged · stop or add distance' : 'Logged · no stop signs');
  render();
};

// ---------------------------------------------------------------- camera (getUserMedia, rear camera, local only)
let stream = null;
$('btnCam').onclick = async () => {
  if (stream) { stopCam(); return; }
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { $('camPh').textContent = 'No camera access in this browser.'; return; }
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } }, audio: false });
    const v = document.createElement('video'); v.playsInline = true; v.muted = true; v.srcObject = stream; v.id = 'camVideo';
    $('cam').querySelector('video')?.remove(); $('camPh').hidden = true; $('cam').prepend(v); await v.play();
    $('cam').classList.add('live'); $('btnSnap').disabled = false; $('btnCam').textContent = 'Stop camera';
    startVisionLoop(v);
  } catch (e) { stream = null; $('camPh').textContent = `Camera unavailable: ${e.name || e.message}`; }
};
function stopCam() {
  stream?.getTracks().forEach((t) => t.stop()); stream = null;
  $('cam').querySelector('video')?.remove(); $('camPh').hidden = false; $('camPh').textContent = 'Camera off. Frames are never uploaded.';
  $('cam').classList.remove('live'); $('btnSnap').disabled = true; $('btnCam').textContent = 'Start camera';
}
$('btnSnap').onclick = () => {
  const v = $('camVideo'); if (!v) return;
  // Downscale to 480 px on the long edge: enough to jog the owner's memory, small enough for IndexedDB.
  const k = 480 / Math.max(v.videoWidth || 480, v.videoHeight || 360);
  const c = $('snapPreview'); c.width = Math.round((v.videoWidth || 480) * k); c.height = Math.round((v.videoHeight || 360) * k);
  c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
  snapDataUrl = c.toDataURL('image/jpeg', 0.7);
  buzz(20); openTags(true);
};

// Vision hook. No detector is bundled: a person/dog detector small enough to vendor (<5 MB, licence-compatible,
// no CDN) is not available yet; see docs/GLASSES.md "Vision". A future module can register one:
//   window.OpenPawVision.register(async (videoEl) => [{ label: 'person'|'dog', score, box: [x, y, w, h] }])
// Detections are only ever shown as suggestions; the owner confirms before anything is stored.
const vision = { detector: null };
window.OpenPawVision = { register(fn) { vision.detector = fn; }, get active() { return Boolean(vision.detector); } };
function startVisionLoop(video) {
  if (!vision.detector) return;
  const loop = async () => {
    if (!stream) return;
    try {
      const dets = await vision.detector(video);
      const hit = (dets || []).find((d) => (d.label === 'person' || d.label === 'dog') && d.score >= 0.6);
      if (hit && !ep) showPrompt(`Camera sees a ${hit.label}. Mark as trigger?`, () => openDistance(), 'Mark');
    } catch (_) { /* detector failure never blocks the walk */ }
    setTimeout(loop, 700);
  };
  loop();
}

// ---------------------------------------------------------------- confirm prompt (never auto-label)
let promptYes = null, promptT = 0;
function showPrompt(text, onYes, yesLabel = 'Mark') {
  $('promptText').textContent = text; $('promptYes').textContent = yesLabel; promptYes = onYes;
  $('prompt').hidden = false; clearTimeout(promptT); promptT = setTimeout(hidePrompt, 20000);
}
function hidePrompt() { $('prompt').hidden = true; promptYes = null; }
$('promptYes').onclick = () => { const f = promptYes; hidePrompt(); if (f) f(); };
$('promptNo').onclick = hidePrompt;

// ---------------------------------------------------------------- live collar (Web Bluetooth, app/openpaw-ble.js)
const spark = [];
let collar = null, burstT = 0, demoTimer = 0;
function drawSpark() {
  const c = $('spark'), g = c.getContext('2d'), dpr = window.devicePixelRatio || 1;
  const W = c.clientWidth || 200, H = c.clientHeight || 54;
  c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
  const pts = spark.slice(-60); if (!pts.length) return;
  const max = Math.max(400, ...pts.map((p) => p.v)) * 1.1, x = (i) => (i / 59) * W, y = (v) => H - 6 - (v / max) * (H - 12);
  g.strokeStyle = '#d7b986'; g.lineWidth = 1.6; g.lineJoin = 'round'; g.beginPath();
  pts.forEach((p, i) => (i ? g.lineTo(x(i), y(p.v)) : g.moveTo(x(i), y(p.v)))); g.stroke();
  g.fillStyle = '#e0925f'; pts.forEach((p, i) => { if (p.b) g.fillRect(x(i) - 1.5, 2, 3, H - 4); });
}
async function onRecord(rec, deviceId, clock, origin) {
  $('vVal').textContent = rec.vedba_mean_mg;
  spark.push({ v: rec.vedba_mean_mg, b: rec.bursts > 0 }); drawSpark();
  const evs = recordToEvents(rec, { dogId: dog, deviceId, clock, epochS: 5, origin });
  await S.putEvents(evs);
  if (rec.bursts > 0) {
    const f = $('burstFlag'); f.classList.add('on'); clearTimeout(burstT); burstT = setTimeout(() => f.classList.remove('on'), 1500);
    const burstId = evs.find((e) => e.payload.metric === 'movement.bursts')?.event_id;
    if (!ep) {
      buzz([15, 40, 15]);
      showPrompt(`Collar burst (${rec.vedba_max_mg} mg peak). Mark as reaction?`, () => mark('reaction', { via: 'collar-prompt', evidence: burstId ? [burstId] : [] }));
    }
  }
}
$('btnCollar').onclick = async () => {
  if (!navigator.bluetooth) { $('collarState').textContent = 'No Web Bluetooth here. Use Chrome on Android (or Bluefy on iPhone). Demo collar works anywhere.'; return; }
  try {
    const device = await navigator.bluetooth.requestDevice({ filters: [{ services: [UUIDS.service] }] });
    $('collarState').textContent = `Connecting to ${device.name}…`;
    const server = await device.gatt.connect();
    const svc = await server.getPrimaryService(UUIDS.service);
    const live = await svc.getCharacteristic(UUIDS.live);
    const st = decodeStatus(await (await svc.getCharacteristic(UUIDS.status)).readValue());
    const clock = makeClock(Date.now(), st.uptime_s);
    collar = { device, name: device.name || 'OpenPaw' };
    live.addEventListener('characteristicvaluechanged', (e) => onRecord(decodeRecord(e.target.value), collar.name, clock, 'sensor'));
    await live.startNotifications();
    device.addEventListener('gattserverdisconnected', () => { $('collarState').textContent = 'Collar disconnected.'; $('btnCollar').textContent = 'Reconnect collar'; });
    $('collarState').textContent = `Live from ${collar.name} (${st.board}). Bursts outside an episode ask before labelling.`;
    $('btnCollar').textContent = 'Connected';
  } catch (e) { $('collarState').textContent = `Could not connect: ${e.message}`; }
};
// Demo: simulated 5 s epochs (origin=simulated), with an occasional burst, so the prompt flow can be tried without hardware.
$('btnCollarDemo').onclick = () => {
  if (demoTimer) { clearInterval(demoTimer); demoTimer = 0; $('btnCollarDemo').textContent = 'Demo collar'; $('collarState').textContent = 'Demo stopped.'; return; }
  let seq = 0, up = 1000;
  const clock = makeClock(Date.now(), up);
  const step = () => {
    seq += 1; up += 5;
    const burst = seq % 9 === 0;
    const v = Math.round(260 + 90 * Math.sin(seq / 3) + Math.random() * 60 + (burst ? 700 : 0));
    onRecord({ version: 1, flags: 0, seq, uptime_s: up, vedba_mean_mg: v, vedba_max_mg: burst ? 2400 : Math.round(v * 1.7), active_frac: 220, pitch_deg: -10, roll_deg: 0,
      bursts: burst ? 1 : 0, hr_bpm: 0, battery_pct: 80, clipped: false, gap: false }, 'demo-collar', clock, 'simulated');
  };
  step(); demoTimer = setInterval(step, 1500);
  $('btnCollarDemo').textContent = 'Stop demo';
  $('collarState').textContent = 'SIMULATED collar (stored as origin=simulated). Not a real dog.';
};

// ---------------------------------------------------------------- voice tagging (Web Speech API)
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let rec = null, listening = false;
if (!SR) {
  $('voiceState').textContent = 'Voice tagging is not supported in this browser (try Chrome on Android). Buttons work everywhere.';
  $('btnMic').disabled = true; $('btnMic').style.opacity = '.4';
}
function startVoice() {
  rec = new SR(); rec.continuous = true; rec.interimResults = false; rec.lang = navigator.language || 'en-US';
  rec.onresult = (ev) => {
    const r = ev.results[ev.results.length - 1]; const text = r[0].transcript.trim();
    const p = parseSpeech(text);
    $('heard').textContent = `“${text}”${p ? ` → ${ACTS[p.act].label}${p.band ? ` ${BAND_LABEL[p.band]}` : ''}` : ' (no match)'}`;
    if (p) mark(p.act, { band: p.band, via: 'voice', transcript: text });
  };
  rec.onerror = (ev) => { if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed') { listening = false; setMic(); $('voiceState').textContent = 'Microphone permission denied.'; } };
  rec.onend = () => { if (listening) { try { rec.start(); } catch (_) { /* restarting */ } } };
  rec.start();
}
function setMic() {
  $('btnMic').setAttribute('aria-pressed', String(listening));
  if (SR) $('voiceState').textContent = listening ? 'Listening. Say “trigger 30 feet”, “reaction”, “treat”, “turn”, “calm”.' : 'Voice off. Tap the mic to tag by voice.';
}
$('btnMic').onclick = () => {
  if (!SR) return;
  listening = !listening;
  if (listening) { try { startVoice(); } catch (e) { listening = false; $('voiceState').textContent = `Voice unavailable: ${e.message}`; } } else { try { rec && rec.stop(); } catch (_) { /* already stopped */ } }
  setMic();
};

// ---------------------------------------------------------------- wake lock
let wake = null, wantWake = false;
async function acquireWake() {
  if (!('wakeLock' in navigator)) { toast('Screen wake lock not supported here'); return false; }
  try { wake = await navigator.wakeLock.request('screen'); wake.addEventListener('release', () => { wake = null; syncWake(); }); return true; } catch (_) { return false; }
}
function syncWake() { $('btnWake').setAttribute('aria-pressed', String(Boolean(wake))); }
$('btnWake').onclick = async () => {
  wantWake = !wake;
  if (wake) { await wake.release(); wake = null; } else if (!(await acquireWake())) wantWake = false;
  syncWake();
};
document.addEventListener('visibilitychange', async () => { if (document.visibilityState === 'visible' && wantWake && !wake) { await acquireWake(); syncWake(); } });

// ---------------------------------------------------------------- keyboard (also how Display-glasses web apps receive touchpad/Neural Band input)
document.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape') { closeDistance(); $('tagSheet').hidden = true; }
  if (!$('distSheet').hidden || !$('tagSheet').hidden || ev.target.matches('input, textarea')) return;
  const k = ev.key.toLowerCase();
  if (k === 't') openDistance(); else if (k === 'r') mark('reaction'); else if (k === 'c') mark('calm'); else if (k === 'g') mark('treat'); else if (k === 'u') mark('turn');
});

// ---------------------------------------------------------------- boot
dog = await S.dogId();
ep = (await S.getMeta(EP_KEY)) || null;
if (ep && Date.now() - ep.start > 6 * 3600 * 1000) { ep = null; await persistEpisode(); } // stale (forgotten) episode
window.addEventListener('resize', drawSpark);
render(); tick(); setInterval(tick, 250);
window.OpenPawField = { mark, parseSpeech, state: () => ({ episode: ep, lastDone, logged: walkLog.length }) };
