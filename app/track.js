// OpenPaw Track: quick logging for any tracker + the pattern view.
// SPDX-License-Identifier: GPL-3.0-only
import * as S from './store.js';
import { TEMPLATES, findPatterns, demoHistory, metricFor, slug, ENGINE_VERSION } from './patterns.js';

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const TZ = new Date().getTimezoneOffset();
const CATS = [['behavior', 'Behavior'], ['state', 'Energy & state'], ['food', 'Food & water'], ['activity', 'Activity'], ['health', 'Health'], ['context', 'Context'], ['custom', 'Your trackers']];
const KIND = { food: 'context', activity: 'context', context: 'context', health: 'intervention', behavior: 'observation', state: 'observation', custom: 'observation' };

let DOG = 'my-dog';
let trackers = [];      // TEMPLATES merged with stored settings + custom trackers
let events = [];        // live (non-retracted) events
let profile = null;
let demo = false;

const localDay = (d = new Date()) => new Date(d.getTime() - TZ * 60000).toISOString().slice(0, 10);
const clock = (ts) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const toLocalInput = (d) => new Date(d.getTime() - TZ * 60000).toISOString().slice(0, 16);
const fmt = (v) => (typeof v === 'number' ? (Number.isInteger(v) ? String(v) : v.toFixed(1)) : String(v));

async function load() {
  DOG = await S.dogId();
  profile = (await S.getMeta('profile')) || null;
  const stored = await S.listTrackers();
  const byId = new Map(stored.map((t) => [t.id, t]));
  trackers = TEMPLATES.map((t) => ({ ...t, visible: true, ...(byId.get(t.id) || {}), builtin: true }));
  for (const t of stored) if (!TEMPLATES.some((x) => x.id === t.id)) trackers.push({ ...t, builtin: false });
  events = S.liveEvents(await S.allEvents());
}

/* ------------------------------------------------------------- today */
function todays() {
  const d = localDay();
  return events.filter((e) => localDay(new Date(e.timestamp)) === d && e.payload && e.payload.metric !== 'learn.session').sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
}
function totalToday(t) {
  const m = metricFor(t);
  const xs = todays().filter((e) => e.payload.metric === m);
  if (!xs.length) return null;
  if (t.type === 'scale') return { v: xs.reduce((s, e) => s + (+e.payload.value || 0), 0) / xs.length, n: xs.length };
  if (t.type === 'check') return { v: xs.length, n: xs.length };
  return { v: xs.reduce((s, e) => s + (+e.payload.value || 0), 0), n: xs.length };
}

function renderNeeds() {
  const n = (profile && profile.needs) || { sleep_h: null, sniff_min: 30, play_min: 20, meals: 2 };
  const get = (id) => { const t = trackers.find((x) => x.id === id); const r = t && totalToday(t); return r ? r : { v: 0, n: 0 }; };
  const items = [
    ['Play', get('play').v, n.play_min || 20, 'min'],
    ['Sniff', get('sniff').v, n.sniff_min || 30, 'min'],
    ['Walk', get('walk').v, 45, 'min'],
    ['Meals', get('meal').n, n.meals || 2, ''],
  ];
  const C = 2 * Math.PI * 26;
  $('#needs').innerHTML = items.map(([label, v, goal, u]) => {
    const f = Math.min(1, goal ? v / goal : 0);
    return `<div class="card need ${f >= 1 ? 'done' : ''}"><div class="need-wrap"><svg viewBox="0 0 64 64" aria-hidden="true"><circle class="bg" cx="32" cy="32" r="26"/><circle class="fg" cx="32" cy="32" r="26" stroke-dasharray="${C}" stroke-dashoffset="${C}" data-off="${C * (1 - f)}"/></svg><em>${fmt(v)}</em></div><b>${label}</b><span>of ${goal}${u ? ' ' + u : ''}</span></div>`;
  }).join('');
  requestAnimationFrame(() => requestAnimationFrame(() => document.querySelectorAll('.need .fg').forEach((c) => { c.style.strokeDashoffset = c.dataset.off; })));
  if (!profile) $('#needs').insertAdjacentHTML('afterend', '');
}

