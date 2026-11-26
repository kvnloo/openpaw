// OpenPaw collar page: SVG views. Pure render functions over epochs (see collar-analytics.js).
// SPDX-License-Identifier: GPL-3.0-only
import { LEVELS, VIGOROUS, levelOf, activeMinutes, dayBudget, circadian, burstEvents, summary, fmtMin } from './collar-analytics.js';

export const LEVEL_COLORS = ['#55665c', '#8fb39b', '#e8a35f'];
// Same hues for text on the dark card: the still swatch is 3.07:1 on --bg2, too dim for a label.
export const LEVEL_TEXT = ['#75867a', '#8fb39b', '#e8a35f'];
const NS = 'http://www.w3.org/2000/svg';
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clock = (t) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const dayName = (d) => new Date(`${d}T12:00:00Z`).toLocaleDateString([], { weekday: 'short', timeZone: 'UTC' });
const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
// VeDBA is heavy-tailed: draw on a sqrt scale so rest and play are both readable (axis ticks stay in mg).
const sq = (v, max) => Math.sqrt(Math.max(0, v) / max);

/* ------------------------------------------------------------------ now */
export function renderNow(root, epochs, { tz, now, simulated }) {
  const s = summary(epochs, { tz, now });
  const lv = s.level;
  const word = lv === null ? 'Waiting' : LEVELS[lv].label;
  const base = s.base;
  const ratio = s.last && base && base.resting ? s.last.vedba / base.resting : null;
  root.querySelector('[data-k=state]').textContent = word;
  root.querySelector('[data-k=state]').style.color = lv === null ? '' : ['#a9bfb0', '#9fc2a9', '#eca968'][lv];
  root.querySelector('[data-k=sub]').textContent = s.last
    ? `${ratio ? (ratio < 1.5 ? 'At your resting level' : `${ratio.toFixed(1)}× your resting level`) : `${s.last.vedba} mg movement`} · updated ${clock(s.last.t)}`
    : 'Connect a collar or load the demo week.';
  // gauge: 240° arc, sqrt scale to 1500 mg, band segments, ticks inside, value in the centre
  const g = root.querySelector('[data-k=gauge]');
  const R = 76, CX = 100, CY = 96, A0 = 150, A1 = 390, MAX = 1500;
  const pt = (a, r = R) => [CX + r * Math.cos((a * Math.PI) / 180), CY + r * Math.sin((a * Math.PI) / 180)];
  const arc = (a, b, r = R) => { const [x0, y0] = pt(a, r), [x1, y1] = pt(b, r); return `M${x0.toFixed(1)} ${y0.toFixed(1)} A${r} ${r} 0 ${b - a > 180 ? 1 : 0} 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`; };
  const angle = (v) => A0 + (A1 - A0) * Math.min(1, sq(v, MAX));
  let segs = `<path d="${arc(A0, A1)}" stroke="#1f1e1a" stroke-width="10" fill="none" stroke-linecap="round"/>`, prev = 0;
  LEVELS.forEach((L, i) => { const hi = Math.min(MAX, L.max), pad = Math.min(1.5, (angle(hi) - angle(prev)) / 4); segs += `<path d="${arc(angle(prev) + (i ? pad : 0), angle(hi) - (i < VIGOROUS ? pad : 0))}" stroke="${LEVEL_COLORS[i]}" stroke-opacity="${i === lv ? 1 : 0.3}" stroke-width="${i === lv ? 10 : 6}" fill="none" stroke-linecap="${i === 0 || i === VIGOROUS ? 'round' : 'butt'}"/>`; prev = hi; });
  const ticks = [0, 500, 1000, 1500].map((v) => { const [x0, y0] = pt(angle(v), R - 10), [x1, y1] = pt(angle(v), R - 15), [tx, ty] = pt(angle(v), R - 25); return `<line x1="${x0}" y1="${y0}" x2="${x1}" y2="${y1}" stroke="#4a463d"/><text x="${tx}" y="${ty + 3}" text-anchor="middle">${v >= 1000 ? v / 1000 + 'k' : v}</text>`; }).join('');
  const val = s.last ? s.last.vedba : null;
  const [mx, my] = pt(val === null ? A0 : angle(val), R);
  const baseMark = base ? (() => { const [x0, y0] = pt(angle(base.resting), R + 7), [x1, y1] = pt(angle(base.resting), R + 13); return `<line x1="${x0}" y1="${y0}" x2="${x1}" y2="${y1}" stroke="#ece8df" stroke-width="1.5" stroke-linecap="round"><title>Your resting level: ${Math.round(base.resting)} mg</title></line>`; })() : '';
  g.innerHTML = `${segs}${ticks}${baseMark}
    ${val === null ? '' : `<circle cx="${mx.toFixed(1)}" cy="${my.toFixed(1)}" r="7.5" fill="#0c0c0a" stroke="${LEVEL_COLORS[lv]}" stroke-width="2"/><circle cx="${mx.toFixed(1)}" cy="${my.toFixed(1)}" r="2.6" fill="#ece8df"/>`}
    <text class="gv" x="${CX}" y="${CY + 6}" text-anchor="middle">${val === null ? '–' : val}</text><text class="gu" x="${CX}" y="${CY + 24}" text-anchor="middle">mg · VeDBA</text>`;
  // live strip: last 10 minutes
  const sp = root.querySelector('[data-k=spark]');
  const W = 320, H = 54;
  const from = (s.last ? s.last.t : now) - 10 * 60000;
  const pts = epochs.filter((e) => e.t >= from);
  if (pts.length > 1) {
    const x = (t) => ((t - from) / 600000) * W, y = (v) => H - 4 - sq(v, 1500) * (H - 10);
    const d = pts.map((e, i) => `${i ? 'L' : 'M'}${x(e.t).toFixed(1)} ${y(e.vedba).toFixed(1)}`).join('');
    const lp = pts[pts.length - 1];
    sp.innerHTML = `<defs><linearGradient id="spg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#d7b986" stop-opacity=".28"/><stop offset="1" stop-color="#d7b986" stop-opacity="0"/></linearGradient></defs>
      <path d="${d}L${x(lp.t)} ${H}L${x(pts[0].t)} ${H}Z" fill="url(#spg)"/><path d="${d}" fill="none" stroke="#d7b986" stroke-width="1.5" stroke-linejoin="round"/>
      ${pts.filter((e) => e.bursts).map((e) => `<line x1="${x(e.t)}" x2="${x(e.t)}" y1="2" y2="${H}" stroke="#e8a35f" stroke-width="1.2" stroke-dasharray="2 3"/>`).join('')}
      <circle class="head" cx="${x(lp.t)}" cy="${y(lp.vedba)}" r="3.2" fill="#d7b986"/><circle class="pulse" cx="${x(lp.t)}" cy="${y(lp.vedba)}" r="3.2" fill="none" stroke="#d7b986"/>`;
  } else sp.innerHTML = `<line class="base" x1="0" x2="${W}" y1="${H - 4}" y2="${H - 4}" stroke="#4a463d" stroke-dasharray="2 4" vector-effect="non-scaling-stroke"/>
      <text class="empty" x="${W / 2}" y="${H / 2 + 2}" text-anchor="middle">No samples in the last 10 min</text>`;
  // chips
  const typical = s.typicalActiveSoFar;
  const delta = typical && typical > 1 ? Math.round(((s.activeToday - typical) / typical) * 100) : null;
  const set = (k, v, sub) => { const el = root.querySelector(`[data-k=${k}]`); el.querySelector('b').textContent = v; if (sub !== undefined) el.querySelector('small').textContent = sub; };
  set('active', fmtMin(s.activeToday), delta === null ? 'active + vigorous today' : `${delta >= 0 ? '+' : '−'}${Math.abs(delta)}% vs a typical day so far`);
  set('bursts', String(s.burstsToday), s.minutesSinceBurst === null ? 'none recorded' : `last ${fmtMin(s.minutesSinceBurst)} ago`);
  set('pose', s.last && s.last.pitch !== null ? `${s.last.pitch > 0 ? '+' : ''}${s.last.pitch}°` : '–', s.last && s.last.pitch !== null ? (s.last.pitch < -8 ? 'head down (sniffing range)' : s.last.pitch > 6 ? 'head up / lying' : 'level') : 'head pitch');
  set('batt', s.battery === null ? '–' : `${s.battery}%`, simulated ? 'simulated collar' : 'collar battery');
  root.querySelector('[data-k=battring]').style.setProperty('--p', s.battery === null ? 0 : s.battery);
  return s;
}

