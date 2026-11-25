// OpenPaw body-language and needs trainer: lessons, practice (spaced repetition), my-dog profile,
// consent check. Reads/writes only the shared local store (app/store.js); nothing leaves the device.
// SPDX-License-Identifier: GPL-3.0-only

import { getMeta, setMeta, putEvents, allEvents, liveEvents, ownerEvent, dogId, download } from './store.js';
import { LESSONS, CARDS, SOURCE_NAMES, DISCLAIMER, askFor } from './learn-content.js';
import { choiceOrder } from './choice-order.js';

const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u; } };

/* ------------------------------------------------------------------ dog drawing */
// One side-view line dog facing right. Shapes are drawn twice (thick gold stroke, then dark fill)
// so the visible outline is the union of body parts: clean silhouettes without hidden-line clutter.

const PIVOT = [254, 66]; // where the neck meets the head, in head-local coordinates
const HS = 1.12; // head scale in whole-body views (a slightly big head reads better at small sizes)
const LW = 1.7;

const POSTURES = {
  loose: {
    torso: 'M100 100C104 88 130 86 160 88C190 90 210 86 226 92C244 98 248 120 238 134C228 144 212 142 196 140C170 138 140 144 124 142C104 140 96 118 100 100Z',
    near: ['M222 128C224 150 226 168 228 188', 'M120 122C104 142 106 156 118 170L116 188'],
    far: ['M208 130C209 150 210 170 211 188', 'M134 128C124 148 128 164 134 176L132 188'],
    neck: [222, 104], head: { t: [0, 0], r: 0 }, tail: [100, 100], back: [[184, 89], [194, 89], [204, 88], [214, 88], [222, 90]],
    body: [168, 112],
  },
  stiff: {
    torso: 'M106 94C110 82 136 80 166 82C196 84 216 80 232 86C250 92 254 114 244 128C234 138 218 136 202 134C176 132 146 138 130 136C110 134 102 112 106 94Z',
    near: ['M232 122L236 188', 'M126 116C116 136 118 152 124 166L122 188'],
    far: ['M216 124L219 188', 'M140 122C132 140 134 156 138 168L136 188'],
    neck: [230, 98], head: { t: [10, -8], r: -4 }, tail: [106, 94], back: [[186, 83], [196, 83], [206, 82], [216, 82], [226, 84], [140, 81], [150, 81]],
    body: [174, 106],
  },
  crouch: {
    torso: 'M106 136C108 112 140 98 172 100C200 102 222 110 236 120C248 130 246 148 234 156C222 162 206 160 192 158C166 156 140 164 124 162C110 160 104 150 106 136Z',
    near: ['M226 150C238 164 228 176 236 188', 'M124 150C106 164 110 176 126 182L122 188'],
    far: ['M212 154C222 166 214 178 222 188', 'M138 154C126 166 130 176 142 182L138 188'],
    neck: [228, 126], head: { t: [8, 64], r: 16 }, tail: [106, 132], back: [[164, 101], [174, 101], [184, 103], [194, 105]],
    body: [168, 128],
  },
  turn: {
    torso: 'M100 100C104 88 130 86 160 88C190 90 210 86 226 92C244 98 248 120 238 134C228 144 212 142 196 140C170 138 140 144 124 142C104 140 96 118 100 100Z',
    near: ['M222 128C224 150 222 168 222 188', 'M120 122C104 142 106 156 118 170L116 188'],
    far: ['M208 130C209 150 210 170 211 188', 'M134 128C124 148 128 164 134 176L132 188'],
    neck: [222, 104], head: { t: [-10, -2], r: 0, mirror: true }, tail: [100, 100], back: [[184, 89], [194, 89], [204, 88]],
    body: [168, 112],
  },
  paw: {
    torso: 'M100 100C104 88 130 86 160 88C190 90 210 86 226 92C244 98 248 120 238 134C228 144 212 142 196 140C170 138 140 144 124 142C104 140 96 118 100 100Z',
    near: ['M224 128C236 140 248 146 242 162', 'M120 122C104 142 106 156 118 170L116 188'],
    far: ['M210 130C211 150 212 170 213 188', 'M134 128C124 148 128 164 134 176L132 188'],
    neck: [222, 104], head: { t: [-2, 10], r: 8 }, tail: [100, 100], back: [[184, 89], [194, 89], [204, 88]],
    body: [168, 112], paw: [244, 164],
  },
  lie: {
    torso: 'M96 160C100 140 130 134 165 136C200 138 226 136 240 146C252 156 252 178 238 186C200 192 130 192 110 188C96 184 92 172 96 160Z',
    near: ['M226 180L276 186', 'M118 168C140 162 160 174 152 188'],
    far: ['M224 172L268 178'],
    neck: [226, 152], head: { t: [8, 96], r: 4 }, tail: [98, 172], back: [[180, 137], [190, 138]],
    body: [168, 160],
  },
  sniff: {
    torso: 'M100 100C104 88 130 86 160 88C190 90 210 86 226 92C244 98 248 120 238 134C228 144 212 142 196 140C170 138 140 144 124 142C104 140 96 118 100 100Z',
    near: ['M222 128C226 150 230 168 234 188', 'M120 122C104 142 106 156 118 170L116 188'],
    far: ['M208 130C210 150 214 170 216 188', 'M134 128C124 148 128 164 134 176L132 188'],
    neck: [224, 108], head: { t: [8, 72], r: 50 }, tail: [100, 100], back: [[184, 89], [194, 89], [204, 88]],
    body: [160, 112],
  },
  chew: {
    torso: 'M96 160C100 140 130 134 165 136C200 138 226 136 240 146C252 156 252 178 238 186C200 192 130 192 110 188C96 184 92 172 96 160Z',
    near: ['M226 180L274 186', 'M118 168C140 162 160 174 152 188'],
    far: ['M224 172L266 178'],
    neck: [226, 150], head: { t: [0, 82], r: 26 }, tail: [98, 172], back: [[180, 137], [190, 138]],
    body: [168, 160],
  },
  bow: {
    torso: 'M100 78C106 64 134 66 162 74C190 82 212 92 228 104C244 116 244 138 232 148C222 154 208 150 194 144C170 134 142 126 124 118C104 108 96 92 100 78Z',
    near: ['M228 140C234 160 236 174 238 182L282 186', 'M120 100C108 124 112 146 120 164L118 188'],
    far: ['M214 142C220 160 222 172 224 180L268 182', 'M134 108C124 128 128 150 134 168L132 188'],
    neck: [226, 128], head: { t: [8, 66], r: -6 }, tail: [100, 80], back: [[176, 76], [186, 80], [196, 84], [206, 88]],
    body: [164, 98],
  },
};

