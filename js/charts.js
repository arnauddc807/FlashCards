/**
 * Inline-SVG charts. No dependencies, no canvas — they scale with the phone's
 * pixel density and inherit theme colours from CSS custom properties.
 */

import { el } from './ui.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

function svgEl(tag, attrs = {}) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null) continue;
    node.setAttribute(k, v);
  }
  return node;
}

/**
 * Stacked vertical bars. `series` is an array of
 * { key, label, color } and each bucket carries a numeric value per key.
 */
export function stackedBarChart({
  buckets,
  series,
  height = 150,
  labelEvery = 7,
  labelFor = (b, i) => String(i),
  emptyMessage = 'No data yet',
  valueFor = (b) => b.total,
}) {
  const wrap = el('div', { class: 'chart' });
  const max = Math.max(1, ...buckets.map(valueFor));
  if (!buckets.length || buckets.every((b) => valueFor(b) === 0)) {
    wrap.appendChild(el('p', { class: 'chart__empty', text: emptyMessage }));
    return wrap;
  }

  const width = 320;
  const padBottom = 18;
  const plotH = height - padBottom;
  const gap = buckets.length > 40 ? 0.5 : 1.5;
  const barW = Math.max(1.5, (width - gap * (buckets.length - 1)) / buckets.length);

  const svg = svgEl('svg', {
    viewBox: `0 0 ${width} ${height}`,
    class: 'chart__svg',
    preserveAspectRatio: 'none',
    role: 'img',
  });

  // Horizontal guide lines at 50% and 100% of the max.
  for (const frac of [0.5, 1]) {
    svg.appendChild(svgEl('line', {
      x1: 0, x2: width,
      y1: plotH - plotH * frac, y2: plotH - plotH * frac,
      class: 'chart__grid',
    }));
  }

  buckets.forEach((bucket, i) => {
    const x = i * (barW + gap);
    let y = plotH;
    for (const s of series) {
      const value = bucket[s.key] || 0;
      if (value <= 0) continue;
      const h = (value / max) * plotH;
      y -= h;
      const rect = svgEl('rect', {
        x: x.toFixed(2), y: y.toFixed(2),
        width: barW.toFixed(2), height: Math.max(h, 0.8).toFixed(2),
        fill: s.color, rx: Math.min(1.5, barW / 3),
      });
      rect.appendChild(svgEl('title')).textContent =
        `${labelFor(bucket, i)} — ${s.label}: ${value}`;
      svg.appendChild(rect);
    }
  });

  svg.appendChild(svgEl('line', {
    x1: 0, x2: width, y1: plotH, y2: plotH, class: 'chart__axis',
  }));

  wrap.appendChild(svg);

  const axis = el('div', { class: 'chart__labels' });
  buckets.forEach((bucket, i) => {
    const isLabelled = i % labelEvery === 0 || i === buckets.length - 1;
    axis.appendChild(el('span', {
      class: `chart__label${isLabelled ? '' : ' is-hidden'}`,
      text: isLabelled ? labelFor(bucket, i) : '',
      style: { flex: `1 1 ${100 / buckets.length}%` },
    }));
  });
  wrap.appendChild(axis);

  const peak = el('div', { class: 'chart__scale' }, [
    el('span', { text: `peak ${max}` }),
  ]);
  wrap.appendChild(peak);

  return wrap;
}

/** Legend chips describing a chart's series. */
export function legend(series) {
  return el(
    'div',
    { class: 'legend' },
    series.map((s) =>
      el('span', { class: 'legend__item' }, [
        el('i', { class: 'legend__swatch', style: { background: s.color } }),
        el('span', { text: s.count != null ? `${s.label} ${s.count}` : s.label }),
      ])
    )
  );
}

/** Single horizontal bar split into proportional segments. */
export function proportionBar(segments) {
  const total = segments.reduce((a, s) => a + s.value, 0);
  const bar = el('div', { class: 'propbar', role: 'img' });
  if (total === 0) {
    bar.appendChild(el('div', { class: 'propbar__seg propbar__seg--empty', style: { flex: '1' } }));
    return bar;
  }
  for (const seg of segments) {
    if (seg.value <= 0) continue;
    const node = el('div', {
      class: 'propbar__seg',
      style: { flex: `${seg.value}`, background: seg.color },
      title: `${seg.label}: ${seg.value}`,
    });
    bar.appendChild(node);
  }
  return bar;
}