/* ------------------------------------------------------------------ timeline */
export function renderTimeline(svg, readout, epochs, { range = 3600e3, now, animate = false }) {
  // draw in real pixels so labels stay crisp and readable at every width
  const W = Math.round(Math.min(1100, Math.max(320, svg.getBoundingClientRect().width || 760)));
  const H = W < 560 ? 200 : 240, L = 4, Rr = W < 560 ? 58 : 74, T = 16, B = 24, MAX = 1500;
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  const end = epochs.length ? Math.min(now, epochs[epochs.length - 1].t) : now;
  const from = end - range;
  let pts = epochs.filter((e) => e.t >= from && e.t <= end);
  // downsample to <= 600 points, keeping each bucket's max so bursts never vanish
  const bucket = Math.max(1, Math.ceil(pts.length / 600));
  if (bucket > 1) { const o = []; for (let i = 0; i < pts.length; i += bucket) { const s = pts.slice(i, i + bucket); const m = s.reduce((a, b) => (b.vedba > a.vedba ? b : a)); o.push({ ...s[Math.floor(s.length / 2)], vedba: s.reduce((a, b) => a + b.vedba, 0) / s.length, peak: m.vedba, bursts: s.reduce((a, b) => a + (b.bursts || 0), 0), clipped: s.some((x) => x.clipped) }); } pts = o; }
  const x = (t) => L + ((t - from) / range) * (W - L - Rr), y = (v) => H - B - sq(v, MAX) * (H - T - B);
  let h = `<defs><linearGradient id="tlg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#d7b986" stop-opacity=".34"/><stop offset=".7" stop-color="#d7b986" stop-opacity=".05"/><stop offset="1" stop-color="#d7b986" stop-opacity="0"/></linearGradient>
    <clipPath id="tlc"><rect x="${L}" y="0" width="${W - L - Rr}" height="${H}"/></clipPath></defs>`;
  let prev = 0;
  LEVELS.forEach((Lv, i) => { const hi = Math.min(MAX, Lv.max); h += `<rect x="${L}" y="${y(hi)}" width="${W - L - Rr}" height="${y(prev) - y(hi)}" fill="${LEVEL_COLORS[i]}" opacity="${0.02 + i * 0.008}"/><text class="band" x="${W - Rr + 10}" y="${(y(prev) + y(hi)) / 2 + 3}" fill="${LEVEL_TEXT[i]}">${Lv.label.toLowerCase()}</text>`; if (i < VIGOROUS) h += `<line x1="${L}" x2="${W - Rr}" y1="${y(hi)}" y2="${y(hi)}" stroke="#2a2823" stroke-dasharray="2 4"/><text class="cut" x="${L + 6}" y="${(y(hi) - 4).toFixed(1)}">${Lv.max} mg</text>`; prev = hi; });
  // time ticks
  const narrow = W < 560;
  const step = range <= 3600e3 ? (narrow ? 20 : 10) * 60000 : range <= 6 * 3600e3 ? (narrow ? 2 : 1) * 3600e3 : (narrow ? 6 : 4) * 3600e3;
  for (let t = Math.ceil(from / step) * step; t <= end; t += step) if (x(t) > L + 26 && x(t) < W - Rr - 20) h += `<line x1="${x(t)}" x2="${x(t)}" y1="${T}" y2="${H - B}" stroke="#1d1c19"/><text class="tick" x="${x(t)}" y="${H - 8}" text-anchor="middle">${clock(t)}</text>`;
  if (pts.length > 1) {
    const d = pts.map((e, i) => `${i ? 'L' : 'M'}${x(e.t).toFixed(1)} ${y(e.vedba).toFixed(1)}`).join('');
    h += `<g clip-path="url(#tlc)"><path d="${d}L${x(pts[pts.length - 1].t)} ${H - B}L${x(pts[0].t)} ${H - B}Z" fill="url(#tlg)"/>`;
    if (bucket > 1) h += `<path d="${pts.map((e, i) => `${i ? 'L' : 'M'}${x(e.t).toFixed(1)} ${y(e.peak).toFixed(1)}`).join('')}" fill="none" stroke="#d7b986" stroke-opacity=".22" stroke-width="1"/>`;
    h += `<path class="line" d="${d}" fill="none" stroke="#d7b986" stroke-width="1.6" stroke-linejoin="round"/></g>`;
    for (const e of pts) if (e.bursts) h += `<g class="burst"><line x1="${x(e.t)}" x2="${x(e.t)}" y1="${T}" y2="${H - B}" stroke="#e8a35f" stroke-opacity=".5" stroke-dasharray="2 3"/><path d="M${x(e.t)} ${T - 1} l4 6 -4 6 -4 -6z" fill="#e8a35f"/></g>`;
    for (const e of pts) if (e.clipped) h += `<circle cx="${x(e.t)}" cy="${H - B + 6}" r="2.2" fill="#c0392b"><title>sensor clipped (over 4 g)</title></circle>`;
  } else h += `<text class="empty" x="${W / 2}" y="${H / 2}" text-anchor="middle">No collar data in this window yet</text>`;
  h += `<line class="scrub" x1="0" x2="0" y1="${T}" y2="${H - B}" stroke="#ece8df" stroke-opacity=".5" visibility="hidden"/><circle class="scrubdot" r="4" fill="#0c0c0a" stroke="#ece8df" stroke-width="1.5" visibility="hidden"/>`;
  svg.innerHTML = h;
  const line = svg.querySelector('.line');
  if (line && animate && !reduce()) { const len = line.getTotalLength(); line.style.strokeDasharray = len; line.style.strokeDashoffset = len; requestAnimationFrame(() => { line.style.transition = 'stroke-dashoffset 1.1s cubic-bezier(.3,.7,.2,1)'; line.style.strokeDashoffset = 0; }); }
  // scrub
  const sc = svg.querySelector('.scrub'), dot = svg.querySelector('.scrubdot');
  const move = (cx) => {
    if (pts.length < 2) return;
    const r = svg.getBoundingClientRect(); const vx = ((cx - r.left) / r.width) * W;
    const t = from + ((vx - L) / (W - L - Rr)) * range;
    let best = pts[0]; for (const e of pts) if (Math.abs(e.t - t) < Math.abs(best.t - t)) best = e;
    sc.setAttribute('x1', x(best.t)); sc.setAttribute('x2', x(best.t)); dot.setAttribute('cx', x(best.t)); dot.setAttribute('cy', y(best.vedba));
    sc.setAttribute('visibility', 'visible'); dot.setAttribute('visibility', 'visible');
    const lv = levelOf(best.vedba);
    readout.innerHTML = `<b>${clock(best.t)}</b><span style="color:${LEVEL_TEXT[lv]}">${LEVELS[lv].label}</span><span>${Math.round(best.vedba)} mg</span>${best.pitch !== null && best.pitch !== undefined ? `<span>head ${best.pitch > 0 ? '+' : ''}${best.pitch}°</span>` : ''}${best.bursts ? '<span class="warm">burst</span>' : ''}`;
    readout.classList.add('on');
  };
  svg.onpointermove = (e) => move(e.clientX);
  svg.onpointerdown = (e) => move(e.clientX);
  svg.onpointerleave = () => { sc.setAttribute('visibility', 'hidden'); dot.setAttribute('visibility', 'hidden'); readout.classList.remove('on'); };
}