const HEAD = 'M240 56C242 42 258 34 272 40C278 43 281 48 284 52L306 58C312 59 314 66 309 69L296 72C290 74 284 76 280 76C276 84 266 86 258 84C250 82 242 72 240 56Z';
const EARS = {
  neutral: { d: 'M247 48C244 34 247 24 254 18C260 26 263 36 262 46Z', tip: [254, 24] },
  forward: { d: 'M250 46C250 32 256 20 266 12C270 24 268 36 263 46Z', tip: [264, 18] },
  back: { d: 'M246 50C238 40 231 34 224 32C229 41 240 48 256 46Z', tip: [230, 36] },
  flat: { d: 'M248 48C240 46 230 48 222 54C232 54 244 54 258 48Z', tip: [228, 52] },
};
const TAILS = {
  mid: { d: (x, y) => `M${x} ${y}C${x - 16} ${y - 2} ${x - 30} ${y + 2} ${x - 42} ${y + 10}`, tip: (x, y) => [x - 42, y + 10] },
  high: { d: (x, y) => `M${x} ${y - 2}C${x - 10} ${y - 18} ${x - 14} ${y - 34} ${x - 8} ${y - 50}`, tip: (x, y) => [x - 8, y - 50] },
  low: { d: (x, y) => `M${x} ${y + 2}C${x - 10} ${y + 16} ${x - 14} ${y + 32} ${x - 14} ${y + 50}`, tip: (x, y) => [x - 14, y + 50] },
  tucked: { d: (x, y) => `M${x + 2} ${y + 10}C${x + 4} ${y + 28} ${x + 16} ${y + 38} ${x + 32} ${y + 36}`, tip: (x, y) => [x + 32, y + 36] },
};
const MOUTHS = {
  closed: { lines: ['M308 69C300 72 292 73 285 72'], at: [292, 73] },
  tense: { lines: ['M308 69C298 73 286 75 274 71', 'M274 71C272 74 272 76 274 78'], at: [282, 74] },
  loose: { lines: ['M308 69C298 74 288 76 278 76'], jaw: 'M278 76C285 82 294 84 303 80C305 84 300 89 290 90C278 91 266 89 258 84Z', tongue: 'M288 81C288 90 293 96 299 94C302 92 301 86 300 81', at: [296, 92] },
  lick: { lines: ['M308 69C300 72 292 73 285 72'], tongue: 'M307 69C314 68 318 61 315 55C312 58 311 62 307 66', at: [316, 58] },
  yawn: { lines: ['M308 69C296 73 284 75 272 74'], jaw: 'M272 74C282 88 292 94 302 94C305 98 300 104 288 104C272 103 262 96 256 84Z', cavity: 'M272 74C282 88 292 94 302 94', tongue: 'M282 88C287 96 295 98 300 95', at: [292, 102] },
  snarl: { lines: ['M308 66C302 63 296 64 290 70C288 72 285 72 283 71', 'M287 52C289 55 289 57 287 60', 'M293 54C295 57 295 59 293 62'], teeth: 'M292 70L294 74L296 70L298 74L300 70L302 73L305 67', at: [297, 74] },
};

function headMatrix(h) {
  const [px, py] = PIVOT; const [tx, ty] = h.t; const a = (h.r || 0) * Math.PI / 180;
  const k = h.s || 1;
  const c = Math.cos(a) * k, s = Math.sin(a) * k;
  return ([x, y]) => {
    let dx = x - px, dy = y - py;
    if (h.mirror) dx = -dx;
    return [px + tx + dx * c - dy * s, py + ty + dx * s + dy * c];
  };
}
function headTransform(h) {
  const [px, py] = PIVOT; const [tx, ty] = h.t;
  return `translate(${px + tx} ${py + ty}) rotate(${h.r || 0}) scale(${h.mirror ? -(h.s || 1) : (h.s || 1)} ${h.s || 1}) translate(${-px} ${-py})`;
}

function eyeSvg(type) {
  const g = 'stroke="var(--gold)" stroke-width="1.5"';
  if (type === 'closed') return `<path d="M264 52Q270 56 276 52" fill="none" ${g}/>`;
  if (type === 'whale') return `<path d="M262 52Q270 44 279 51Q271 58 262 52Z" fill="var(--ink)" ${g}/><circle cx="276" cy="51.5" r="2.6" fill="var(--bg)"/><path d="M262 44Q268 41 275 43" fill="none" ${g}/>`;
  if (type === 'hard') return `<circle cx="270" cy="51" r="4.6" fill="none" ${g}/><circle cx="270.5" cy="51" r="2.6" fill="var(--gold)"/><path d="M262 45L279 46.5" fill="none" stroke="var(--gold)" stroke-width="2"/>`;
  return `<path d="M263 52Q270 47 277 52Q270 56 263 52Z" fill="none" ${g}/><circle cx="271" cy="51.8" r="1.8" fill="var(--gold)"/>`;
}

// An open hand (fingertips at 0,0, pointing left) with the forearm running off to the right.
function handSvg(x, y, rot = 0) {
  const m = 'stroke="var(--mute)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"';
  return `<g transform="translate(${x} ${y}) rotate(${rot})">
    <path d="M30 0L160 -6" stroke="var(--mute)" stroke-width="22" stroke-linecap="round" fill="none"/>
    <path d="M30 0L160 -6" stroke="var(--bg)" stroke-width="19" stroke-linecap="round" fill="none"/>
    <path d="M38 -11C27 -13 11 -13 3 -9C-1 -6 0 -1 5 -1C0 1 0 7 7 9C16 11 28 11 38 10Z" fill="var(--bg)" stroke="none"/>
    <path d="M38 -11C27 -13 11 -13 3 -9C-1 -6 0 -1 5 -1C0 1 0 7 7 9C16 11 28 11 38 10" fill="none" ${m}/>
    <path d="M31 -11C29 -18 21 -20 16 -16C18 -13 22 -11 27 -11" fill="var(--bg)" ${m}/>
    <path d="M5 -1L20 -1M7 4.5L20 4.5" fill="none" ${m} stroke-width="1.1"/></g>`;
}

function propSvg(prop, view) {
  const dim = 'stroke="var(--mute)" fill="none" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"';
  if (prop === 'person' && view !== 'head') {
    return `<g ${dim}><circle cx="352" cy="44" r="11"/><path d="M352 56L350 128M350 128L338 194M350 128L364 194M351 72L326 104M351 72L366 108"/></g>`;
  }
  if (prop === 'dog' && view !== 'head') {
    return `<g ${dim} stroke-width="3.6" transform="translate(432 128) scale(-.36 .36)"><path d="M100 100C104 88 130 86 160 88C190 90 210 86 226 92C244 98 248 120 238 134C228 144 212 142 196 140C170 138 140 144 124 142C104 140 96 118 100 100Z"/><path d="M222 128L226 188M208 130L211 188M120 122L116 188M134 128L132 188M100 100C88 96 76 98 66 104M226 96L250 66M244 132L262 84"/><path d="M240 56C242 42 258 34 272 40L306 58C314 62 312 68 306 70L280 76C270 86 252 82 244 72Z"/><path d="M248 48C244 34 247 24 254 18C260 26 263 36 262 46"/></g><text x="358" y="208" class="ptxt" text-anchor="middle">other dog</text>`;
  }
  if (prop === 'hand') return view === 'head' ? handSvg(262, 30, -28) : handSvg(256, 114, -6);
  if (prop === 'chew') return `<g stroke="var(--gold)" stroke-width="1.5" fill="var(--bg)"><path d="M286 182L312 188" stroke-width="7" stroke-linecap="round"/><path d="M286 182L312 188" stroke="var(--bg)" stroke-width="4" stroke-linecap="round"/></g>`;
  return '';
}

