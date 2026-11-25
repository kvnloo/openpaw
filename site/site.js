// OpenPaw landing interactions. No trackers, no third parties. Respects reduced motion.
import { simulate, fmtDuration, protocolWeeks, DEFAULTS } from './reactivity-model.js';
import { nearestIndex, stepIndex } from './week-nav.js';
import { tabStep } from './tab-keys.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const NS = 'http://www.w3.org/2000/svg';
const el = (n, a = {}) => { const e = document.createElementNS(NS, n); for (const k in a) e.setAttribute(k, a[k]); return e; };
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const fine = matchMedia('(pointer: fine)').matches;
const ease = (x) => 1 - Math.pow(1 - x, 3);
const lerp = (a, b, k) => a + (b - a) * k;
function tween(ms, fn, done) {
  if (reduce) { fn(1); if (done) done(); return () => {}; }
  let raf, stop = false; const t0 = performance.now();
  const step = (now) => { if (stop) return; const k = Math.min(1, (now - t0) / ms); fn(ease(k)); if (k < 1) raf = requestAnimationFrame(step); else if (done) done(); };
  raf = requestAnimationFrame(step);
  return () => { stop = true; cancelAnimationFrame(raf); };
}
function inView(node, cb, threshold = 0.3) {
  if (!('IntersectionObserver' in window)) return cb();
  const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { cb(); io.disconnect(); } }), { threshold });
  io.observe(node);
}

/* ---------------- scroll progress + active nav + hero scrub ---------------- */
const bar = $('#progress');
const navLinks = $$('.nav nav a[href^="#"]');
const sections = navLinks.map((a) => $(a.getAttribute('href'))).filter(Boolean);
const heroImg = $('.hero-art img');
function onScroll() {
  const h = document.documentElement;
  if (bar) bar.style.transform = `scaleX(${h.scrollTop / Math.max(1, h.scrollHeight - innerHeight)})`;
  let cur = null;
  for (const s of sections) if (s.getBoundingClientRect().top < innerHeight * 0.4) cur = s.id;
  navLinks.forEach((a) => a.classList.toggle('on', a.getAttribute('href') === `#${cur}`));
  if (heroImg && !reduce) { const y = Math.min(1, scrollY / 700); heroImg.style.transform = `translateY(${y * -24}px) scale(${1 + y * 0.04})`; }
}
addEventListener('scroll', () => requestAnimationFrame(onScroll), { passive: true });
onScroll();

/* ---------------- hero live trace ---------------- */
(function live() {
  const svg = $('#live-svg'), val = $('#live-val');
  if (!svg) return;
  const N = 60, data = Array.from({ length: N }, () => 12);
  const path = el('path', { class: 'live-line' }); svg.append(path);
  let t = 0, s = 3;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  function frame() {
    t++;
    const walk = (t % 90) > 40 && (t % 90) < 75;
    const v = walk ? 260 + 140 * Math.sin(t / 2.2) + rnd() * 80 : 10 + rnd() * 9;
    data.push(v); data.shift();
    path.setAttribute('d', data.map((d, i) => `${i ? 'L' : 'M'}${((i / (N - 1)) * 240).toFixed(1)} ${(34 - (d / 520) * 32).toFixed(1)}`).join(''));
    val.textContent = `${Math.round(v)} mg`;
  }
  frame();
  if (!reduce) setInterval(frame, 450);
})();

/* ---------------- magnetic buttons + card spotlight ---------------- */
if (fine && !reduce) {
  $$('.btn-gold').forEach((b) => {
    b.addEventListener('pointermove', (e) => { const r = b.getBoundingClientRect(); b.style.transform = `translate(${((e.clientX - r.left - r.width / 2) * 0.12).toFixed(1)}px, ${((e.clientY - r.top - r.height / 2) * 0.18).toFixed(1)}px)`; });
    b.addEventListener('pointerleave', () => { b.style.transform = ''; });
  });
  $$('.card, .metric, .panel, .week-card, .claude, .lens').forEach((c) => {
    c.classList.add('spot');
    c.addEventListener('pointermove', (e) => { const r = c.getBoundingClientRect(); c.style.setProperty('--mx', `${e.clientX - r.left}px`); c.style.setProperty('--my', `${e.clientY - r.top}px`); });
  });
}

