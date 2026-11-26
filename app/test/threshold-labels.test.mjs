// The timeline's dashed band cutoffs carry their value in mg inside the chart, next to the line,
// so the threshold is readable without hunting for it in the legend (still < 250, active < 585).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS, VIGOROUS } from '../collar-analytics.js';
import { renderTimeline } from '../collar-view.js';

const NOW = Date.parse('2026-11-23T20:00:00Z');
const draw = (width, epochs = []) => {
  let html = '';
  const svg = { getBoundingClientRect: () => ({ width, left: 0 }), setAttribute() {}, querySelector: () => null, set innerHTML(v) { html = v; } };
  renderTimeline(svg, {}, epochs, { now: NOW });
  return html;
};

test('each dashed cutoff has an mg label just above it, inside the plot, at desktop and phone widths', () => {
  for (const width of [1100, 340]) {
    const html = draw(width);
    const lines = [...html.matchAll(/<line x1="([\d.]+)" x2="[\d.]+" y1="([\d.]+)" y2="[\d.]+" stroke="#2a2823" stroke-dasharray/g)].map((m) => ({ x: Number(m[1]), y: Number(m[2]) }));
    const labels = [...html.matchAll(/<text class="cut" x="([\d.]+)" y="([\d.]+)"[^>]*>([^<]+)<\/text>/g)].map((m) => ({ x: Number(m[1]), y: Number(m[2]), text: m[3] }));
    const cuts = LEVELS.slice(0, VIGOROUS).map((l) => `${l.max} mg`);
    assert.deepEqual(labels.map((l) => l.text), cuts, `one label per cutoff at ${width}`);
    labels.forEach((l, i) => {
      assert.ok(l.y < lines[i].y && lines[i].y - l.y <= 6, `${l.text} sits just above its line at ${width}`);
      assert.ok(l.x > lines[i].x, `${l.text} starts inside the plot at ${width}`);
    });
  }
});

test('cutoff labels are drawn with data too, under the movement line', () => {
  const ep = [...Array(40)].map((_, i) => ({ t: NOW - (40 - i) * 5000, vedba: 300, w: 5, bursts: 0, batt: null }));
  const html = draw(1100, ep);
  assert.equal((html.match(/<text class="cut"/g) || []).length, VIGOROUS);
  assert.ok(html.indexOf('class="cut"') < html.indexOf('class="line"'), 'labels sit below the data line in paint order');
});