function wagSvg(wag, tip) {
  if (!wag || wag === 'none') return '';
  const [x, y] = tip;
  const s = 'stroke="var(--gold)" fill="none" stroke-width="1.3" stroke-linecap="round" opacity=".75"';
  if (wag === 'fast') return `<path d="M${x - 9} ${y - 2}l-4 -3M${x - 9} ${y + 4}l-5 0M${x + 8} ${y - 2}l4 -3M${x + 8} ${y + 4}l5 0" ${s}/>`;
  return `<path d="M${x - 6} ${y - 12}q-12 10 -2 24M${x + 2} ${y - 16}q-18 14 -4 34" ${s}/>`;
}

export function drawDog(art = {}, { title = '' } = {}) {
  const view = art.view || 'body';
  const P = POSTURES[art.posture || 'loose'];
  const h = view === 'head' ? { t: [0, 0], r: 0 } : { ...P.head, s: HS };
  const M = headMatrix(h);
  const neckEnd = M(PIVOT);
  const ear = EARS[art.ears || 'neutral'];
  const mouth = MOUTHS[art.mouth || 'closed'];
  const tail = TAILS[art.tail || 'mid'];
  const tailTip = tail.tip(...P.tail);

  const tubes = []; // [d, width]
  const closed = []; // d
  if (view !== 'head') {
    P.near.forEach((d) => tubes.push([d, 13]));
    tubes.push([tail.d(...P.tail), 7]);
    closed.push(P.torso);
  }
  const neckStart = view === 'head' ? [226, 108] : P.neck;
  tubes.push([`M${neckStart[0]} ${neckStart[1]}L${neckEnd[0].toFixed(1)} ${neckEnd[1].toFixed(1)}`, 32]);

  const outer = [
    ...tubes.map(([d, w]) => `<path d="${d}" stroke-width="${w + LW * 2}" fill="none"/>`),
    ...closed.map((d) => `<path d="${d}" stroke-width="${LW * 2}"/>`),
  ].join('');
  const inner = [
    ...tubes.map(([d, w]) => `<path d="${d}" stroke-width="${w}" fill="none"/>`),
    ...closed.map((d) => `<path d="${d}" stroke="none"/>`),
  ].join('');
  const far = view === 'head' ? '' : P.far.map((d) => `<path d="${d}" stroke-width="${13 + LW * 2}" stroke="var(--line2)"/><path d="${d}" stroke-width="13" stroke="var(--bg2)"/>`).join('');

  const headInner = `
    <path d="${HEAD}" fill="var(--bg)" stroke="var(--gold)" stroke-width="${LW}"/>
    ${mouth.jaw ? `<path d="${mouth.jaw}" fill="var(--bg)" stroke="none"/><path d="${mouth.jaw.replace(/Z$/, '')}" fill="none" stroke="var(--gold)" stroke-width="${LW}" stroke-linejoin="round"/>` : ''}
    ${mouth.tongue ? `<path d="${mouth.tongue}" fill="rgba(215,185,134,.28)" stroke="var(--gold)" stroke-width="1.3"/>` : ''}
    ${mouth.teeth ? `<path d="${mouth.teeth}" fill="var(--ink)" stroke="var(--gold)" stroke-width="1" stroke-linejoin="round"/>` : ''}
    ${mouth.lines.map((d) => `<path d="${d}" fill="none" stroke="var(--gold)" stroke-width="1.5" stroke-linecap="round"/>`).join('')}
    <path d="${ear.d}" fill="var(--bg)" stroke="none"/><path d="${ear.d.replace(/Z$/, '')}" fill="none" stroke="var(--gold)" stroke-width="${LW}" stroke-linejoin="round"/>
    <ellipse cx="309" cy="62.5" rx="4" ry="3.4" fill="var(--gold)"/>
    ${eyeSvg(art.eye || 'soft')}`;

  const back = art.hackles ? P.back.map(([x, y]) => `<path d="M${x - 3} ${y - 1}l-3 -9M${x} ${y - 2}l-1 -11M${x + 3} ${y - 1}l1 -9" />`).join('') : '';

  // Anchors for numbered marks.
  const anchors = {
    ear: M(ear.tip), eye: M([270, 51]), mouth: M(mouth.at), nose: M([309, 62]),
    tail: tailTip, body: P.body, paw: P.paw || P.body, hackles: P.back[Math.floor(P.back.length / 2)].map((v, i) => v - (i ? 8 : 0)),
  };
  const isHead = view === 'head';
  const vb = isHead ? '208 2 126 104' : (art.prop === 'dog' ? '14 0 392 212' : art.prop === 'person' || art.prop === 'hand' ? '14 0 366 212' : '14 0 326 212');
  const r = isHead ? 4.4 : 9;
  const fs = isHead ? 5.8 : 11;
  const OFF = isHead
    ? { ear: [-13, -2], eye: [12, -16], mouth: [12, 8], nose: [8, -10], tail: [0, 0], body: [0, 0], paw: [0, 0], hackles: [0, 0] }
    : { ear: [-16, -12], eye: [0, -26], mouth: [16, 14], nose: [16, -10], tail: [-18, -6], body: [0, -34], paw: [18, 8], hackles: [-6, -22] };
  const marks = (art.marks || []).map(([f, label], i) => {
    const [ax, ay] = anchors[f] || anchors.body;
    const [ox, oy] = OFF[f] || [0, -20];
    const bx = ax + ox, by = ay + oy;
    return `<g class="mk"><path d="M${ax} ${ay}L${bx} ${by}" stroke="var(--ink)" stroke-width="${isHead ? .6 : 1}" opacity=".8"/><circle cx="${ax}" cy="${ay}" r="${isHead ? 1.3 : 2.2}" fill="var(--ink)"/><circle cx="${bx}" cy="${by}" r="${r}" fill="var(--gold)"/><text x="${bx}" y="${by + fs * 0.36}" font-size="${fs}" text-anchor="middle" fill="var(--gold-ink)" font-family="var(--mono)" font-weight="500">${i + 1}</text><title>${esc(label)}</title></g>`;
  }).join('');

  const svg = `<svg class="dog" viewBox="${vb}" role="img" aria-label="${esc(title || (art.marks || []).map((m) => m[1]).join(', ') || 'dog illustration')}" stroke-linecap="round" stroke-linejoin="round">
    ${isHead ? '' : '<path d="M18 196H376" stroke="var(--line2)" stroke-width="1" stroke-dasharray="2 5"/>'}
    ${propSvg(art.prop === 'hand' ? null : art.prop, view)}
    <g fill="none">${far}</g>
    <g stroke="var(--gold)" fill="var(--gold)">${outer}</g>
    <g stroke="var(--bg)" fill="var(--bg)">${inner}</g>
    ${isHead ? '' : wagSvg(art.wag, tailTip)}
    <g stroke="var(--gold)" stroke-width="1.4" fill="none">${back}</g>
    <g transform="${headTransform(h)}">${headInner}</g>
    ${art.prop === 'hand' ? propSvg('hand', view) : ''}
    ${art.prop === 'chew' ? propSvg('chew', view) : ''}
    ${marks}
  </svg>`;
  const legend = (art.marks || []).length
    ? `<ol class="legend">${art.marks.map(([, label], i) => `<li><span class="num">${i + 1}</span>${esc(label)}</li>`).join('')}</ol>` : '';
  return { svg, legend };
}

