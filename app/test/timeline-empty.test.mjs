// With no data in the window, the timeline says so in the middle of the plot (not the middle of the
// svg, which includes the band-name gutter on the right) and, on a second line, how to fill it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderTimeline } from '../collar-view.js';

const NOW = Date.parse('2026-11-23T20:00:00Z');
const draw = (width, epochs = []) => {
  let html = '';
  const svg = { getBoundingClientRect: () => ({ width, left: 0 }), setAttribute() {}, querySelector: () => null, set innerHTML(v) { html = v; } };
  renderTimeline(svg, {}, epochs, { now: NOW });
  return html;
};
const plot = (html) => {
  const m = html.match(/<clipPath id="tlc"><rect x="([\d.]+)" y="0" width="([\d.]+)"/);
  return { left: Number(m[1]), width: Number(m[2]) };
};
const texts = (html, cls) => [...html.matchAll(new RegExp(`<text class="${cls}" x="([\\d.]+)" y="([\\d.]+)"[^>]*>([^<]+)</text>`, 'g'))].map((m) => ({ x: Number(m[1]), y: Number(m[2]), text: m[3] }));

test('empty message is centred on the plot area, with a hint line under it naming how to fill it', () => {
  for (const width of [1100, 340]) {
    const html = draw(width);
    const p = plot(html), mid = p.left + p.width / 2;
    const [msg] = texts(html, 'empty'), [hint] = texts(html, 'empty-hint');
    assert.ok(msg, `message at ${width}`);
    assert.ok(Math.abs(msg.x - mid) < 0.6, `message centred on the plot at ${width}: ${msg.x} vs ${mid}`);
    assert.ok(hint, `hint line at ${width}`);
    assert.match(hint.text, /Connect the collar/);
    assert.match(hint.text, /Demo week/);
    assert.ok(Math.abs(hint.x - mid) < 0.6, `hint centred on the plot at ${width}`);
    assert.ok(hint.y > msg.y + 12 && hint.y < msg.y + 26, `hint sits one line under the message at ${width}`);
    // both lines sit inside one band, clear of every dashed cutoff (glyph box: 13px sans cap ~10 above
    // the baseline, 9.5px mono ~7 above, descenders ~3 below)
    const cuts = [...html.matchAll(/<line x1="[\d.]+" x2="[\d.]+" y1="([\d.]+)" y2="[\d.]+" stroke="#2a2823" stroke-dasharray/g)].map((m) => Number(m[1]));
    for (const c of cuts) {
      for (const [t, up, down] of [[msg, 10, 3], [hint, 7, 3]]) {
        const clear = c < t.y ? t.y - up - c : c - (t.y + down);
        assert.ok(clear >= 5, `"${t.text}" clear of the cutoff at y=${c} by >= 5 px at ${width} (got ${clear.toFixed(1)})`);
      }
    }
  }
});

test('with data in the window, neither the message nor the hint is drawn', () => {
  const ep = [...Array(40)].map((_, i) => ({ t: NOW - (40 - i) * 5000, vedba: 300, w: 5, bursts: 0, batt: null }));
  const html = draw(1100, ep);
  assert.equal(texts(html, 'empty').length, 0);
  assert.equal(texts(html, 'empty-hint').length, 0);
});
