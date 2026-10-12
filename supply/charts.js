/* Small SVG charts for the beverage reports (no outside libraries).
   Two series only: estimated usage (teal) and recorded sales (gold); the pair was
   checked for color-blind separation. Missing data is drawn as text, never as zero. */
(function () {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  function s(tag, attrs, text) {
    const el = document.createElementNS(NS, tag);
    Object.keys(attrs || {}).forEach((k) => el.setAttribute(k, attrs[k]));
    if (text !== undefined) el.textContent = text;
    return el;
  }
  let tipEl = null;
  function tip(e, text) {
    if (!tipEl) { tipEl = document.createElement('div'); tipEl.className = 'tip'; document.body.appendChild(tipEl); }
    if (!text) { tipEl.style.display = 'none'; return; }
    tipEl.textContent = text;
    tipEl.style.display = 'block';
    const x = Math.min(e.clientX + 12, window.innerWidth - 270);
    tipEl.style.left = Math.max(8, x) + 'px';
    tipEl.style.top = (e.clientY + 14) + 'px';
  }
  function hover(el, text) {
    el.addEventListener('mousemove', (e) => tip(e, text));
    el.addEventListener('mouseleave', () => tip(null, ''));
    el.addEventListener('touchstart', (e) => { const t = e.touches[0]; tip({ clientX: t.clientX, clientY: t.clientY }, text); }, { passive: true });
    el.appendChild(s('title', {}, text));
  }
  function niceMax(v) {
    if (v <= 5) return 5;
    const p = Math.pow(10, Math.floor(Math.log10(v)));
    const n = v / p;
    return (n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
  }
  // Rounded data-end bar anchored at the baseline.
  function bar(x, y, w, hgt, cls, horizontal) {
    const r = Math.min(4, (horizontal ? hgt : w) / 2, horizontal ? w : hgt);
    let d;
    if (horizontal) d = `M${x},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + hgt - r} Q${x + w},${y + hgt} ${x + w - r},${y + hgt} H${x} Z`;
    else d = `M${x},${y + hgt} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + hgt} Z`;
    return s('path', { d, class: cls });
  }

  // One row per product: usage bar and (if recorded) sales bar.
  function productBars(rows, opts) {
    opts = opts || {};
    // Drawn at roughly the size it will appear, so labels stay readable on phones.
    const W = Math.max(300, Math.min(640, (window.innerWidth || 640) - 70));
    const labelW = Math.round(W * 0.34), rowH = 46, top = 26;
    const maxChars = Math.floor(labelW / 7);
    const vals = [];
    rows.forEach((r) => { if (r.usage > 0) vals.push(r.usage); if (r.sales > 0) vals.push(r.sales); });
    const max = niceMax(Math.max(1, ...vals));
    const plotW = W - labelW - 70;
    const H = top + rows.length * rowH + 10;
    const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart', role: 'img', 'aria-label': opts.label || 'Estimated usage by product' });
    for (let i = 0; i <= 5; i++) {
      const x = labelW + plotW * i / 5;
      svg.appendChild(s('line', { x1: x, x2: x, y1: top - 6, y2: H - 6, class: 'grid' }));
      svg.appendChild(s('text', { x, y: 14, 'text-anchor': 'middle' }, String(max * i / 5)));
    }
    rows.forEach((r, i) => {
      const y = top + i * rowH;
      const name = r.label.length > maxChars ? r.label.slice(0, maxChars - 1) + '…' : r.label;
      svg.appendChild(s('text', { x: labelW - 8, y: y + 20, 'text-anchor': 'end', class: 'lbl' }, name));
      const g = s('g', {});
      if (r.usage === null || r.usage === undefined) {
        g.appendChild(s('text', { x: labelW + 4, y: y + 20 }, r.statusText || 'Insufficient data'));
      } else {
        const w = Math.max(r.usage > 0 ? 2 : 0, plotW * Math.max(0, r.usage) / max);
        if (w > 0) g.appendChild(bar(labelW, y + 6, w, 16, 'usage', true));
        g.appendChild(s('text', { x: labelW + w + 6, y: y + 19, class: 'lbl' }, String(r.usage) + (r.usage < 0 ? ' (check)' : '')));
      }
      if (r.sales !== null && r.sales !== undefined) {
        const w2 = Math.max(r.sales > 0 ? 2 : 0, plotW * r.sales / max);
        if (w2 > 0) g.appendChild(bar(labelW, y + 25, w2, 12, 'sales', true));
        g.appendChild(s('text', { x: labelW + w2 + 6, y: y + 36 }, 'sales ' + r.sales));
      }
      const hit = s('rect', { x: 0, y, width: W, height: rowH - 2, fill: 'transparent', class: 'hit' });
      hover(hit, r.label + ': ' + (r.usage === null || r.usage === undefined ? (r.statusText || 'Insufficient data') : 'estimated usage ' + r.usage) +
        (r.sales !== null && r.sales !== undefined ? '; recorded sales ' + r.sales : '; no sales recorded'));
      g.appendChild(hit);
      svg.appendChild(g);
    });
    return svg;
  }

  // One product across weeks: usage per week (and sales if recorded).
  function weeklyBars(points, opts) {
    opts = opts || {};
    const W = Math.max(300, Math.min(640, (window.innerWidth || 640) - 70)), H = 260, left = 40, bottom = 46, top = 16;
    const vals = [];
    points.forEach((p) => { if (p.usage > 0) vals.push(p.usage); if (p.sales > 0) vals.push(p.sales); });
    const max = niceMax(Math.max(1, ...vals));
    const plotH = H - top - bottom, plotW = W - left - 10;
    const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart', role: 'img', 'aria-label': opts.label || 'Weekly usage' });
    for (let i = 0; i <= 5; i++) {
      const y = top + plotH - plotH * i / 5;
      svg.appendChild(s('line', { x1: left, x2: W - 10, y1: y, y2: y, class: 'grid' }));
      svg.appendChild(s('text', { x: left - 6, y: y + 4, 'text-anchor': 'end' }, String(max * i / 5)));
    }
    const n = Math.max(1, points.length);
    const slot = plotW / n;
    const bw = Math.min(26, slot / 3);
    points.forEach((p, i) => {
      const cx = left + slot * i + slot / 2;
      const g = s('g', {});
      if (p.usage === null || p.usage === undefined) {
        g.appendChild(s('text', { x: cx, y: top + plotH - 6, 'text-anchor': 'middle' }, 'no data'));
      } else if (p.usage > 0) {
        const hh = plotH * p.usage / max;
        g.appendChild(bar(cx - bw - 1, top + plotH - hh, bw, hh, 'usage', false));
      } else {
        g.appendChild(s('text', { x: cx - bw / 2, y: top + plotH - 4, 'text-anchor': 'middle' }, String(p.usage)));
      }
      if (p.sales > 0) {
        const hh = plotH * p.sales / max;
        g.appendChild(bar(cx + 1, top + plotH - hh, bw, hh, 'sales', false));
      }
      g.appendChild(s('text', { x: cx, y: H - bottom + 18, 'text-anchor': 'middle' }, p.label));
      const hit = s('rect', { x: cx - slot / 2, y: top, width: slot, height: plotH, fill: 'transparent', class: 'hit' });
      hover(hit, 'Week of ' + p.label + ': ' + (p.usage === null || p.usage === undefined ? 'insufficient data' : 'estimated usage ' + p.usage) +
        (p.sales !== null && p.sales !== undefined ? '; recorded sales ' + p.sales : ''));
      g.appendChild(hit);
      svg.appendChild(g);
    });
    svg.appendChild(s('line', { x1: left, x2: W - 10, y1: top + plotH, y2: top + plotH, stroke: '#9fb3b6' }));
    return svg;
  }

  // Supplier purchase history: cases by season, per product.
  function seasonBars(rows) {
    return productBars(rows.map((r) => ({ label: r.label, usage: r.a, sales: r.b, statusText: 'No record' })), { label: 'Cases purchased by season' });
  }

  function legend(items) {
    const el = document.createElement('div');
    el.className = 'legend';
    items.forEach((it) => {
      const sp = document.createElement('span');
      sp.style.setProperty('--c', it[1]);
      sp.textContent = it[0];
      el.appendChild(sp);
    });
    return el;
  }

  window.SMCharts = { productBars, weeklyBars, seasonBars, legend };
})();