const LADDER = ['Yawning, blinking, nose licking', 'Turning head away', 'Turning body away, sitting, pawing', 'Walking away', 'Creeping, ears back', 'Standing crouched, tail tucked under', 'Lying down, leg up', 'Stiffening up, staring', 'Growling', 'Snapping', 'Biting'];
function diagram(kind) {
  if (kind === 'ladder') {
    return `<ol class="ladder" reversed>${LADDER.slice().reverse().map((t, i) => {
      const rung = LADDER.length - i; const lvl = rung <= 4 ? 'low' : rung <= 7 ? 'mid' : 'high';
      return `<li class="${lvl}"><span class="rn">${String(rung).padStart(2, '0')}</span>${esc(t)}</li>`;
    }).join('')}</ol>`;
  }
  if (kind === 'stack') {
    return `<svg class="stack" viewBox="0 0 340 170" role="img" aria-label="Arousal rising with three events in a row and crossing the threshold on the third">
      <path d="M20 150H330" stroke="var(--line2)"/><path d="M20 58H330" stroke="var(--gold)" stroke-dasharray="4 4" opacity=".8"/>
      <text x="326" y="52" text-anchor="end" class="ptxt gold">threshold</text>
      <text x="22" y="164" class="ptxt">time \u2192</text>
      <path d="M20 132C44 132 54 132 62 132C72 132 76 98 86 98C100 98 104 118 122 118C132 118 136 82 148 82C162 82 166 102 186 102C196 102 200 44 214 40C230 36 236 70 256 88C276 106 300 120 330 126" fill="none" stroke="var(--gold)" stroke-width="2"/>
      <path d="M206 58L214 40L222 58Z" fill="rgba(215,185,134,.25)"/>
      <g class="ptxt" text-anchor="middle"><text x="86" y="90">truck</text><text x="148" y="74">fenced dog</text><text x="214" y="30">jogger</text><text x="290" y="100">slow recovery</text></g>
      <text x="40" y="126" class="ptxt">baseline</text>
    </svg>`;
  }
  return '';
}

function sourcesHtml(urls) {
  return `<ol class="srcs">${urls.map((u) => `<li><a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(SOURCE_NAMES[u] || host(u))}</a> <span class="mono dim">${esc(host(u))}</span></li>`).join('')}</ol>`;
}

// Public video moments that show a card's signals (links only; nothing is embedded or fetched).
function examplesHtml(list) {
  if (!list || !list.length) return '';
  return `<p class="k">Watch an example</p><ul class="srcs examples">${list.map((e) => `<li><a href="${esc(e.url)}" target="_blank" rel="noopener noreferrer">${esc(e.label)}</a> <span class="mono dim">${esc(host(e.url))}</span></li>`).join('')}</ul>`;
}

/* ------------------------------------------------------------------ state */
let DOG = 'my-dog';
let srs = { cards: {}, streak: { count: 0, last: null }, sessions: 0 };
let profile = null;
let readLessons = {};

const today = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const DAY = 86400000;

/* ------------------------------------------------------------------ tabs */
const TABS = ['learn', 'practice', 'dog'];
function route() {
  const [tab, sub] = (location.hash.replace('#', '') || 'learn').split('/');
  const t = TABS.includes(tab) ? tab : 'learn';
  document.querySelectorAll('.tab').forEach((a) => a.setAttribute('aria-current', a.dataset.tab === t ? 'page' : 'false'));
  document.querySelectorAll('main > section.view').forEach((s) => { s.hidden = s.id !== `v-${t}`; });
  if (t === 'learn') sub ? renderLesson(sub) : renderLessons();
  if (t === 'practice') renderPracticeHome();
  if (t === 'dog') renderDog();
  window.scrollTo(0, 0);
}

/* ------------------------------------------------------------------ learn */
function renderLessons() {
  const v = $('#v-learn');
  const done = LESSONS.filter((l) => readLessons[l.id]).length;
  v.innerHTML = `
    <header class="vh"><p class="eyebrow">Learn \u00b7 ${LESSONS.length} short lessons</p>
      <h1>What is your dog telling you?</h1>
      <p class="lede">Body language, needs and the signs that come before a reaction. Every lesson cites its sources.</p>
      <p class="mono small muted">${done} of ${LESSONS.length} read</p></header>
    <ol class="lessons">${LESSONS.map((l, i) => {
      const f = l.figs.find((x) => x.art);
      const thumb = f ? drawDog({ ...f.art, marks: [] }, { title: f.caption }).svg : diagram(l.figs[0].diagram === 'stack' ? 'stack' : 'stack-mini');
      return `<li><a class="lcard" href="#learn/${l.id}" data-lesson="${l.id}">
        <span class="br tl"></span><span class="br br-"></span>
        <div class="thumb">${l.figs[0].diagram === 'ladder' ? ladderThumb() : thumb}</div>
        <div><p class="k">${String(i + 1).padStart(2, '0')} \u00b7 ${esc(l.tag)}${readLessons[l.id] ? ' \u00b7 read' : ''}</p>
        <h3>${esc(l.title)}</h3><p class="small muted">${esc(l.summary)}</p></div></a></li>`;
    }).join('')}</ol>
    <p class="disclaimer small">${esc(DISCLAIMER)}</p>`;
}
function ladderThumb() {
  return `<svg viewBox="0 0 120 80" class="mini" aria-hidden="true"><path d="M40 6V76M80 6V76" stroke="var(--gold)" stroke-width="1.5"/>${[14, 26, 38, 50, 62].map((y, i) => `<path d="M40 ${y}H80" stroke="var(--gold)" stroke-width="1.5" opacity="${1 - i * 0.15}"/>`).join('')}</svg>`;
}