/** Donut for the card-state mix. */
export function donut({ segments, size = 132, thickness = 16, centerLabel, centerSub }) {
  const total = segments.reduce((a, s) => a + s.value, 0);
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const svg = svgEl('svg', {
    viewBox: `0 0 ${size} ${size}`,
    class: 'donut__svg',
    role: 'img',
  });

  svg.appendChild(svgEl('circle', {
    cx: size / 2, cy: size / 2, r: radius,
    fill: 'none', 'stroke-width': thickness, class: 'donut__track',
  }));

  let offset = 0;
  for (const seg of segments) {
    if (seg.value <= 0 || total === 0) continue;
    const fraction = seg.value / total;
    const arc = svgEl('circle', {
      cx: size / 2, cy: size / 2, r: radius,
      fill: 'none',
      stroke: seg.color,
      'stroke-width': thickness,
      'stroke-dasharray': `${(fraction * circumference).toFixed(2)} ${circumference.toFixed(2)}`,
      'stroke-dashoffset': (-offset * circumference).toFixed(2),
      transform: `rotate(-90 ${size / 2} ${size / 2})`,
      'stroke-linecap': 'butt',
    });
    arc.appendChild(svgEl('title')).textContent = `${seg.label}: ${seg.value}`;
    svg.appendChild(arc);
    offset += fraction;
  }

  return el('div', { class: 'donut' }, [
    svg,
    el('div', { class: 'donut__center' }, [
      el('strong', { text: centerLabel ?? String(total) }),
      centerSub ? el('span', { text: centerSub }) : null,
    ]),
  ]);
}

/** Sparkline-ish line chart for retention over time. */
export function lineChart({ points, height = 120, yMin = 0, yMax = 1, color = 'var(--accent)', formatY = (v) => v }) {
  const wrap = el('div', { class: 'chart' });
  const valid = points.filter((p) => Number.isFinite(p.y));
  if (valid.length < 2) {
    wrap.appendChild(el('p', { class: 'chart__empty', text: 'Not enough data yet' }));
    return wrap;
  }
  const width = 320;
  const padBottom = 16;
  const plotH = height - padBottom;
  const stepX = width / (points.length - 1);
  const toY = (v) => plotH - ((v - yMin) / (yMax - yMin)) * plotH;

  const svg = svgEl('svg', { viewBox: `0 0 ${width} ${height}`, class: 'chart__svg', role: 'img' });

  for (const frac of [0, 0.5, 1]) {
    const y = plotH - plotH * frac;
    svg.appendChild(svgEl('line', { x1: 0, x2: width, y1: y, y2: y, class: 'chart__grid' }));
  }

  let path = '';
  points.forEach((p, i) => {
    if (!Number.isFinite(p.y)) return;
    const x = i * stepX;
    const y = toY(p.y);
    path += `${path ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)} `;
  });

  svg.appendChild(svgEl('path', {
    d: path.trim(), fill: 'none', stroke: color,
    'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round',
  }));

  points.forEach((p, i) => {
    if (!Number.isFinite(p.y)) return;
    const dot = svgEl('circle', { cx: i * stepX, cy: toY(p.y), r: 2.5, fill: color });
    dot.appendChild(svgEl('title')).textContent = `${p.label}: ${formatY(p.y)}`;
    svg.appendChild(dot);
  });

  wrap.appendChild(svg);
  return wrap;
}

export const CHART_COLORS = Object.freeze({
  again: '#ef4444',
  hard: '#f59e0b',
  good: '#22c55e',
  easy: '#38bdf8',
  new: '#6366f1',
  learning: '#f59e0b',
  review: '#22c55e',
  relearning: '#ef4444',
  young: '#34d399',
  mature: '#0ea5e9',
  suspended: '#94a3b8',
});