function renderTiles() {
  const vis = trackers.filter((t) => t.visible !== false);
  $('#tiles').innerHTML = CATS.map(([cat, label]) => {
    const ts = vis.filter((t) => (t.category || 'custom') === cat);
    if (!ts.length && cat !== 'custom') return '';
    return `<div class="micro cat">${label}</div><div class="tiles">${ts.map((t) => {
      const tot = totalToday(t);
      const today = tot ? (t.type === 'scale' ? `avg ${fmt(tot.v)}` : t.type === 'check' ? `${tot.n}× today` : `${fmt(tot.v)} ${t.unit || ''}`) : '';
      return `<button class="tile" data-t="${esc(t.id)}"><span class="nm">${esc(t.name)}</span><span>${today ? `<span class="today">${esc(today)}</span>` : `<span class="meta">${esc(t.unit || (t.type === 'check' ? 'tap to log' : t.type))}</span>`}</span></button>`;
    }).join('')}${cat === 'custom' ? '<button class="tile add" data-go="trackers"><span class="nm">+ New tracker</span><span class="meta">anything you like</span></button>' : ''}</div>`;
  }).join('');
}

const LABELS = {
  'trigger.seen': (p) => ['Trigger seen', p.value ? `${p.value} ft` : ''], 'behavior.reacted': () => ['Reaction', ''],
  'behavior.calm': (p) => ['Calm again', p.time_to_calm_s != null ? `${p.time_to_calm_s} s to calm` : ''],
  'intervention.reward': () => ['Treat / reward', ''], 'intervention.distance': (p) => ['Created distance', p.value || ''],
  'consent.check': (p) => ['Consent check', `${String(p.value).replace('_', ' ')}${p.area ? ' · ' + p.area : ''}`],
  'body_language.tags': (p) => ['Body language', Array.isArray(p.value) ? p.value.join(', ') : ''],
};
function describe(e) {
  const p = e.payload, m = p.metric;
  if (m.startsWith('track.')) {
    const t = trackers.find((x) => metricFor(x) === m);
    const name = t ? t.name : m.slice(6);
    const val = t && t.type === 'check' ? '' : `${fmt(p.value)}${p.unit ? ' ' + p.unit : t && t.unit ? ' ' + t.unit : ''}`;
    return [name, [val, p.note].filter(Boolean).join(' · ')];
  }
  if (LABELS[m]) return LABELS[m](p);
  return [m.replace(/[._]/g, ' '), typeof p.value === 'object' ? '' : fmt(p.value)];
}

function renderTimeline() {
  const xs = todays().filter((e) => e.provenance && e.provenance.origin !== 'sensor');
  $('#todayCount').textContent = xs.length ? `${xs.length} logged` : '';
  $('#timeline').innerHTML = xs.length ? xs.slice(0, 40).map((e) => {
    const [a, b] = describe(e);
    return `<li><time>${clock(e.timestamp)}</time><span class="what"><b>${esc(a)}</b>${b ? `<small>${esc(b)}</small>` : ''}</span><button class="x" data-del="${esc(e.event_id)}" aria-label="Delete ${esc(a)}">Delete</button></li>`;
  }).join('') : '<li class="empty">Nothing yet today. Tap a tile to log it.</li>';
}

/* ------------------------------------------------------------- sheet */
let cur = null, chosen = null;
function openSheet(t, ev) {
  cur = t; chosen = null;
  $('#shCat').textContent = (CATS.find((c) => c[0] === (t.category || 'custom')) || [, 'Tracker'])[1];
  $('#shTitle').textContent = t.name;
  const quick = t.type === 'check' ? [] : (t.quick || []);
  const unitFor = (q) => (!t.unit || t.type === 'scale' || t.unit.length >= 8 ? '' : ' ' + (q === 1 && /s$/.test(t.unit) ? t.unit.slice(0, -1) : t.unit));
  $('#shChips').innerHTML = quick.map((q) => `<button class="chip" data-q="${q}" aria-pressed="false">${fmt(q)}${esc(unitFor(q))}</button>`).join('');
  $('#shValWrap').hidden = t.type === 'check';
  $('#shVal').value = ''; $('#shVal').placeholder = t.unit || '';
  $('#shWhen').value = toLocalInput(new Date());
  $('#shNote').value = '';
  $('#toast').classList.remove('on');
  $('#scrim').classList.add('on'); $('#sheet').classList.add('on');
  setTimeout(() => ($('#shChips button') || $('#shSave')).focus(), 200);
}
function closeSheet() { $('#scrim').classList.remove('on'); $('#sheet').classList.remove('on'); cur = null; }