async function renderLesson(id) {
  const l = LESSONS.find((x) => x.id === id);
  const v = $('#v-learn');
  if (!l) { renderLessons(); return; }
  const idx = LESSONS.indexOf(l);
  const next = LESSONS[idx + 1];
  v.innerHTML = `
    <nav class="crumb mono small"><a href="#learn">\u2190 All lessons</a><span class="dim">${String(idx + 1).padStart(2, '0')} / ${LESSONS.length}</span></nav>
    <article class="lesson" data-lesson="${l.id}">
      <p class="eyebrow">${esc(l.tag)}</p>
      <h1>${esc(l.title)}</h1>
      <p class="lede">${esc(l.summary)}</p>
      <div class="figs n${l.figs.length}">${l.figs.map((f) => {
        if (f.diagram) return `<figure class="fig wide"><span class="br tl"></span><span class="br br-"></span>${diagram(f.diagram)}<figcaption class="mono">${esc(f.caption)}</figcaption></figure>`;
        const { svg, legend } = drawDog(f.art, { title: f.caption });
        return `<figure class="fig"><span class="br tl"></span><span class="br br-"></span>${svg}<figcaption><span class="mono">${esc(f.caption)}</span>${legend}</figcaption></figure>`;
      }).join('')}</div>
      <ul class="points">${l.points.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>
      ${l.contested ? `<aside class="contested"><p class="k">Contested / uncertain</p><p>${esc(l.contested)}</p></aside>` : ''}
      <section class="sources"><p class="k">Sources</p>${sourcesHtml(l.sources)}</section>
      <p class="ask small">Not sure what you are seeing? Film it and ask your behavior consultant or vet.</p>
      <div class="ctas">
        <a class="btn btn-gold" href="#practice" data-act="practice">Practice</a>
        ${next ? `<a class="btn btn-ghost" href="#learn/${next.id}">Next: ${esc(next.title)}</a>` : ''}
      </div>
    </article>`;
  if (!readLessons[l.id]) { readLessons[l.id] = new Date().toISOString(); await setMeta('learn.read', readLessons); }
}

/* ------------------------------------------------------------------ practice */
function cardState(id) { return srs.cards[id]; }
function dueCards(now = Date.now()) {
  const seen = CARDS.filter((c) => cardState(c.id) && cardState(c.id).due <= now).sort((a, b) => cardState(a.id).due - cardState(b.id).due);
  const fresh = CARDS.filter((c) => !cardState(c.id));
  return [...seen, ...fresh];
}
function pickSession(n = 5) {
  let pick = dueCards().slice(0, n);
  if (pick.length < 3) {
    const rest = CARDS.filter((c) => !pick.includes(c)).sort((a, b) => (cardState(a.id)?.due || 0) - (cardState(b.id)?.due || 0));
    pick = [...pick, ...rest].slice(0, Math.max(3, pick.length));
  }
  return pick;
}
export function grade(st, correct, now = Date.now()) {
  const s = st ? { ...st } : { ease: 2.5, interval: 0, reps: 0, due: now, lapses: 0 };
  if (correct) {
    s.reps += 1;
    s.interval = s.reps === 1 ? 1 : s.reps === 2 ? 3 : Math.round(s.interval * s.ease);
    s.ease = Math.min(3, s.ease + 0.1);
    s.due = now + s.interval * DAY;
  } else {
    s.reps = 0; s.lapses = (s.lapses || 0) + 1; s.interval = 0;
    s.ease = Math.max(1.3, s.ease - 0.2);
    s.due = now + 10 * 60000;
  }
  s.last = now;
  return s;
}
const learnedCount = () => CARDS.filter((c) => (cardState(c.id)?.interval || 0) >= 1).length;

function ring(frac, label) {
  const R = 44, C = 2 * Math.PI * R;
  return `<svg class="ring" viewBox="0 0 110 110" role="img" aria-label="${esc(label)}"><circle cx="55" cy="55" r="${R}" stroke="var(--line2)" stroke-width="6" fill="none"/>
    <circle cx="55" cy="55" r="${R}" stroke="var(--gold)" stroke-width="6" fill="none" stroke-linecap="round" stroke-dasharray="${(C * frac).toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 55 55)"/>
    <text x="55" y="58" text-anchor="middle" font-family="var(--serif)" font-size="26" fill="var(--ink)">${Math.round(frac * 100)}%</text>
    <text x="55" y="76" text-anchor="middle" font-family="var(--mono)" font-size="8.5" fill="var(--mute)">LEARNED</text></svg>`;
}

function renderPracticeHome() {
  const v = $('#v-practice');
  const due = dueCards().length;
  const streak = srs.streak.last && (srs.streak.last === today() || srs.streak.last === today(new Date(Date.now() - DAY))) ? srs.streak.count : 0;
  v.innerHTML = `
    <header class="vh"><p class="eyebrow">Practice</p><h1>What is this dog telling you?</h1>
      <p class="lede">Short scenarios. Cards you get right come back later; cards you miss come back soon.</p></header>
    <div class="stats">
      ${ring(learnedCount() / CARDS.length, `${learnedCount()} of ${CARDS.length} cards learned`)}
      <dl><div><dt class="mono">Streak</dt><dd id="streak">${streak} day${streak === 1 ? '' : 's'}</dd></div>
        <div><dt class="mono">Due now</dt><dd id="due">${due}</dd></div>
        <div><dt class="mono">Learned</dt><dd>${learnedCount()} / ${CARDS.length}</dd></div>
        <div><dt class="mono">Sessions</dt><dd>${srs.sessions || 0}</dd></div></dl>
    </div>
    <div class="ctas"><button class="btn btn-gold" id="start">Start a session</button></div>
    <p class="disclaimer small">${esc(DISCLAIMER)}</p>`;
  $('#start').onclick = () => runSession(pickSession());
}