/* ---------------- number tickers ---------------- */
$$('.metric .big').forEach((n) => {
  const node = n.firstChild;
  const m = node && node.nodeValue && node.nodeValue.trim().match(/^(−?)(\d+)(°?)$/);
  if (!m) return;
  const target = +m[2], sign = m[1], deg = m[3];
  if (reduce) return;
  node.nodeValue = `${sign}0${deg}`;
  inView(n, () => tween(1100, (k) => { node.nodeValue = `${sign}${Math.round(target * k)}${deg}`; }));
});

/* ---------------- copy + toast ---------------- */
const toast = $('#toast');
function say(msg) { if (!toast) return; toast.textContent = msg; toast.classList.add('show'); clearTimeout(say.t); say.t = setTimeout(() => toast.classList.remove('show'), 1800); }
$$('[data-copy]').forEach((b) => b.addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(b.dataset.copy.replace(/\\n/g, '\n')); say('Copied. Paste it into your terminal.'); b.textContent = 'Copied'; setTimeout(() => { b.textContent = 'Copy'; }, 1600); }
  catch { say('Copy failed: select the text instead.'); }
}));

/* ---------------- FAQ smooth open ---------------- */
$$('details').forEach((d) => {
  const sum = $('summary', d), body = $('p', d);
  sum.addEventListener('click', (e) => {
    if (reduce || !body.animate) return;
    e.preventDefault();
    if (d.open) {
      const h = body.offsetHeight;
      body.animate([{ height: `${h}px`, opacity: 1 }, { height: '0px', opacity: 0 }], { duration: 200, easing: 'ease-in' }).onfinish = () => { d.open = false; };
    } else {
      d.open = true; const h = body.offsetHeight;
      body.animate([{ height: '0px', opacity: 0 }, { height: `${h}px`, opacity: 1 }], { duration: 300, easing: 'cubic-bezier(.2,.7,.2,1)' });
    }
  });
});