async function logValue(t, value, when, note) {
  const e = S.ownerEvent({ dog: DOG, kind: KIND[t.category || 'custom'] || 'observation', metric: metricFor(t), value, unit: t.unit || null, note: note || null, timestamp: when.toISOString() });
  await S.putEvents([e]);
  events.push(e);
  if (navigator.vibrate) navigator.vibrate(12);
  refreshToday(t.id);
  toast(`${t.name} logged${t.type === 'check' ? '' : ` · ${fmt(value)}${t.unit ? ' ' + t.unit : ''}`}`, e.event_id);
}
async function retract(id) {
  const r = S.retractEvent(DOG, id);
  await S.putEvents([r]);
  events = events.filter((e) => e.event_id !== id);
  refreshToday();
}

let toastT = null, toastId = null;
function toast(msg, undoId) {
  toastId = undoId; $('#toastMsg').textContent = msg; $('#toastUndo').hidden = !undoId;
  $('#toast').classList.add('on'); clearTimeout(toastT);
  toastT = setTimeout(() => $('#toast').classList.remove('on'), 4000);
}

function refreshToday(flashId) {
  renderNeeds(); renderTiles(); renderTimeline();
  if (flashId) { const b = $(`.tile[data-t="${CSS.escape(flashId)}"]`); if (b && !reduce) { b.classList.add('flash'); setTimeout(() => b.classList.remove('flash'), 700); } }
}

/* ------------------------------------------------------------- patterns */
function renderPatterns() {
  const src = demo ? demoHistory({ days: 90, seed: 5, dog: DOG, start: localDay(new Date(Date.now() - 89 * 86400000)), tzOffsetMin: TZ }) : events;
  const r = findPatterns(src, { tzOffsetMin: TZ, trackers, perms: 499 });
  const ep = r.series.episodes ? r.series.episodes.values : [];
  const logged = r.days.length;
  const recent = ep.slice(-14).filter((v) => v !== null), prior = ep.slice(-28, -14).filter((v) => v !== null);
  const avg = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : null);
  const per = avg(recent), perPrior = avg(prior);
  const delta = per != null && perPrior != null && perPrior > 0 ? Math.round(((per - perPrior) / perPrior) * 100) : null;
  $('#summary').innerHTML = `
    <div><span class="micro">Days logged</span><b>${logged}</b></div>
    <div><span class="micro">Episodes/day</span><b>${per == null ? '–' : per.toFixed(1)}</b></div>
    <div><span class="micro">Change</span><b>${delta == null ? '–' : (delta > 0 ? '+' : '') + delta + '%'}</b></div>`;
  // heatmap: last 56 days, aligned to weeks
  const map = new Map(r.days.map((d, i) => [d, ep[i]]));
  const cells = [];
  for (let i = 55; i >= 0; i--) { const d = localDay(new Date(Date.now() - i * 86400000)); cells.push([d, map.has(d) ? map.get(d) : null]); }
  const col = (n) => (n == null ? '' : n === 0 ? 'data-n="0"' : `style="background:rgba(215,185,134,${Math.min(1, 0.28 + n * 0.24)})"`);
  $('#heat').innerHTML = cells.map(([d, n]) => `<i ${col(n)} title="${d}: ${n == null ? 'not logged' : n + ' episode' + (n === 1 ? '' : 's')}" data-d="${d}" data-v="${n == null ? 'not logged' : n}"></i>`).join('');
  $('#heatFrom').textContent = cells[0][0].slice(5);
  // findings
  const F = r.findings;
  const need = Math.max(0, 14 - logged);
  $('#findings').innerHTML = (demo ? '<p style="margin:16px 0 0"><span class="sim">SIMULATED</span> <span class="fine">90 invented days with planted effects (play, sleep, walks). Turn off to see your own.</span></p>' : '') +
    (F.length ? F.map((f, k) => findingCard(f, k)).join('') : `<div class="card finding" style="cursor:default"><span class="br tl"></span><span class="br bR"></span><div class="micro">No patterns yet</div><h3>${need ? `Log ${need} more day${need === 1 ? '' : 's'} to start` : 'Nothing stands out yet'}</h3><p>${need ? 'Patterns need at least 14 logged days. Meals, play, energy and episodes are the most useful to start with.' : 'That is a real answer too: with this much data nothing passes the bar. Keep logging; small effects need more days.'}</p></div>`);
  $('#method').textContent = `${r.tested} comparisons checked with a rank correlation and a permutation test, then corrected for testing many things at once (Benjamini–Hochberg, q < 0.1). Associations, not causes. Engine ${ENGINE_VERSION}.`;
  requestAnimationFrame(() => requestAnimationFrame(() => document.querySelectorAll('.bars .b i').forEach((i) => { i.style.width = i.dataset.w; })));
  lastFindings = { generated_at: new Date().toISOString(), simulated: demo, dog_id: DOG, engine: ENGINE_VERSION, days_logged: logged, tested: r.tested, findings: F.map(({ days, ...f }) => ({ ...f, n_days: days ? days.length : undefined })) };
}
let lastFindings = null;
function findingCard(f, k) {
  const kind = { association: 'Pattern', timing: 'Time of day', trend: 'Trend' }[f.kind];
  let viz = '';
  if (f.kind === 'association') {
    const mx = Math.max(f.split.high, f.split.low, 0.001);
    const tr = trackers.find((x) => x.id === f.factor);
    const isTime = /_first_time$/.test(f.factor);
    const cut = isTime ? `${String(Math.floor(f.split.cut / 60)).padStart(2, '0')}:${String(Math.round(f.split.cut % 60)).padStart(2, '0')}` : `${fmt(f.split.cut)}${tr && tr.unit && tr.type !== 'scale' ? ' ' + tr.unit : ''}`;
    const [hiL, loL] = isTime ? [`after ${cut}`, `by ${cut}`] : [`> ${cut}`, `≤ ${cut}`];
    viz = `<div class="bars"><span>${esc(hiL)}</span><span class="b"><i data-w="${(f.split.high / mx) * 100}%"></i></span><span>${fmt(f.split.high)}</span><span>${esc(loL)}</span><span class="b lo"><i data-w="${(f.split.low / mx) * 100}%"></i></span><span>${fmt(f.split.low)}</span></div>`;
  } else if (f.kind === 'timing') {
    const mx = Math.max(...f.blocks, 1);
    viz = `<div class="bars">${f.blocks.map((b, i) => `<span>${String(6 + i * 3).padStart(2, '0')}–${String(9 + i * 3).padStart(2, '0')}</span><span class="b ${b === mx ? '' : 'lo'}"><i data-w="${(b / mx) * 100}%"></i></span><span>${b}</span>`).join('')}</div>`;
  }
  return `<article class="card finding" tabindex="0" aria-expanded="false" style="animation:in .4s ${k * 0.06}s both"><span class="br tl"></span><span class="br bR"></span>
    <div class="kind"><span class="micro">${kind}</span><span class="strength" title="strength"><i style="width:${Math.round(f.strength * 100)}%"></i></span></div>
    <h3>${esc(f.title)}</h3>${viz}
    <div class="more"><p>${esc(f.detail)}</p><p class="caveat">${esc(f.caveat)}</p></div></article>`;
}

