// "Save as a page" on the collar page: the owner's own collar export as one standalone HTML
// page, built in this browser (no terminal, no Python, nothing uploaded). A port of
// demo/render_timeline.py render_own() + collar_section(own=True); app/test/own-page.test.mjs
// checks both write the same page. Movement (VeDBA) next to the owner's own Field marks:
// measurements only, not a diagnosis.
// SPDX-License-Identifier: GPL-3.0-only
import { deriveMovement, ALGORITHM_VERSION } from './episode-movement.js';
import { CSS } from './timeline-css.js';

// Python html.escape(quote=True).
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#x27;');
// Python str() for the JSON values an export holds.
const py = (v) => v === null || v === undefined ? 'None' : v === true ? 'True' : v === false ? 'False' : String(v);
const ORIGIN_TEXT = { model: 'computed from collar data' };

const OWN_JS = `
document.querySelectorAll('#collar a[href^="#ev-"]').forEach(link => link.addEventListener('click', event => {
  const source = document.getElementById(decodeURIComponent(link.getAttribute('href').slice(1)));
  if (!source) return;
  event.preventDefault();
  source.open = true;
  history.replaceState(null, '', '#' + source.id);
  source.scrollIntoView({block: 'start'});
  source.querySelector('summary').focus({preventScroll: true});
}));
`;

function eventCard(e) {
  const p = e.payload || {};
  const value = p.value;
  const shown = value !== null && value !== undefined ? `${py(value)} ${p.unit || ''}`.trim() : '';
  const prov = e.provenance || {};
  const ident = esc(e.event_id);
  const metric = 'metric' in p ? p.metric : ('event_type' in e ? e.event_type : '');
  return `<details class="collar-event" id="ev-${ident}">
      <summary><time datetime="${esc(e.timestamp)}">${esc(e.timestamp.slice(11, 19))}</time>
        <span class="event-name"><b>${esc(py(metric))}</b></span>
        <b class="measure">${esc(shown)}</b><span class="expand">+</span></summary>
      <div class="event-info"><p class="meta">Source: <code>${esc(py(prov.origin))} · ${esc(py(prov.source_id))}</code></p>
        <p class="meta">Event: <code>${ident}</code></p><p class="meta">Recorded: <code>${esc(e.timestamp)}</code></p></div>
    </details>`;
}

