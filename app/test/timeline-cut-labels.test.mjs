// The "250 mg" / "585 mg" cutoff labels sit inside the plot at its left edge, where a time gridline can
// cross them (at 390 px the first 6 H gridline ran through the "g" of both). They are painted after the
// gridlines, with a halo in the card colour (paint-order: stroke), so a gridline stops short of the text
// instead of striking through it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderTimeline } from '../collar-view.js';

const NOW = Date.parse('2026-11-23T20:00:00Z');
const draw = (width, range) => {
  let html = '';
  const svg = { getBoundingClientRect: () => ({ width, left: 0 }), setAttribute() {}, querySelector: () => null, set innerHTML(v) { html = v; } };
  renderTimeline(svg, {}, [], { now: NOW, range });
  return html;
};

test('cutoff labels are painted after every time gridline, at every width and range', () => {
  for (const width of [320, 340, 390, 1100]) {
    for (const range of [3600e3, 6 * 3600e3, 24 * 3600e3]) {
      const html = draw(width, range);
      const cuts = [...html.matchAll(/<text class="cut"/g)].map((m) => m.index);
      const ticks = [...html.matchAll(/<text class="tick"/g)].map((m) => m.index);
      assert.equal(cuts.length, 2, `two cutoff labels at ${width}/${range / 3600e3} h`);
      assert.ok(ticks.length > 0, `ticks drawn at ${width}/${range / 3600e3} h`);
      assert.ok(Math.min(...cuts) > Math.max(...ticks), `cutoff labels after the gridlines at ${width}/${range / 3600e3} h`);
    }
  }
});

test('cutoff labels carry a halo in the card colour so a crossing gridline stops short of the text', () => {
  const css = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const rule = css.match(/#tl text\.cut\s*\{([^}]*)\}/);
  assert.ok(rule, '#tl text.cut rule');
  assert.match(rule[1], /paint-order:\s*stroke/);
  assert.match(rule[1], /stroke:\s*var\(--bg2\)/);
  const sw = rule[1].match(/stroke-width:\s*([\d.]+)px/);
  assert.ok(sw && Number(sw[1]) >= 3, 'halo at least 3 px wide');
});