/* ------------------------------------------------------------- trackers tab */
function renderTrackerList() {
  $('#trList').innerHTML = trackers.map((t) => `<li><span class="nm">${esc(t.name)}<small>${esc(t.type)}${t.unit ? ' · ' + esc(t.unit) : ''}${t.builtin ? '' : ' · yours'}</small></span>
    ${t.builtin ? '' : `<button class="x" data-rm="${esc(t.id)}">Remove</button>`}
    <button class="sw" role="switch" aria-checked="${t.visible !== false}" data-vis="${esc(t.id)}" aria-label="Show ${esc(t.name)} on Today"></button></li>`).join('');
}

/* ------------------------------------------------------------- wiring */
function show(tab) {
  for (const n of ['today', 'patterns', 'trackers']) {
    $(`#tab-${n}`).setAttribute('aria-selected', String(n === tab));
    $(`#v-${n}`).hidden = n !== tab;
  }
  if (tab === 'patterns') renderPatterns();
  if (tab === 'trackers') renderTrackerList();
  if (location.hash !== `#${tab}`) history.replaceState(null, '', `#${tab}`);
}

document.addEventListener('click', async (ev) => {
  const t = ev.target.closest('button, .finding');
  if (!t) return;
  if (t.matches('[role=tab]')) return show(t.id.slice(4));
  if (t.dataset.go) return show(t.dataset.go);
  if (t.dataset.t) {
    const tr = trackers.find((x) => x.id === t.dataset.t);
    const r = t.getBoundingClientRect(); t.style.setProperty('--fx', `${ev.clientX - r.left}px`); t.style.setProperty('--fy', `${ev.clientY - r.top}px`);
    if (tr.type === 'check') return logValue(tr, 1, new Date(), null);
    return openSheet(tr, ev);
  }
  if (t.dataset.q !== undefined && t.classList.contains('chip')) {
    document.querySelectorAll('#shChips .chip').forEach((c) => c.setAttribute('aria-pressed', String(c === t)));
    chosen = +t.dataset.q; $('#shVal').value = chosen;
    return;
  }
  if (t.dataset.del) return retract(t.dataset.del).then(() => toast('Deleted'));
  if (t.dataset.vis) {
    const tr = trackers.find((x) => x.id === t.dataset.vis);
    tr.visible = !(tr.visible !== false);
    const { builtin, ...save } = tr; await S.putTracker(save);
    t.setAttribute('aria-checked', String(tr.visible)); renderTiles();
    return;
  }
  if (t.dataset.rm) {
    await S.deleteTracker(t.dataset.rm); trackers = trackers.filter((x) => x.id !== t.dataset.rm);
    renderTrackerList(); renderTiles(); return;
  }
  if (t.classList.contains('finding') && t.querySelector('.more')) {
    const open = t.classList.toggle('open'); t.setAttribute('aria-expanded', String(open));
  }
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && cur) closeSheet();
  if ((e.key === 'Enter' || e.key === ' ') && e.target.classList && e.target.classList.contains('finding')) { e.preventDefault(); e.target.click(); }
  if (e.target.matches && e.target.matches('[role=tab]') && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
    const tabs = [...document.querySelectorAll('[role=tab]')], i = tabs.indexOf(e.target);
    const n = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length]; n.focus(); show(n.id.slice(4));
  }
});
$('#scrim').onclick = closeSheet;
$('#shCancel').onclick = closeSheet;
$('#shSave').onclick = async () => {
  if (!cur) return;
  const t = cur;
  const raw = $('#shVal').value.trim();
  const v = t.type === 'check' ? 1 : raw === '' ? chosen : +raw;
  if (v === null || v === undefined || !Number.isFinite(v)) { $('#shVal').focus(); $('#shVal').style.borderColor = 'var(--warm)'; return; }
  $('#shVal').style.borderColor = '';
  const when = $('#shWhen').value ? new Date($('#shWhen').value) : new Date();
  closeSheet();
  await logValue(t, t.type === 'scale' ? Math.max(1, Math.min(5, Math.round(v))) : v, when, $('#shNote').value.trim());
};
$('#toastUndo').onclick = async () => { if (toastId) { await retract(toastId); toast('Undone'); } };
$('#demoSw').onclick = () => { demo = !demo; $('#demoSw').setAttribute('aria-checked', String(demo)); renderPatterns(); };
$('#heat').addEventListener('pointerover', (e) => { const i = e.target.closest('i'); if (i) $('#heatTip').textContent = `${i.dataset.d.slice(5)} · ${i.dataset.v}`; });
$('#newTracker').onsubmit = async (e) => {
  e.preventDefault();
  const name = $('#ntName').value.trim(); if (!name) return;
  let id = slug(name); while (trackers.some((t) => t.id === id)) id += '-2';
  const type = $('#ntType').value;
  const quick = $('#ntQuick').value.split(',').map((s) => +s.trim()).filter((n) => Number.isFinite(n) && n > 0).slice(0, 6);
  const t = { id, name, type, unit: $('#ntUnit').value.trim() || null, category: 'custom', visible: true,
    quick: quick.length ? quick : type === 'scale' ? [1, 2, 3, 4, 5] : type === 'duration' ? [10, 20, 30] : type === 'check' ? [] : [1, 2, 3], created_at: new Date().toISOString() };
  await S.putTracker(t); trackers.push({ ...t, builtin: false });
  e.target.reset(); renderTrackerList(); renderTiles(); toast(`${name} added to Today`);
};
$('#exportAll').onclick = async () => S.download(`openpaw-${DOG}-${localDay()}.ndjson`, (await S.allEvents()).map((e) => JSON.stringify(e)).join('\n') + '\n');
$('#exportFindings').onclick = () => lastFindings && S.download(`openpaw-${DOG}-patterns-${localDay()}.json`, JSON.stringify(lastFindings, null, 2), 'application/json');

await load();
refreshToday();
show(['patterns', 'trackers'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'today');
window.__openpawTrack = { reload: async () => { await load(); refreshToday(); } };