/* ------------------------------------------------------------------ 24 h rhythm */
export function renderRhythm(svg, center, epochs, { tz, now }) {
  const c = circadian(epochs, { tz, now });
  const n = c.typical.length, S = 320, C = S / 2, r0 = 66, r1 = 128, MAX = 700;
  const len = (v) => (v === null ? 0 : sq(v, MAX) * (r1 - r0));
  const pol = (a, r) => [C + r * Math.sin(a), C - r * Math.cos(a)];
  const wedge = (i, rr0, rr1) => { const a0 = (i / n) * 2 * Math.PI + 0.012, a1 = ((i + 1) / n) * 2 * Math.PI - 0.012; const [x0, y0] = pol(a0, rr0), [x1, y1] = pol(a0, rr1), [x2, y2] = pol(a1, rr1), [x3, y3] = pol(a1, rr0); return `M${x0.toFixed(1)} ${y0.toFixed(1)}L${x1.toFixed(1)} ${y1.toFixed(1)}A${rr1} ${rr1} 0 0 1 ${x2.toFixed(1)} ${y2.toFixed(1)}L${x3.toFixed(1)} ${y3.toFixed(1)}A${rr0} ${rr0} 0 0 0 ${x0.toFixed(1)} ${y0.toFixed(1)}Z`; };
  let h = '';
  for (const f of [0.33, 0.66, 1]) h += `<circle cx="${C}" cy="${C}" r="${r0 + f * (r1 - r0)}" fill="none" stroke="#1f1e1a" stroke-dasharray="${f === 1 ? '0' : '1 4'}"/>`;
  h += `<circle cx="${C}" cy="${C}" r="${r0}" fill="none" stroke="#2a2823"/>`;
  // night shading 22-06
  { // night band 22:00-06:00 as one quiet arc outside the bars
    const a0 = (22 / 24) * 2 * Math.PI, a1 = (30 / 24) * 2 * Math.PI, rr = r1 + 4;
    const [x0, y0] = pol(a0, rr), [x1, y1] = pol(a1, rr);
    h += `<path d="M${x0.toFixed(1)} ${y0.toFixed(1)}A${rr} ${rr} 0 0 1 ${x1.toFixed(1)} ${y1.toFixed(1)}" fill="none" stroke="#6d685e" stroke-width="2" stroke-linecap="round" opacity=".55"/>`;
  }
  for (let i = 0; i < n; i++) {
    const v = c.typical[i]; if (v === null) continue;
    h += `<path class="wd" data-i="${i}" d="${wedge(i, r0, r0 + Math.max(1.5, len(v)))}" fill="${LEVEL_COLORS[levelOf(v)]}" opacity=".62"/>`;
  }
  for (let i = 0; i < n; i++) {
    const v = c.today[i]; if (v === null) continue;
    const a = ((i + 0.5) / n) * 2 * Math.PI, [x, y] = pol(a, r0 + Math.max(2, len(v)));
    h += `<circle class="td" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="1.7" fill="#ece8df"/>`;
  }
  // today path
  const tp = c.today.map((v, i) => (v === null ? null : pol(((i + 0.5) / n) * 2 * Math.PI, r0 + Math.max(2, len(v))))).filter(Boolean);
  if (tp.length > 1) h += `<path d="${tp.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join('')}" fill="none" stroke="#ece8df" stroke-opacity=".55" stroke-width="1"/>`;
  // now hand
  const an = ((c.nowBin + 0.5) / n) * 2 * Math.PI, [hx, hy] = pol(an, r1 + 10), [hx0, hy0] = pol(an, r0 - 3);
  h += `<line x1="${hx0}" y1="${hy0}" x2="${hx}" y2="${hy}" stroke="#d7b986" stroke-width="1" stroke-opacity=".7" stroke-dasharray="1 3"/><circle cx="${hx}" cy="${hy}" r="3" fill="#d7b986"/>`;
  for (const [hr, lab] of [[0, '00'], [6, '06'], [12, '12'], [18, '18']]) { const [x, y] = pol((hr / 24) * 2 * Math.PI, r1 + 22); h += `<text class="tick" x="${x}" y="${y + 3.5}" text-anchor="middle">${lab}</text>`; }
  for (let hr = 0; hr < 24; hr++) { const [x0, y0] = pol((hr / 24) * 2 * Math.PI, r1 + 3), [x1, y1] = pol((hr / 24) * 2 * Math.PI, r1 + (hr % 6 ? 6 : 9)); h += `<line x1="${x0}" y1="${y0}" x2="${x1}" y2="${y1}" stroke="#4a463d"/>`; }
  h += `<path class="hl" d="" fill="none" stroke="#ece8df" stroke-width="1.2"/>`;
  svg.innerHTML = h;
  const hl = svg.querySelector('.hl');
  const pd = c.pastDays;
  const defaultCenter = center.innerHTML = pd
    ? `<span class="micro">Typical day</span><b>${pd} day${pd === 1 ? '' : 's'}</b><span class="micro">hover a slice</span>`
    : `<span class="micro">Typical day</span><b class="none">No data yet</b><span class="micro">starts on day 2</span>`;
  svg.onpointermove = (e) => {
    const r = svg.getBoundingClientRect(); const dx = ((e.clientX - r.left) / r.width) * S - C, dy = ((e.clientY - r.top) / r.height) * S - C;
    const rad = Math.hypot(dx, dy); if (rad < r0 - 8 || rad > r1 + 20) { hl.setAttribute('d', ''); center.innerHTML = defaultCenter; return; }
    let a = Math.atan2(dx, -dy); if (a < 0) a += 2 * Math.PI;
    const i = Math.floor((a / (2 * Math.PI)) * n);
    hl.setAttribute('d', wedge(i, r0, r1));
    const hh = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
    const tv = c.typical[i], dv = c.today[i];
    center.innerHTML = `<span class="micro">${hh(i * c.binMin)}–${hh((i + 1) * c.binMin)}</span><b>${tv === null ? '–' : Math.round(tv)}<small> mg</small></b><span class="micro">typical</span>${dv === null ? '' : `<span class="micro today">today ${Math.round(dv)}</span>`}`;
  };
  svg.onpointerleave = () => { hl.setAttribute('d', ''); center.innerHTML = defaultCenter; };
  return c;
}

