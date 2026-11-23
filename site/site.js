// Timeline chart (simulated example, deterministic) + scroll reveals. No trackers, no third parties.
(function () {
  const svg = document.getElementById('tl');
  if (svg) {
    const NS = 'http://www.w3.org/2000/svg';
    const el = (n, a) => { const e = document.createElementNS(NS, n); for (const k in a) e.setAttribute(k, a[k]); return e; };
    let s = 7; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const N = 200, pts = [];
    // phase boundaries as fractions: baseline .24, trigger .38, reaction .68, recovery 1
    for (let i = 0; i < N; i++) {
      const t = i / (N - 1);
      let v = 0.07 + rnd() * 0.025;
      if (t > 0.38 && t <= 0.68) { const r = (t - 0.38) / 0.30; v = 0.32 + 0.28 * Math.sin(r * Math.PI) + rnd() * 0.24 * Math.sin(r * Math.PI) + (rnd() > 0.9 ? 0.12 : 0); }
      else if (t > 0.68) { const r = (t - 0.68) / 0.32; v = 0.07 + 0.30 * Math.exp(-r * 4.2) + rnd() * 0.03 * (1 - r); }
      else if (t > 0.34) { v += (t - 0.34) * 2.2; }
      pts.push([t * 1000, 200 - Math.min(v, 0.95) * 190]);
    }
    const defs = el('defs', {}); const g = el('linearGradient', { id: 'gfill', x1: 0, y1: 0, x2: 0, y2: 1 });
    g.append(el('stop', { offset: '0', 'stop-color': '#d7b986', 'stop-opacity': '0.22' }), el('stop', { offset: '1', 'stop-color': '#d7b986', 'stop-opacity': '0' }));
    defs.append(g); svg.append(defs);
    [55, 105, 155].forEach((y) => svg.append(el('line', { x1: 0, x2: 1000, y1: y, y2: y, class: 'grid' })));
    [240, 380, 680].forEach((x) => svg.append(el('line', { x1: x, x2: x, y1: 0, y2: 220, class: 'sep' })));
    const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
    svg.append(el('path', { d: d + ' L1000 220 L0 220 Z', class: 'area' }));
    const line = el('path', { d, class: 'line' }); svg.append(line);
    [[455, 0], [560, 0]].forEach(([x]) => svg.append(el('rect', { x: x - 2, y: 206, width: 4, height: 10, class: 'burst' })));
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches && 'IntersectionObserver' in window) {
      const len = line.getTotalLength();
      line.style.strokeDasharray = len; line.style.strokeDashoffset = len;
      new IntersectionObserver((es, o) => es.forEach((e) => { if (e.isIntersecting) { line.style.transition = 'stroke-dashoffset 2.2s ease'; line.style.strokeDashoffset = 0; o.disconnect(); } }), { threshold: 0.4 }).observe(svg);
    }
  }
  if ('IntersectionObserver' in window && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const items = document.querySelectorAll('.sec-head, .card, .metric, .panel, .three-up > div, .claude, .phone, .band-in, .fit > *, .status, details');
    items.forEach((n) => n.classList.add('rv'));
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -8% 0px' });
    items.forEach((n) => io.observe(n));
  }
})();