function collarSection(events) {
  const origins = [...new Set(events.map((e) => py((e.provenance || {}).origin)))].sort();
  const label = 'your own export · origins: ' + origins.join(', ');
  const derived = deriveMovement(events);
  const byId = new Map(events.map((e) => [e.event_id, e]));
  const link = (eid, text) => `<a href="#ev-${esc(eid)}">${esc(text)}</a>`;
  const hms = (eid) => byId.get(eid).timestamp.slice(11, 19);
  const cards = [], shown = [];
  for (const d of derived) {
    const { baseline: b, peak: pk, back_in_band: bb } = d.payload;
    const trig = byId.get(d.provenance.evidence_event_ids[0]);
    let band = b.status === 'known'
      ? `${esc(py(b.median_mg))} mg median, upper ${esc(py(b.upper_mg))} mg · ${b.epochs} epochs from ${link(b.first_event_id, hms(b.first_event_id))} to ${link(b.last_event_id, hms(b.last_event_id))}`
      : `unknown: only ${b.epochs} usable epochs in the 30 min before`;
    band += ` · left out ${b.excluded.quality} flagged clipped/gap, ${b.excluded.earlier_episode} from an earlier episode`;
    let back;
    if (bb.status === 'observed') back = `${link(bb.event_id, `${bb.after_trigger_s} s after the trigger`)} (${bb.after_peak_s} s after the peak; first ${bb.settle_s} s run at or under the upper band)`;
    else if (bb.status === 'unknown') back = 'unknown without a band';
    else {
      back = `not observed in ${bb.followed_up_s} s of follow-up`;
      const end = bb.ended_by || {};
      if (end.reason === 'next episode') back = `<span class="incomplete">Incomplete</span>: ${back}; the ${link(end.event_id, `next episode began ${end.after_trigger_s} s after the trigger`)}`;
      else if (end.reason === 'end of data') back += ' (data ended)';
    }
    const origin = d.provenance.origin;
    cards.push(`<article class="collar-episode">
      <span class="eyebrow">${esc(trig.timestamp.slice(0, 10))} · ${link(trig.event_id, trig.timestamp.slice(11, 19) + ' UTC trigger mark')} · ${esc(py(ORIGIN_TEXT[origin] || origin))}</span>
      <strong>Episode ${esc(py(d.episode_id))}</strong>
      <dl><dt>Band before</dt><dd>${band}</dd>
        <dt>Peak</dt><dd>${link(pk.event_id, `${py(pk.value_mg)} mg`)} at +${pk.after_trigger_s} s</dd>
        <dt>Back in band</dt><dd>${back}</dd></dl>
    </article>`);
    for (const eid of [trig.event_id, b.first_event_id, b.last_event_id, pk.event_id, bb.event_id, (bb.ended_by || {}).event_id]) {
      if (eid && !shown.includes(eid)) shown.push(eid);
    }
  }
  // Python sorted() is stable on equal timestamps; Array.prototype.sort is too.
  const sources = shown.slice().sort((x, y) => (byId.get(x).timestamp < byId.get(y).timestamp ? -1 : byId.get(x).timestamp > byId.get(y).timestamp ? 1 : 0))
    .map((i) => eventCard(byId.get(i))).join('');
  const body = cards.join('') || '<p class="empty-day">No episode with a "trigger seen" mark and collar epochs after it.</p>';
  return [derived.length, `<section id="collar" aria-labelledby="collar-title"><div class="sectionhead"><h2 id="collar-title">Collar episodes</h2><span class="hint">From an app export · ${esc(label)} · app/episode-movement.js ${esc(ALGORITHM_VERSION)} · movement (VeDBA) only</span></div>
<p class="side-note">Each band is this dog's own 30 minutes before the trigger. A hypothesis for experts to check, not a finding. Every figure opens the collar event it came from.</p>
<div class="collar-grid">${body}</div><div class="collar-sources"><h3 class="kicker">Source events behind these figures</h3>${sources}</div></section>`];
}

// The whole page, as `render_timeline.py --own-export` writes it.
export function ownPageHtml(events) {
  const [n, section] = collarSection(events);
  const times = events.map((e) => e.timestamp).filter((t) => typeof t === 'string').sort();
  const span = times.length ? `${esc(times[0].slice(0, 10))} to ${esc(times[times.length - 1].slice(0, 10))} (UTC)` : 'no timestamps';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'none'; img-src data:; form-action 'none'; base-uri 'none'">
<meta name="robots" content="noindex"><title>OpenPaw · Your collar export</title><style>${CSS}</style></head>
<body><div class="topnotice" role="note">YOUR OWN COLLAR EXPORT · THIS PAGE STAYS ON THIS COMPUTER · MEASUREMENTS ONLY, NOT A DIAGNOSIS</div>
<div class="shell"><header class="sitehead"><div class="brand"><span class="brandmark">P</span> OpenPaw <span class="hint">/ Your export</span></div><nav class="nav" aria-label="Page navigation"><a href="#collar">Collar</a></nav></header>
<section class="hero"><div><div class="kicker">Your own export · ${span}</div><h1>Your collar episodes.</h1><p>Built on this computer from the file you exported. Nothing was uploaded, and this page loads nothing from the internet. It can still hold details about your dog and your walks: it stays on this computer until you choose to share it, so read it first. Movement measured by the collar, next to the marks you made in Field: measurements only, not a diagnosis.</p></div>
<div class="stats"><div class="stat"><b>${events.length}</b><span>Export events</span></div><div class="stat"><b>${n}</b><span>Collar episodes</span></div></div></section>
${section}
<footer>OpenPaw · measurements and your own marks, not a medical device. <a href="https://github.com/kvnloo/openpaw" rel="noreferrer">Protocol &amp; source ↗</a></footer></div>
<script>${OWN_JS}</script></body></html>`;
}

export function ownPageName(dogId, now = new Date()) {
  const safe = String(dogId).replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'dog';
  const d = new Date(now.getTime() - now.getTimezoneOffset() * 60e3).toISOString().slice(0, 10);
  return `openpaw-${safe}-${d}.html`;
}