/* ------------------------------------------------------------------ 7-day budget */
export function renderBudget(root, epochs, { tz, now }) {
  const days = dayBudget(epochs, { tz, now, days: 7 });
  const today = days[days.length - 1].day;
  // An empty week shows the day axis as quiet tracks and says so once, instead of 7 × "no data".
  const empty = days.every((d) => !d.covered);
  // Empty week: the track runs to the card edge (no blank value/burst cells) and the
  // "active min" header, which would label an empty column, is hidden.
  const unit = root.closest?.('.card')?.querySelector('.bd-unit');
  if (unit) unit.hidden = empty;
  root.innerHTML = days.map((d) => {
    const tot = d.covered || 1;
    const active = activeMinutes(d);
    const label = d.covered ? LEVELS.map((L, i) => `${L.label} ${fmtMin(d.minutes[i])}`).join(', ') : 'no data';
    const cls = ['bd-row', d.day === today ? 'is-today' : '', empty ? 'bd-none' : ''].filter(Boolean).join(' ');
    return `<div class="${cls}" tabindex="0" aria-label="${dayName(d.day)}: ${label}">
      <span class="bd-day">${d.day === today ? 'Today' : dayName(d.day)}</span>
      <span class="bd-bar${empty ? ' none' : ''}">${d.covered ? d.minutes.map((m, i) => `<i style="--w:${((m / tot) * 100).toFixed(2)}%;background:${LEVEL_COLORS[i]}" title="${LEVELS[i].label}: ${fmtMin(m)}"></i>`).join('') : empty ? '' : '<em>no data</em>'}</span>${empty ? '' : `
      <span class="bd-val">${d.covered ? fmtMin(active) : '–'}</span>
      <span class="bd-b">${d.bursts ? `${d.bursts}<svg viewBox="0 0 8 12" aria-hidden="true"><path d="M4 0l4 6-4 6-4-6z" fill="#e8a35f"/></svg>` : ''}</span>`}</div>`;
  }).join('') + (empty ? '<p class="bd-empty">No collar data in the last 7 days. Each day fills in as the collar records; Demo week shows a full one.</p>' : '');
  const full = days.filter((d) => d.covered > 1200 && d.day !== today);
  if (full.length >= 2) {
    const avg = (i) => full.reduce((s, d) => s + d.minutes[i], 0) / full.length;
    const act = activeMinutes, avgAct = full.reduce((s, d) => s + act(d), 0) / full.length;
    const most = full.reduce((a, b) => (act(b) > act(a) ? b : a)), least = full.reduce((a, b) => (act(b) < act(a) ? b : a));
    const sd = Math.sqrt(full.reduce((s, d) => s + (act(d) - avgAct) ** 2, 0) / full.length);
    root.insertAdjacentHTML('beforeend', `<div class="bd-sum">
      <div><span class="micro">Typical full day</span><b>${fmtMin(avgAct)}</b><small>active · ${fmtMin(avg(0))} still</small></div>
      <div><span class="micro">Range</span><b>${fmtMin(act(least))}–${fmtMin(act(most)).replace(' h ', ':')}</b><small>${dayName(least.day)} lowest · ${dayName(most.day)} highest</small></div>
      <div><span class="micro">Day-to-day</span><b>±${fmtMin(sd)}</b><small>${sd < 20 ? 'a steady routine' : sd < 45 ? 'some variation' : 'a lot of variation'}</small></div></div>`);
  }
  requestAnimationFrame(() => requestAnimationFrame(() => root.classList.add('in')));
}