function runSession(cards) {
  const v = $('#v-practice');
  let i = 0, correct = 0; const misses = [];
  const show = () => {
    const c = cards[i];
    const order = choiceOrder(c.choices.length); // fair shuffle, so position is no clue
    const { svg } = drawDog(c.art, { title: c.context });
    v.innerHTML = `
      <nav class="crumb mono small"><a href="#practice" id="quit">\u2190 End session</a><span class="dim">${i + 1} / ${cards.length}</span></nav>
      <div class="pbar"><span style="width:${(i / cards.length) * 100}%"></span></div>
      <article class="quiz" data-card="${c.id}">
        <figure class="fig q"><span class="br tl"></span><span class="br br-"></span>${svg}</figure>
        <div class="qbody"><p class="context">${esc(c.context)}</p>
        <p class="k">${esc(askFor(c))}</p>
        <div class="choices">${order.map((k) => `<button class="choice" data-k="${k}">${esc(c.choices[k])}</button>`).join('')}</div>
        <div class="explain" hidden></div></div>
      </article>`;
    v.querySelectorAll('.choice').forEach((b) => b.onclick = async () => {
      const k = Number(b.dataset.k); const ok = k === c.answer;
      v.querySelectorAll('.choice').forEach((x) => { x.disabled = true; if (Number(x.dataset.k) === c.answer) x.classList.add('right'); });
      if (!ok) { b.classList.add('wrong'); misses.push(c.id); } else correct += 1;
      srs.cards[c.id] = grade(srs.cards[c.id], ok);
      await setMeta('learn.srs', srs);
      const lesson = LESSONS.find((l) => l.id === c.lesson);
      const ex = $('.explain', v);
      ex.hidden = false;
      ex.innerHTML = `<p class="verdict ${ok ? 'ok' : 'no'}">${ok ? 'Right.' : 'Not quite.'}</p><p>${esc(c.explain)}</p>
        <p class="k">Sources</p>${sourcesHtml(c.sources)}
        ${examplesHtml(c.examples)}
        <div class="ctas"><button class="btn btn-gold" id="next">${i + 1 < cards.length ? 'Next' : 'Finish'}</button>
        ${lesson ? `<a class="btn btn-ghost btn-sm" href="#learn/${lesson.id}">Lesson: ${esc(lesson.title)}</a>` : ''}</div>`;
      $('#next').onclick = () => { i += 1; i < cards.length ? show() : finish(); };
      $('#next').focus({ preventScroll: true });
      ex.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
  };
  const finish = async () => {
    const t = today();
    const y = today(new Date(Date.now() - DAY));
    if (srs.streak.last !== t) srs.streak = { count: srs.streak.last === y ? srs.streak.count + 1 : 1, last: t };
    srs.sessions = (srs.sessions || 0) + 1;
    await setMeta('learn.srs', srs);
    await putEvents([ownerEvent({ dog: DOG, kind: 'context', metric: 'learn.session', value: { correct, total: cards.length },
      note: 'Body-language practice session (owner learning, not a dog measurement)', extra: { cards: cards.map((c) => c.id), missed: misses } })]);
    v.innerHTML = `<header class="vh"><p class="eyebrow">Session done</p><h1>${correct} of ${cards.length} right</h1>
      <p class="lede">${misses.length ? 'The ones you missed will come back in a few minutes.' : 'Nice. These cards will come back in a day or more.'}</p></header>
      <div class="stats">${ring(learnedCount() / CARDS.length, 'learned')}<dl><div><dt class="mono">Streak</dt><dd>${srs.streak.count} day${srs.streak.count === 1 ? '' : 's'}</dd></div><div><dt class="mono">Learned</dt><dd>${learnedCount()} / ${CARDS.length}</dd></div></dl></div>
      <div class="ctas"><button class="btn btn-gold" id="again">Another session</button><a class="btn btn-ghost" href="#learn">Back to lessons</a></div>`;
    $('#again').onclick = () => runSession(pickSession());
  };
  show();
}

/* ------------------------------------------------------------------ my dog */
const SUGGEST = {
  comfort: ['soft, blinking eyes', 'loose wiggly body', 'relaxed open mouth', 'flops onto side', 'play bow', 'sniffs around calmly', 'takes treats gently', 'shake-off then moves on'],
  warnings: ['stops sniffing', 'closes mouth', 'lip lick', 'ears go back', 'whale eye', 'tail goes up and stiff', 'freezes', 'hard stare', 'refuses food', 'pulls toward trigger'],
  recovery: ['sniff walk on a long line', 'scatter feeding', 'quiet room', 'lick mat', 'chew', 'more distance', 'going home', 'sleep'],
  treats: ['chicken', 'cheese', 'kibble', 'liver', 'squeeze tube', 'lick mat'],
  games: ['find it', 'tug', 'fetch', 'flirt pole', 'snuffle mat', 'sniff walks'],
};
const AREAS = [['head', 'Top of head'], ['ears', 'Ears'], ['muzzle', 'Muzzle'], ['chest', 'Chest'], ['shoulders', 'Shoulders'], ['back', 'Back'], ['belly', 'Belly'], ['paws', 'Paws'], ['tail', 'Base of tail'], ['hind', 'Hind end']];
const TOUCH = [['likes', 'Likes'], ['ok', 'OK'], ['no', 'Avoid']];
const blankProfile = () => ({ version: 1, dog_id: DOG, name: '', triggers: [], comfort: [], warnings: [], recovery: [], likes: { treats: [], games: [] }, touch: {}, needs: { sleep_h: 12, sniff_min: 30, play_min: 20, meals: 2 }, notes: '', updated_at: null });

function chipField(key, label, hint, path) {
  const vals = getPath(path);
  const sugg = (SUGGEST[key] || []).filter((s) => !vals.includes(s));
  return `<fieldset class="field" data-path="${path}"><legend>${esc(label)}</legend><p class="hint small">${esc(hint)}</p>
    <div class="chips sel">${vals.map((s) => `<button type="button" class="chip on" data-del="${esc(s)}" aria-label="Remove ${esc(s)}">${esc(s)} <span aria-hidden="true">\u00d7</span></button>`).join('') || '<span class="dim small">None yet</span>'}</div>
    <div class="addrow"><input type="text" placeholder="Add your own" aria-label="Add to ${esc(label)}"><button type="button" class="btn btn-ghost btn-sm" data-add>Add</button></div>
    ${sugg.length ? `<div class="chips sug">${sugg.map((s) => `<button type="button" class="chip" data-pick="${esc(s)}">+ ${esc(s)}</button>`).join('')}</div>` : ''}</fieldset>`;
}
function getPath(p) { return p.split('.').reduce((o, k) => (o ? o[k] : undefined), profile) || []; }
function setPath(p, val) { const ks = p.split('.'); const last = ks.pop(); ks.reduce((o, k) => (o[k] ??= {}), profile)[last] = val; }

let saveT = null;
async function saveProfile() {
  profile.updated_at = new Date().toISOString();
  profile.dog_id = DOG;
  await setMeta('profile', profile);
  const s = $('#saved'); if (s) s.textContent = `Saved ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  renderCard();
}
const queueSave = () => { clearTimeout(saveT); saveT = setTimeout(saveProfile, 250); };

function renderDog() {
  const v = $('#v-dog');
  if (!profile) profile = blankProfile();
  const n = profile.needs || {};
  v.innerHTML = `
    <header class="vh"><p class="eyebrow">My dog</p><h1>${profile.name ? esc(profile.name) : 'Your dog\u2019s profile'}</h1>
      <p class="lede">What you learn about your own dog: triggers, early signs, what helps, what they love. Saved only on this device.</p></header>
    <div class="dog-grid">
    <form id="pf" class="pf" autocomplete="off" onsubmit="return false">
      <fieldset class="field"><legend>Name</legend><input type="text" id="pname" value="${esc(profile.name)}" placeholder="Dog\u2019s name"><p class="hint small mono">Dog ID: ${esc(DOG)}</p></fieldset>
      <fieldset class="field"><legend>Known triggers</legend><p class="hint small">What sets them off, and the distance where they usually still cope.</p>
        <div id="trig">${profile.triggers.map((t, i) => `<div class="trow" data-i="${i}"><input type="text" data-k="what" value="${esc(t.what)}" placeholder="e.g. dogs on leash" aria-label="Trigger"><label class="dist"><input type="number" min="0" step="1" data-k="distance_m" value="${esc(t.distance_m ?? '')}" aria-label="Typical distance in metres"><span class="mono small">m</span></label><input type="text" data-k="note" value="${esc(t.note || '')}" placeholder="notes" aria-label="Notes"><button type="button" class="x" data-rm="${i}" aria-label="Remove trigger">\u00d7</button></div>`).join('')}</div>
        <button type="button" class="btn btn-ghost btn-sm" id="addtrig">+ Add trigger</button></fieldset>
      ${chipField('comfort', 'Calm and comfort signals', 'How does your dog look when they are relaxed? These are specific to them.', 'comfort')}
      ${chipField('warnings', 'Early warning signs', 'What does your dog show first, before a reaction? Put the earliest first.', 'warnings')}
      ${chipField('recovery', 'What helps them recover', 'After a reaction or a stressful day.', 'recovery')}
      ${chipField('treats', 'Favourite treats', 'Rank by value if you can: what works near triggers?', 'likes.treats')}
      ${chipField('games', 'Games they love', '', 'likes.games')}
      <fieldset class="field"><legend>Touch</legend><p class="hint small">Where they like being touched, and places to avoid. Use the consent check below to find out.</p>
        <div class="touch">${AREAS.map(([k, label]) => `<div class="trw"><span>${esc(label)}</span><div class="seg" role="radiogroup" aria-label="${esc(label)}">${TOUCH.map(([tk, tl]) => `<button type="button" role="radio" aria-checked="${profile.touch[k] === tk}" data-area="${k}" data-t="${tk}" class="${profile.touch[k] === tk ? 'on ' + tk : ''}">${tl}</button>`).join('')}</div></div>`).join('')}</div></fieldset>
      <fieldset class="field"><legend>Daily needs targets</legend><p class="hint small">Agree these with your vet or consultant; defaults are placeholders.</p>
        <div class="needs">
          <label><span class="mono small">Sleep</span><input type="number" min="0" max="24" step="0.5" data-need="sleep_h" value="${esc(n.sleep_h ?? '')}"><em>h / day</em></label>
          <label><span class="mono small">Sniff walk</span><input type="number" min="0" step="5" data-need="sniff_min" value="${esc(n.sniff_min ?? '')}"><em>min</em></label>
          <label><span class="mono small">Play</span><input type="number" min="0" step="5" data-need="play_min" value="${esc(n.play_min ?? '')}"><em>min</em></label>
          <label><span class="mono small">Meals</span><input type="number" min="0" max="8" step="1" data-need="meals" value="${esc(n.meals ?? '')}"><em>/ day</em></label>
        </div></fieldset>
      <fieldset class="field"><legend>Notes for the vet or consultant</legend><textarea id="pnotes" rows="3" placeholder="Anything else they should know">${esc(profile.notes || '')}</textarea></fieldset>
      <div class="ctas"><button type="button" class="btn btn-gold" id="savep">Save profile</button><span id="saved" class="mono small muted" role="status">${profile.updated_at ? 'Saved' : 'Not saved yet'}</span></div>
    </form>
    <aside class="side">
      <div id="cardwrap"></div>
      <div class="ctas"><button type="button" class="btn btn-ghost btn-sm" id="print">Print card</button><button type="button" class="btn btn-ghost btn-sm" id="export">Export JSON</button></div>
      <section class="consent" id="consent"></section>
    </aside></div>`;
  bindProfile(v);
  renderCard();
  renderConsent();
}

function bindProfile(v) {
  $('#pname').oninput = (e) => { profile.name = e.target.value; queueSave(); };
  $('#pnotes').oninput = (e) => { profile.notes = e.target.value; queueSave(); };
  $('#savep').onclick = saveProfile;
  $('#addtrig').onclick = () => { profile.triggers.push({ what: '', distance_m: null, note: '' }); renderDog(); $('#trig .trow:last-child input')?.focus(); };
  $('#trig').oninput = (e) => {
    const row = e.target.closest('.trow'); if (!row) return;
    const t = profile.triggers[Number(row.dataset.i)]; const k = e.target.dataset.k;
    t[k] = k === 'distance_m' ? (e.target.value === '' ? null : Number(e.target.value)) : e.target.value; queueSave();
  };
  $('#trig').onclick = (e) => { const b = e.target.closest('[data-rm]'); if (b) { profile.triggers.splice(Number(b.dataset.rm), 1); saveProfile().then(renderDog); } };
  v.querySelectorAll('fieldset[data-path]').forEach((fs) => {
    const p = fs.dataset.path;
    const add = (s) => { s = s.trim(); if (!s) return; const vals = getPath(p); if (!vals.includes(s)) setPath(p, [...vals, s]); saveProfile().then(() => { renderDog(); document.querySelector(`fieldset[data-path="${p}"] input`)?.focus({ preventScroll: true }); }); };
    fs.onclick = (e) => {
      const pick = e.target.closest('[data-pick]'); const del = e.target.closest('[data-del]');
      if (pick) add(pick.dataset.pick);
      if (del) { setPath(p, getPath(p).filter((x) => x !== del.dataset.del)); saveProfile().then(renderDog); }
      if (e.target.closest('[data-add]')) add($('input', fs).value);
    };
    $('input', fs).onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); add(e.target.value); } };
  });
  v.querySelectorAll('.seg button').forEach((b) => b.onclick = () => {
    const a = b.dataset.area; profile.touch[a] = profile.touch[a] === b.dataset.t ? undefined : b.dataset.t;
    if (!profile.touch[a]) delete profile.touch[a];
    b.parentElement.querySelectorAll('button').forEach((x) => { const on = profile.touch[a] === x.dataset.t; x.className = on ? `on ${x.dataset.t}` : ''; x.setAttribute('aria-checked', on); });
    queueSave();
  });
  v.querySelectorAll('[data-need]').forEach((inp) => inp.oninput = () => { profile.needs[inp.dataset.need] = inp.value === '' ? null : Number(inp.value); queueSave(); });
  $('#print').onclick = () => window.print();
  $('#export').onclick = () => download(`openpaw-dog-card-${DOG}.json`, JSON.stringify({ kind: 'openpaw.dog_profile', schema_version: '0.1', exported_at: new Date().toISOString(), profile }, null, 2), 'application/json');
}

function renderCard() {
  const w = $('#cardwrap'); if (!w || !profile) return;
  const list = (a) => (a && a.length ? `<ul>${a.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : '<p class="dim small">Not filled in yet</p>');
  const touch = (t) => AREAS.filter(([k]) => profile.touch[k] === t).map(([, l]) => l);
  const n = profile.needs || {};
  const trig = profile.triggers.filter((t) => t.what);
  w.innerHTML = `<article class="dogcard" id="dogcard">
    <span class="br tl"></span><span class="br tr"></span><span class="br bl"></span><span class="br br-"></span>
    <header><p class="mono k">OpenPaw dog card</p><h2>${esc(profile.name || 'Unnamed dog')}</h2><p class="mono small dim">${esc(DOG)}${profile.updated_at ? ` \u00b7 updated ${esc(profile.updated_at.slice(0, 10))}` : ''}</p></header>
    <div class="dc-grid">
      <section><h4>Triggers</h4>${trig.length ? `<ul>${trig.map((t) => `<li>${esc(t.what)}${t.distance_m != null ? ` <span class="mono gold">\u2265 ${esc(t.distance_m)} m</span>` : ''}${t.note ? ` <span class="dim">\u00b7 ${esc(t.note)}</span>` : ''}</li>`).join('')}</ul>` : '<p class="dim small">Not filled in yet</p>'}</section>
      <section><h4>Early warning signs</h4>${list(profile.warnings)}</section>
      <section><h4>Calm signals</h4>${list(profile.comfort)}</section>
      <section><h4>Helps recovery</h4>${list(profile.recovery)}</section>
      <section><h4>Loves</h4>${list([...(profile.likes?.treats || []), ...(profile.likes?.games || [])])}</section>
      <section><h4>Touch</h4><p class="small"><span class="gold">Likes:</span> ${esc(touch('likes').join(', ') || '\u2014')}</p><p class="small"><span class="gold">Avoid:</span> ${esc(touch('no').join(', ') || '\u2014')}</p></section>
      <section class="full"><h4>Daily needs</h4><p class="needsline mono small">sleep ${esc(n.sleep_h ?? '\u2014')} h \u00b7 sniff walk ${esc(n.sniff_min ?? '\u2014')} min \u00b7 play ${esc(n.play_min ?? '\u2014')} min \u00b7 ${esc(n.meals ?? '\u2014')} meals</p></section>
      ${profile.notes ? `<section class="full"><h4>Notes</h4><p class="small">${esc(profile.notes)}</p></section>` : ''}
    </div>
    <footer class="mono small dim">Owner observations, not a diagnosis. Generated by OpenPaw on this device.</footer></article>`;
}

/* ------------------------------------------------------------------ consent check */
const CONSENT_AREAS = [['chest', 'Chest'], ['shoulders', 'Side of shoulder'], ['back', 'Back'], ['head', 'Top of head'], ['ears', 'Ears'], ['tail', 'Base of tail']];
let consentTimer = null;
async function renderConsent(state = 'idle', area = 'chest') {
  const el = $('#consent'); if (!el) return;
  clearInterval(consentTimer);
  const evs = liveEvents(await allEvents()).filter((e) => e.payload?.metric === 'consent.check' && e.dog_id === DOG).sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  const recent = evs.slice(0, 5);
  const label = { leaned_in: 'leaned in', moved_away: 'moved away', neutral: 'neutral' };
  el.innerHTML = `<p class="k">Consent check \u00b7 pet, pause, pet</p>
    <h3>Ask your dog</h3>
    <p class="small muted">Invite your dog over. Pet gently for about 3 seconds, then take your hands away and watch for 3 seconds.</p>
    <label class="small">Where <select id="carea">${CONSENT_AREAS.map(([k, l]) => `<option value="${k}" ${k === area ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    <div class="timer" id="ctimer" data-state="${state}" aria-live="polite"><span class="tnum">3</span><span class="tlabel mono small">${state === 'idle' ? 'ready' : ''}</span></div>
    <div class="ctas"><button type="button" class="btn btn-gold btn-sm" id="cstart">Start: pet now</button></div>
    <div class="cans" id="cans">
      <p class="small">During the pause, your dog\u2026</p>
      <div class="row"><button type="button" class="btn btn-ghost btn-sm" data-ans="leaned_in" disabled>Leaned in</button><button type="button" class="btn btn-ghost btn-sm" data-ans="neutral" disabled>Neutral</button><button type="button" class="btn btn-ghost btn-sm" data-ans="moved_away" disabled>Moved away</button></div>
    </div>
    <p class="small cres" id="cres" role="status"></p>
    ${recent.length ? `<ul class="clog mono small">${recent.map((e) => `<li><span>${esc(new Date(e.timestamp).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }))}</span><span>${esc(e.payload.area || '')}</span><span class="${e.payload.value === 'moved_away' ? 'no' : e.payload.value === 'leaned_in' ? 'gold' : ''}">${esc(label[e.payload.value] || e.payload.value)}</span></li>`).join('')}</ul>` : ''}
    <p class="small dim">If they move away, that is a "no thanks" for now. Never force contact; ask your consultant about cooperative care for handling, grooming and meds.</p>`;
  const tnum = $('.tnum', el), tlab = $('.tlabel', el), tim = $('#ctimer');
  const ans = el.querySelectorAll('[data-ans]');
  const count = (secs, phase, label, done) => {
    let left = secs; tim.dataset.state = phase; tnum.textContent = left; tlab.textContent = label;
    tim.style.setProperty('--p', 0);
    const t0 = performance.now();
    consentTimer = setInterval(() => {
      const el2 = (performance.now() - t0) / 1000;
      tim.style.setProperty('--p', Math.min(1, el2 / secs));
      const l = Math.max(0, Math.ceil(secs - el2));
      if (l !== left) { left = l; tnum.textContent = l; }
      if (el2 >= secs) { clearInterval(consentTimer); done(); }
    }, 100);
  };
  $('#cstart').onclick = () => {
    const a = $('#carea').value;
    $('#cstart').disabled = true; $('#cres').textContent = '';
    count(3, 'pet', 'pet gently', () => count(3, 'pause', 'hands off \u00b7 watch', () => {
      tim.dataset.state = 'ask'; tnum.textContent = '?'; tlab.textContent = 'what did they do?';
      ans.forEach((b) => { b.disabled = false; });
      ans[0].focus({ preventScroll: true });
      ans.forEach((b) => b.onclick = async () => {
        ans.forEach((x) => { x.disabled = true; });
        const val = b.dataset.ans;
        await putEvents([ownerEvent({ dog: DOG, kind: 'observation', metric: 'consent.check', value: val, note: 'Pet-pause-pet consent check', extra: { area: a, pet_s: 3, pause_s: 3 } })]);
        await renderConsent('idle', a);
        $('#cres').textContent = val === 'moved_away' ? 'Logged. Moving away reads as "no thanks": give space for now.' : val === 'leaned_in' ? 'Logged. Leaning in often means "more, please". You can repeat the check.' : 'Logged. Neutral: watch for more signals next time.';
      });
    }));
  };
}

/* ------------------------------------------------------------------ boot */
async function boot() {
  DOG = await dogId();
  srs = (await getMeta('learn.srs')) || srs;
  srs.cards ??= {}; srs.streak ??= { count: 0, last: null };
  profile = (await getMeta('profile')) || null;
  if (profile) { profile = { ...blankProfile(), ...profile, likes: { treats: [], games: [], ...(profile.likes || {}) }, needs: { ...blankProfile().needs, ...(profile.needs || {}) }, touch: profile.touch || {} }; }
  readLessons = (await getMeta('learn.read')) || {};
  window.addEventListener('hashchange', route);
  route();
  document.documentElement.dataset.ready = '1';
}
boot().catch((e) => { console.error(e); const m = $('main'); if (m) m.insertAdjacentHTML('afterbegin', `<p class="err">Could not open local storage: ${esc(e.message)}</p>`); });