/* ---------------- reactivity lab ---------------- */
(function lab() {
  const svg = $('#lab-svg'); if (!svg) return;
  const W = 800, H = 300, P = DEFAULTS;
  const inD = $('#in-d'), inS = $('#in-s'), inI = $('#in-i');
  const state = { distanceFt: 25, sinceLastMin: 60, interveneAfterS: 6, sleep: 'good' };
  // Time axis: linear before the trigger, square-root after it, so a 5 s rise is readable AND the
  // full 10-minute recovery fits. Ticks below the chart keep the scale honest.
  const T1 = P.duration, TR = P.triggerAt, PRE = 0.12;
  const fx = (t) => (t <= TR ? (t / TR) * PRE : PRE + (1 - PRE) * Math.sqrt((t - TR) / (T1 - TR)));
  const fxInv = (f) => (f <= PRE ? (f / PRE) * TR : TR + Math.pow((f - PRE) / (1 - PRE), 2) * (T1 - TR));
  const x = (t) => fx(t) * W;
  const y = (a) => H - 18 - a * (H - 40);
  const defs = el('defs');
  const g = el('linearGradient', { id: 'labfill', x1: 0, y1: 0, x2: 0, y2: 1 });
  g.append(el('stop', { offset: '0', 'stop-color': '#d7b986', 'stop-opacity': '.26' }), el('stop', { offset: '1', 'stop-color': '#d7b986', 'stop-opacity': '0' }));
  defs.append(g); svg.append(defs);
  const bBase = el('rect', { class: 'band base' }), bEl = el('rect', { class: 'band el' }), bNear = el('rect', { class: 'band near' });
  svg.append(bBase, bEl, bNear);
  const win = el('rect', { class: 'window' }); svg.append(win);
  const thr = el('line', { class: 'thr', x1: 0, x2: W }); svg.append(thr);
  const thrLabel = el('text', { class: 'thr-l', x: 10 }); thrLabel.textContent = 'threshold'; svg.append(thrLabel);
  const trig = el('line', { class: 'mark' }), intv = el('line', { class: 'mark' }); svg.append(trig, intv);
  const area = el('path', { class: 'area', fill: 'url(#labfill)' }), line = el('path', { class: 'curve' }), overSeg = el('path', { class: 'over' });
  svg.append(area, line, overSeg);
  const head = el('line', { class: 'head', y1: 0, y2: H }), dot = el('circle', { class: 'hdot', r: 5 });
  svg.append(head, dot); head.style.opacity = 0; dot.style.opacity = 0;

  let shown = null, cancel = () => {}, lastR = null;
  const sample = (r) => { const out = []; for (let i = 0; i < r.t.length && r.t[i] <= T1; i++) out.push(r.a[i]); return out; };
  const pathFrom = (arr) => arr.map((a, i) => `${i ? 'L' : 'M'}${x(i * P.dt).toFixed(1)} ${y(a).toFixed(1)}`).join('');
  const ticks = $('#lab-ticks');
  if (ticks) ticks.innerHTML = [[TR, 'trigger'], [TR + 60, '+1 min'], [TR + 180, '+3 min'], [TR + 300, '+5 min'], [TR + 540, '+9 min']].map(([t, l]) => `<span style="left:${(fx(t) * 100).toFixed(2)}%">${l}</span>`).join('');
  function overPath(arr) {
    let d = '', on = false;
    arr.forEach((a, i) => { if (a >= P.threshold) { d += `${on ? 'L' : 'M'}${x(i * P.dt).toFixed(1)} ${y(a).toFixed(1)}`; on = true; } else on = false; });
    return d;
  }
  function draw(arr, r) {
    const pf = pathFrom(arr);
    line.setAttribute('d', pf);
    area.setAttribute('d', `${pf} L${W} ${H} L0 ${H} Z`);
    overSeg.setAttribute('d', overPath(arr));
    const yc = y(r.calm + 0.08), yel = y(P.threshold - 0.1), yt = y(P.threshold);
    const rect = (n, yy, hh) => { n.setAttribute('x', 0); n.setAttribute('width', W); n.setAttribute('y', yy); n.setAttribute('height', Math.max(0, hh)); };
    rect(bBase, yc, H - yc); rect(bEl, yel, yc - yel); rect(bNear, 0, yel);
    thr.setAttribute('y1', yt); thr.setAttribute('y2', yt); thrLabel.setAttribute('y', yt - 8);
    const xt = x(P.triggerAt), xi = x(r.removeAt);
    for (const [ln, xx] of [[trig, xt], [intv, xi]]) { ln.setAttribute('x1', xx); ln.setAttribute('x2', xx); ln.setAttribute('y1', H - 12); ln.setAttribute('y2', H); }
    win.setAttribute('x', xt); win.setAttribute('width', Math.max(1, xi - xt)); win.setAttribute('y', 0); win.setAttribute('height', H);
    const at = $('#ax-trig'), ai = $('#ax-int');
    at.style.left = `${(xt / W) * 100}%`; ai.style.left = `${(xi / W) * 100}%`;
    const close = (xi - xt) / W < 0.2;            // labels would collide: anchor them away from each other
    at.classList.toggle('to-left', close); ai.classList.toggle('to-right', close);
    const lab = $('.band-labels');
    lab.style.setProperty('--yb', `${((yc + (H - yc) / 2) / H) * 100}%`);
    lab.style.setProperty('--ye', `${((yel + (yc - yel) / 2) / H) * 100}%`);
    lab.style.setProperty('--yn', `${((yel / 2) / H) * 100}%`);
  }
  function stat(id, text) { const n = $(id); if (n.textContent !== text) { n.textContent = text; n.classList.remove('pop'); void n.offsetWidth; n.classList.add('pop'); } }
  function insight(r) {
    const alt = [];
    if (r.overThresholdS === 0 && r.peak < P.threshold - 0.1) alt.push(`Under threshold the whole time. At ${state.distanceFt} ft this dog can notice the trigger and still take a treat.`);
    if (state.sinceLastMin < 20) {
      const e = simulate({ ...state, sinceLastMin: 30 });
      alt.push(`This trigger came ${state.sinceLastMin} min after the last one. Giving it 30 min first would bring recovery from ${fmtDuration(r.recoveryS)} down to ${fmtDuration(e.recoveryS)}.`);
    }
    if (state.interveneAfterS > 2 && r.overThresholdS > 0) {
      const half = Math.max(1, Math.round(state.interveneAfterS / 2));
      const e = simulate({ ...state, interveneAfterS: half });
      if (r.overThresholdS - e.overThresholdS >= 1) alt.push(`Creating distance at ${half} s instead of ${state.interveneAfterS} s cuts time over threshold from ${fmtDuration(r.overThresholdS)} to ${fmtDuration(e.overThresholdS)}.`);
    }
    if (!alt.length && r.overThresholdS > 0) {
      const e = simulate({ ...state, distanceFt: state.distanceFt + 10 });
      alt.push(`Ten more feet would drop the peak from ${r.peak.toFixed(2)} to ${e.peak.toFixed(2)}.`);
    }
    if (!alt.length) alt.push(`Elevated, but it never reached threshold. Recovery took ${fmtDuration(r.recoveryS)}.`);
    $('#lab-insight').innerHTML = `<span class="mono k">What would change it</span> ${alt[0]}`;
  }
  function update() {
    const r = simulate(state); lastR = r;
    const next = sample(r), from = shown || next;
    cancel();
    cancel = tween(380, (k) => { const cur = next.map((v, i) => lerp(from[i] ?? v, v, k)); shown = cur; draw(cur, r); }, () => { shown = next; });
    stat('#st-peak', r.peak.toFixed(2));
    stat('#st-over', fmtDuration(r.overThresholdS));
    stat('#st-rec', fmtDuration(r.recoveryS));
    $('#st-over').closest('div').classList.toggle('warn', r.overThresholdS > 0);
    insight(r);
  }
  function sync() {
    $('#out-d').textContent = `${state.distanceFt} ft`;
    $('#out-s').textContent = state.sinceLastMin >= 60 ? '60+ min' : `${state.sinceLastMin} min`;
    $('#out-i').textContent = `${state.interveneAfterS} s`;
    for (const [inp, v] of [[inD, state.distanceFt], [inS, state.sinceLastMin], [inI, state.interveneAfterS]]) {
      inp.value = v; inp.style.setProperty('--p', `${((v - inp.min) / (inp.max - inp.min)) * 100}%`);
    }
    $$('.seg button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.sleep === state.sleep)));
    $('.seg').dataset.v = state.sleep;
    update();
  }
  const clearPresets = () => $$('[data-preset]').forEach((b) => b.classList.remove('on'));
  inD.addEventListener('input', () => { state.distanceFt = +inD.value; clearPresets(); sync(); });
  inS.addEventListener('input', () => { state.sinceLastMin = +inS.value; clearPresets(); sync(); });
  inI.addEventListener('input', () => { state.interveneAfterS = +inI.value; clearPresets(); sync(); });
  $$('.seg button').forEach((b) => b.addEventListener('click', () => { state.sleep = b.dataset.sleep; clearPresets(); sync(); }));
  const presets = {
    calm: { distanceFt: 40, sinceLastMin: 60, interveneAfterS: 6, sleep: 'good' },
    stacked: { distanceFt: 25, sinceLastMin: 8, interveneAfterS: 6, sleep: 'short' },
    close: { distanceFt: 12, sinceLastMin: 60, interveneAfterS: 15, sleep: 'good' },
  };
  $$('[data-preset]').forEach((b) => b.addEventListener('click', () => { Object.assign(state, presets[b.dataset.preset]); $$('[data-preset]').forEach((z) => z.classList.toggle('on', z === b)); sync(); }));

  const fig = $('#lab-chart'), scrub = $('#lab-scrub');
  const NAMES = { baseline: 'baseline', elevated: 'elevated', near_threshold: 'near threshold', over_threshold: 'over threshold' };
  function scrubAt(clientX) {
    if (!lastR || !shown) return;
    const r = svg.getBoundingClientRect();
    const f = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    const tt = fxInv(f), i = Math.min(shown.length - 1, Math.round(tt / P.dt));
    const a = shown[i], st = lastR.states[i];
    head.setAttribute('x1', f * W); head.setAttribute('x2', f * W);
    dot.setAttribute('cx', f * W); dot.setAttribute('cy', y(a));
    head.style.opacity = 1; dot.style.opacity = 1;
    scrub.style.left = `${f * 100}%`; scrub.classList.add('on');
    const rel = Math.round(tt - TR), sgn = rel < 0 ? '−' : '+', ab = Math.abs(rel);
    scrub.querySelector('b').textContent = `${sgn}${Math.floor(ab / 60)}:${String(ab % 60).padStart(2, '0')}`;
    scrub.querySelector('span').textContent = `${NAMES[st]} · ${a.toFixed(2)}`;
    scrub.dataset.state = st;
  }
  fig.addEventListener('pointermove', (e) => scrubAt(e.clientX));
  fig.addEventListener('pointerleave', () => { head.style.opacity = 0; dot.style.opacity = 0; scrub.classList.remove('on'); });

  sync();
  if (!reduce) {
    line.style.opacity = 0;
    inView(fig, () => {
      line.style.opacity = 1;
      const len = line.getTotalLength(); line.style.strokeDasharray = `${len}`; line.style.strokeDashoffset = `${len}`;
      line.getBoundingClientRect();
      line.style.transition = 'stroke-dashoffset 1.6s cubic-bezier(.3,.6,.2,1)'; line.style.strokeDashoffset = '0';
      setTimeout(() => { line.style.transition = ''; line.style.strokeDasharray = ''; line.style.strokeDashoffset = ''; }, 1700);
    });
  }
})();

/* ---------------- protocol scoreboard ---------------- */
(function protocol() {
  const svg = $('#proto-svg'); if (!svg) return;
  const weeks = protocolWeeks();
  const W = 900, H = 300, padX = 18, padY = 30;
  const META = {
    thresholdFt: { label: 'Threshold distance', fmt: (v) => `${v} ft` },
    recoveryS: { label: 'Median recovery', fmt: (v) => fmtDuration(v) },
    episodes: { label: 'Episodes', fmt: (v) => `${v}` },
    stacked: { label: 'Stacked triggers', fmt: (v) => `${v}` },
  };
  const xs = weeks.map((_, i) => padX + (i / 7) * (W - 2 * padX));
  for (let i = 1; i < 5; i++) svg.append(el('line', { class: 'grid', x1: 0, x2: W, y1: (H / 5) * i, y2: (H / 5) * i }));
  xs.forEach((xx) => svg.append(el('line', { class: 'grid', x1: xx, x2: xx, y1: 0, y2: H })));
  const defs = el('defs'); const g = el('linearGradient', { id: 'pfill', x1: 0, y1: 0, x2: 0, y2: 1 });
  g.append(el('stop', { offset: '0', 'stop-color': '#d7b986', 'stop-opacity': '.2' }), el('stop', { offset: '1', 'stop-color': '#d7b986', 'stop-opacity': '0' }));
  defs.append(g);
  const area = el('path', { class: 'parea', fill: 'url(#pfill)' }), path = el('path', { class: 'pline' });
  const guide = el('line', { class: 'guide', y1: 0, y2: H });
  svg.append(defs, area, path, guide);
  const dots = xs.map(() => { const c = el('circle', { class: 'pdot', r: 4.5 }); svg.append(c); return c; });
  let metric = 'thresholdFt', ys = null, cancel = () => {}, sel = 7;
  const tip = $('#proto-tip');
  function yFor(m) {
    const vals = weeks.map((w) => w[m]);
    const lo = Math.min(...vals), hi = Math.max(...vals), span = Math.max(1, hi - lo);
    return vals.map((v) => padY + ((v - lo) / span) * (H - 2 * padY)); // lower = better = higher on screen
  }
  function render(arr) {
    const d = arr.map((yy, i) => `${i ? 'L' : 'M'}${xs[i].toFixed(1)} ${yy.toFixed(1)}`).join('');
    path.setAttribute('d', d); area.setAttribute('d', `${d} L${xs[7]} ${H} L${xs[0]} ${H} Z`);
    dots.forEach((c, i) => { c.setAttribute('cx', xs[i]); c.setAttribute('cy', arr[i]); c.classList.toggle('sel', i === sel); });
  }
  function card() {
    const w = weeks[sel], f = weeks[0];
    $('#wk-title').textContent = sel === 7 ? 'This week' : `Week ${sel + 1}`;
    $('#wk-list').innerHTML = Object.entries(META).map(([k, m]) => `<div class="${k === metric ? 'on' : ''}"><dt>${m.label}</dt><dd>${m.fmt(w[k])}</dd></div>`).join('');
    const pct = Math.round((1 - w.recoveryS / f.recoveryS) * 100);
    $('#wk-delta').textContent = sel === 0 ? 'Week 1 is the baseline everything else is compared to.' : `Since week 1: threshold distance ${f.thresholdFt} → ${w.thresholdFt} ft, recovery ${pct > 0 ? `${pct}% faster` : 'not faster yet'}.`;
  }
  function showTip(i) {
    sel = i;
    tip.hidden = false; tip.textContent = `${weeks[i].week} · ${META[metric].fmt(weeks[i][metric])}`;
    tip.style.left = `${(xs[i] / W) * 100}%`; tip.style.top = `${(ys[i] / H) * 100}%`;
    guide.setAttribute('x1', xs[i]); guide.setAttribute('x2', xs[i]); guide.style.opacity = 1;
    render(ys); card();
  }
  function setMetric(m) {
    metric = m; const next = yFor(m), from = ys || next.map(() => H);
    cancel();
    cancel = tween(520, (k) => { const cur = next.map((v, i) => lerp(from[i], v, k)); render(cur); }, () => { ys = next; showTip(sel); });
    $$('#proto-chips [data-m]').forEach((b) => { const on = b.dataset.m === m; b.setAttribute('aria-selected', String(on)); b.classList.toggle('on', on); b.tabIndex = on ? 0 : -1; });
    card();
  }
  const chips = $$('#proto-chips [data-m]');
  chips.forEach((b, i) => {
    b.addEventListener('click', () => setMetric(b.dataset.m));
    // One Tab stop for the chips; Left/Right/Home/End move and select (APG Tabs pattern).
    b.addEventListener('keydown', (e) => {
      const j = tabStep(i, e.key, chips.length); if (j === null) return;
      e.preventDefault(); setMetric(chips[j].dataset.m); chips[j].focus();
    });
  });
  // Mouse hover, phone tap (pointerdown) and keys on the focusable plot all pick a week.
  const plot = svg.closest('.proto-plot');
  const pick = (e) => {
    if (!ys) return;
    const r = svg.getBoundingClientRect();
    const best = nearestIndex(xs, ((e.clientX - r.left) / r.width) * W);
    if (best !== sel || tip.hidden) showTip(best);
  };
  plot.addEventListener('pointermove', pick);
  plot.addEventListener('pointerdown', pick);
  plot.addEventListener('keydown', (e) => { const j = ys ? stepIndex(sel, e.key, weeks.length) : null; if (j === null) return; e.preventDefault(); showTip(j); });
  const loop = $('#loop');
  inView(loop, () => $$('li', loop).forEach((li, i) => setTimeout(() => li.classList.add('lit'), reduce ? 0 : 220 * i)));
  render(weeks.map(() => H)); card();
  inView(svg, () => setMetric('thresholdFt'));
})();

/* ---------------- three lenses ---------------- */
(function lenses() {
  const svg = $('#lens-svg'); if (!svg) return;
  const r = simulate({ distanceFt: 20, sinceLastMin: 8, interveneAfterS: 6, sleep: 'good' });
  const W = 520, H = 220, tEnd = 300;
  let s = 5; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  // Phase-scaled time so every phase is readable: before | rising | peak | recovery.
  const tr = DEFAULTS.triggerAt, pkT = r.peakT, pkEnd = Math.max(r.removeAt + 10, pkT + 15);
  const B = [0, 0.22, 0.42, 0.6, 1], K = [0, tr, pkT, pkEnd, tEnd];
  const warp = (tt) => { for (let k = 0; k < 4; k++) if (tt <= K[k + 1]) return B[k] + ((tt - K[k]) / Math.max(1e-6, K[k + 1] - K[k])) * (B[k + 1] - B[k]); return 1; };
  const pts = [];
  for (let i = 0; i < r.t.length && r.t[i] <= tEnd; i += (r.t[i] > pkEnd ? 4 : 2)) {
    const a = r.a[i], over = Math.max(0, a - 0.35);
    pts.push([warp(r.t[i]) * W, H - 20 - Math.min(0.95, 0.06 + a * 0.6 + over * (rnd() - 0.3) * 0.45 + rnd() * 0.03) * (H - 40)]);
  }
  const ph = document.querySelector('.lens-chart .phases');
  if (ph) ph.style.gridTemplateColumns = B.slice(1).map((b, k) => `${((b - B[k]) * 100).toFixed(1)}%`).join(' ');
  for (let i = 1; i < 4; i++) svg.append(el('line', { class: 'grid', x1: 0, x2: W, y1: (H / 4) * i, y2: (H / 4) * i }));
  [0.22, 0.42, 0.6].forEach((f) => svg.append(el('line', { class: 'sep', x1: f * W, x2: f * W, y1: 0, y2: H })));
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join('');
  svg.append(el('path', { class: 'ltrace', d }));
  const pk = pts.reduce((m, p) => (p[1] < m[1] ? p : m), pts[0]);
  svg.append(el('circle', { class: 'lring', cx: pk[0], cy: pk[1], r: 6 }));
  const hl = el('circle', { class: 'lhl', r: 12, cx: pk[0], cy: pk[1] }); svg.append(hl); hl.style.opacity = 0;

  const rec = fmtDuration(r.recoveryS);
  const LENSES = {
    owner: {
      rows: [['What set it off', 'A stranger, about 20 ft away'], ['What you did', 'U-turn after 6 s'], ['Back to calm', rec], ['Worth knowing', 'Came 8 min after another trigger'], ['This week’s plan', 'U-turns at 40 ft (from your consultant)']],
      ev: [['peak', 'episode 14:02 · 4 records'], ['note', 'your note · “man in a hood”']],
    },
    consult: {
      rows: [['Trigger', 'Stranger, ~20 ft'], ['Precursors', 'Freeze, hard stare (owner note)'], ['Intervention', 'U-turn at 6 s'], ['Recovery', rec], ['Stacked', 'Yes, 8 min after previous']],
      ev: [['peak', 'rec 1204 · VeDBA 912 mg'], ['peak', 'rec 1205 · burst 1'], ['note', 'note · owner 14:02']],
    },
    vet: {
      rows: [['Episodes, 7 days', '6 (2 stacked)'], ['Resting movement, 7 d', 'Within personal range'], ['Night rest, 7 d', '9% below baseline'], ['Heart rate peak (strap)', '168 bpm at 14:02'], ['Raw export', 'JSONL · 12,096 records']],
      ev: [['peak', 'rec 1204 · HR 168 bpm'], ['range', 'baseline · 14-day window'], ['file', 'export · schema 0.1']],
    },
  };
  const tabs = $$('#lens-tabs [role=tab]'), ind = $('.tab-ind'), panel = $('#lens-panel');
  const rows = $('#lens-rows'), ev = $('#lens-ev');
  function place(btn) { if (!btn) return; ind.style.width = `${btn.offsetWidth}px`; ind.style.transform = `translateX(${btn.offsetLeft}px)`; }
  function fill(L) {
    rows.innerHTML = L.rows.map(([k, v]) => `<div><dt class="mono">${k}</dt><dd class="mono">${v}</dd></div>`).join('');
    ev.innerHTML = L.ev.map(([k, v]) => `<li><button type="button" data-k="${k}">${v}</button></li>`).join('');
    $$('button', ev).forEach((b) => {
      const on = () => { if (b.dataset.k === 'peak') hl.style.opacity = 1; };
      const off = () => { hl.style.opacity = 0; };
      b.addEventListener('pointerenter', on); b.addEventListener('focus', on);
      b.addEventListener('pointerleave', off); b.addEventListener('blur', off);
    });
  }
  function show(key, focus) {
    tabs.forEach((t) => { const on = t.dataset.l === key; t.setAttribute('aria-selected', String(on)); t.tabIndex = on ? 0 : -1; if (on) { place(t); panel.setAttribute('aria-labelledby', t.id); if (focus) t.focus(); } });
    const L = LENSES[key];
    if (reduce || !rows.animate || !rows.children.length) return fill(L);
    rows.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(6px)' }], { duration: 130 }).onfinish = () => {
      fill(L);
      rows.animate([{ opacity: 0, transform: 'translateY(-6px)' }, { opacity: 1, transform: 'none' }], { duration: 260, easing: 'cubic-bezier(.2,.7,.2,1)' });
      ev.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300 });
    };
  }
  tabs.forEach((t, i) => {
    t.addEventListener('click', () => show(t.dataset.l));
    t.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const j = (i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
      show(tabs[j].dataset.l, true); e.preventDefault();
    });
  });
  addEventListener('resize', () => place(tabs.find((t) => t.getAttribute('aria-selected') === 'true')));
  show('consult');
  requestAnimationFrame(() => place(tabs.find((t) => t.getAttribute('aria-selected') === 'true')));
  if (document.fonts) document.fonts.ready.then(() => place(tabs.find((t) => t.getAttribute('aria-selected') === 'true')));
})();

/* ---------------- reveals ---------------- */
if ('IntersectionObserver' in window && !reduce) {
  const items = $$('.sec-head, .card, .metric, .panel, .claude, .phone, .band-in, .fit > *, .status, details, .lab-grid, .proto-grid, .lens, .loop, .cost, .vanish');
  items.forEach((n) => n.classList.add('rv'));
  const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -8% 0px' });
  items.forEach((n) => io.observe(n));
}