/* ------------------------------------------------------------------ bursts */
export function renderBursts(root, epochs, { limit = 6 } = {}) {
  const bs = burstEvents(epochs).slice(-limit).reverse();
  if (!bs.length) {
    // empty: the anatomy of a burst row (dashed, aria-hidden) + what each column will hold
    root.innerHTML = `<li class="bu-key" aria-hidden="true"><div><b>--:--</b><small>time</small></div>
      <svg viewBox="0 0 140 34"><line x1="0" x2="140" y1="30" y2="30" stroke="var(--line2)" stroke-dasharray="3 3"/><line x1="23" x2="23" y1="2" y2="34" stroke="#e8a35f" stroke-opacity=".45" stroke-dasharray="2 2"/></svg>
      <div class="bm"><span>– g peak</span><span>– to settle</span></div></li>
      <li class="bu-note"><div class="empty">No bursts recorded. A burst is a jolt over 1.5 g (lunge, jump, shake or a bump), not a reaction by itself.</div>
      <div class="bd-empty">Each burst gets a row: its time, movement from 1 min before to 5 min after, the peak, and how long until movement stayed below the vigorous band for 60 s.</div></li>`;
    return;
  }
  root.innerHTML = bs.map((b) => {
    const from = b.start - 60000, to = b.end + 5 * 60000;
    const pts = epochs.filter((e) => e.t >= from && e.t <= to);
    const W = 140, H = 34, x = (t) => ((t - from) / (to - from)) * W, y = (v) => H - 2 - sq(v, 2000) * (H - 4);
    const d = pts.map((e, i) => `${i ? 'L' : 'M'}${x(e.t).toFixed(1)} ${y(e.vedba).toFixed(1)}`).join('');
    return `<li><div><b>${clock(b.start)}</b><small>${new Date(b.start).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}</small></div>
      <svg viewBox="0 0 ${W} ${H}" aria-hidden="true"><line x1="${x(b.start)}" x2="${x(b.start)}" y1="0" y2="${H}" stroke="#e8a35f" stroke-opacity=".6" stroke-dasharray="2 2"/><path d="${d}" fill="none" stroke="#d7b986" stroke-width="1.3"/>${(() => { const pk = pts.reduce((a, e) => (e.vedba > (a ? a.vedba : -1) ? e : a), null); return pk ? `<circle cx="${x(pk.t).toFixed(1)}" cy="${y(pk.vedba).toFixed(1)}" r="2.4" fill="#e8a35f"/>` : ''; })()}</svg>
      <div class="bm"><span>${(b.peak / 1000).toFixed(1)} g peak${b.clipped ? '+' : ''}</span><span>${b.settleS === null ? 'no settle in 30 min' : `settled in ${b.settleS < 60 ? b.settleS + ' s' : fmtMin(b.settleS / 60)}`}</span></div></li>`;
  }).join('');
}

export { esc };
