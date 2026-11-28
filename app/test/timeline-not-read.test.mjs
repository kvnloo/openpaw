// The collar timeline shades "not read" spans (Quiet mode no-sample epochs) inside the plot, clamped
// to the visible window, under the movement line, each with a hover title saying what it means.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderTimeline } from '../collar-view.js';

const NOW = Date.parse('2026-11-23T20:00:00Z');
const H1 = 3600e3;
const draw = (width, epochs, opts = {}) => {
  let html = '';
  const svg = { getBoundingClientRect: () => ({ width, left: 0 }), setAttribute() {}, querySelector: () => null, set innerHTML(v) { html = v; } };
  renderTimeline(svg, {}, epochs, { now: NOW, range: H1, ...opts });
  return html;
};
const ep = [...Array(720)].map((_, i) => ({ t: NOW - (719 - i) * 5000, vedba: 40, w: 5, bursts: 0, batt: null }));
const plot = (html) => {
  const m = html.match(/<clipPath id="tlc"><rect x="([\d.]+)" y="0" width="([\d.]+)"/);
  return { left: Number(m[1]), width: Number(m[2]) };
};
const rects = (html) => [...html.matchAll(/<rect class="notread" x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)"[^>]*>(.*?)<\/rect>/g)]
  .map((m) => ({ x: Number(m[1]), y: Number(m[2]), w: Number(m[3]), h: Number(m[4]), inner: m[5], at: m.index }));

test('a not-read span inside the window is shaded at its time position, with a title', () => {
  for (const width of [1100, 340]) {
    const html = draw(width, ep, { notRead: [{ start: NOW - 30 * 60000, end: NOW - 15 * 60000 }] });
    const p = plot(html), r = rects(html);
    assert.equal(r.length, 1, `one shaded span at ${width}`);
    const x0 = p.left + 0.5 * p.width, x1 = p.left + 0.75 * p.width;
    assert.ok(Math.abs(r[0].x - x0) < 0.6, `starts half way along the 1 h plot at ${width}: ${r[0].x} vs ${x0}`);
    assert.ok(Math.abs(r[0].x + r[0].w - x1) < 0.6, `ends three quarters along at ${width}`);
    assert.match(r[0].inner, /<title>[^<]*not read[^<]*<\/title>/i);
    assert.ok(r[0].at < html.indexOf('class="line"'), 'drawn under the movement line');
  }
});

test('spans are clamped to the window and spans outside it are not drawn', () => {
  const html = draw(1100, ep, { notRead: [
    { start: NOW - 3 * H1, end: NOW - 2 * H1 },          // before the window
    { start: NOW - 2 * H1, end: NOW - 50 * 60000 },      // crosses the left edge
  ] });
  const p = plot(html), r = rects(html);
  assert.equal(r.length, 1);
  assert.ok(Math.abs(r[0].x - p.left) < 0.6, 'clamped to the left edge of the plot');
  assert.ok(Math.abs(r[0].w - p.width / 6) < 0.6, '10 of 60 minutes wide');
});

test('no spans, or no notRead option, draws no shading', () => {
  assert.equal(rects(draw(1100, ep)).length, 0);
  assert.equal(rects(draw(1100, ep, { notRead: [] })).length, 0);
});
