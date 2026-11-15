// Hand-built SVG charts: no library, works offline, sized to their container.
import { h, s, DAY, MON, clamp, num } from './util.js';

/** Chart colours as plain hex (validated for colour-blind separation on the dark card surface). */
export const C = { c1: '#3987e5', c2: '#d95926', c3: '#199e70', gold: '#e8b04a', mute: '#6e7a88' };

/** A div that (re)draws its chart whenever its width changes. */
export function mount(draw, height = 190) {
  const el = h('div', { class: 'chart', style: { height: height + 'px' } });
  let last = 0;
  new ResizeObserver(() => {
    const w = Math.floor(el.clientWidth);
    if (w > 0 && w !== last) { last = w; el.replaceChildren(); draw(el, w, height); }
  }).observe(el);
  return el;
}

function niceTicks(lo, hi, n = 4) {
  if (!(hi > lo)) { lo -= 1; hi += 1; }
  const raw = (hi - lo) / n, mag = 10 ** Math.floor(Math.log10(raw)), f = raw / mag;
  const step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * mag;
  const out = [];
  for (let v = Math.floor(lo / step) * step; v <= hi + step * 1e-6; v += step) out.push(+v.toFixed(8));
  if (out.at(-1) < hi - step * 1e-6) out.push(+(out.at(-1) + step).toFixed(8));
  return out;
}

function timeTicks(x0, x1, pw) {
  const span = (x1 - x0) / DAY, max = Math.max(2, Math.floor(pw / 58)), out = [];
  if (span <= 62) {
    let step = 14;
    for (const st of [1, 2, 7, 14]) if (span / st <= max) { step = st; break; }
    const d = new Date(x0); d.setHours(0, 0, 0, 0);
    if (d.getTime() < x0) d.setDate(d.getDate() + 1);
    for (; d.getTime() <= x1; d.setDate(d.getDate() + step)) out.push({ x: d.getTime(), label: `${d.getDate()} ${MON[d.getMonth()]}` });
  } else {
    const months = span / 30.44;
    let step = 24;
    for (const st of [1, 2, 3, 6, 12, 24]) if (months / st <= max) { step = st; break; }
    const d = new Date(x0); d.setDate(1); d.setHours(0, 0, 0, 0);
    if (d.getTime() < x0) d.setMonth(d.getMonth() + 1);
    while (d.getMonth() % Math.min(step, 12)) d.setMonth(d.getMonth() + 1);
    for (; d.getTime() <= x1; d.setMonth(d.getMonth() + step)) {
      out.push({ x: d.getTime(), label: d.getMonth() === 0 ? String(d.getFullYear()) : MON[d.getMonth()] });
    }
  }
  return out;
}

/** Crosshair + tooltip that follows a finger or the mouse. items: [{px, title, rows:[{label,value,color}], marks:[{py,color}]}] */
function scrub(el, svg, items, { top, bottom, w, onShow }) {
  if (!items.length) return;
  const line = s('line', { class: 'cross', y1: top, y2: bottom, visibility: 'hidden' });
  const dots = s('g');
  svg.append(line, dots);
  const tip = h('div', { class: 'tip', hidden: true });
  el.append(tip);
  let cur = null;
  const show = it => {
    if (it === cur) return;
    cur = it;
    line.setAttribute('x1', it.px); line.setAttribute('x2', it.px); line.setAttribute('visibility', 'visible');
    dots.replaceChildren(...(it.marks || []).map(m => s('circle', { cx: it.px, cy: m.py, r: 5, fill: m.color, class: 'ring' })));
    tip.replaceChildren(
      h('div', { class: 'tip-title' }, it.title),
      ...it.rows.map(r => h('div', { class: 'tip-row' },
        r.color ? h('i', { class: 'sw', style: { background: r.color } }) : null,
        h('span', { class: 'tip-label' }, r.label), h('b', null, r.value))));
    tip.hidden = false;
    const tw = tip.offsetWidth;
    tip.style.left = clamp(it.px < w / 2 ? it.px + 12 : it.px - 12 - tw, 0, Math.max(0, w - tw)) + 'px';
    tip.style.top = top + 'px';
    onShow?.(it);
  };
  const hide = () => { cur = null; line.setAttribute('visibility', 'hidden'); dots.replaceChildren(); tip.hidden = true; onShow?.(null); };
  const pick = e => {
    const px = e.clientX - svg.getBoundingClientRect().left;
    let best = items[0], bd = Infinity;
    for (const it of items) { const d = Math.abs(it.px - px); if (d < bd) { bd = d; best = it; } }
    show(best);
  };
  svg.addEventListener('pointerdown', pick);
  svg.addEventListener('pointermove', pick);
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) svg.addEventListener(ev, hide);
}

function frame(w, H, ticks, labels, label) {
  const ml = Math.max(...labels.map(t => t.length)) * 6.3 + 12, mr = 12, mt = 10, mb = 22;
  const svg = s('svg', { width: w, height: H, viewBox: `0 0 ${w} ${H}`, role: 'img', 'aria-label': label || 'Chart' });
  return { svg, ml, mr, mt, mb, pw: w - ml - mr, ph: H - mt - mb };
}
function xLabel(svg, px, H, w, text) {
  svg.append(s('text', { x: px, y: H - 6, class: 'tick', 'text-anchor': px < 22 ? 'start' : px > w - 22 ? 'end' : 'middle' }, text));
}

/**
 * Line / band / dot chart over time (or over any numeric x when xTicks is given).
 * o = { x0, x1, series:[{pts:[{x,y}], color, kind:'line'|'linedots'|'dots', dash, width, area}],
 *       band:{pts:[{x,lo,hi}], color} or bands:[...], markers:[{x,y}], trend:{x0,y0,x1,y1}, zero, yFmt,
 *       xTicks:[{x,label}], scrub:[{x,title,rows,marks:[{y,color}]}], label }
 */
export function xyChart(el, w, H, o) {
  const fmt = o.yFmt || (v => num(v, 1));
  let lo = Infinity, hi = -Infinity;
  const see = v => { if (v != null && isFinite(v)) { if (v < lo) lo = v; if (v > hi) hi = v; } };
  o.series.forEach(sr => sr.pts.forEach(p => see(p.y)));
  const bands = [...(o.bands || []), ...(o.band ? [o.band] : [])].filter(b => b.pts.length);
  bands.forEach(bd => bd.pts.forEach(p => { see(p.lo); see(p.hi); }));
  if (lo === Infinity) { lo = 0; hi = 1; }
  if (o.zero) lo = Math.min(lo, 0);
  const padY = (hi - lo) * 0.1 || Math.abs(hi) * 0.05 || 1;
  const ticks = niceTicks(o.zero && lo === 0 ? 0 : lo - padY, hi + padY, H > 150 ? 4 : 3);
  lo = ticks[0]; hi = ticks.at(-1);
  const labels = ticks.map(fmt);
  const { svg, ml, mr, mt, pw, ph } = frame(w, H, ticks, labels, o.label);
  const x0 = o.x0, x1 = o.x1 > o.x0 ? o.x1 : o.x0 + 1, inset = 6;
  const X = x => ml + inset + (x - x0) / (x1 - x0) * (pw - 2 * inset);
  const Y = y => mt + (1 - (y - lo) / (hi - lo)) * ph;
  const f = v => +v.toFixed(1);

  ticks.forEach((t, i) => svg.append(
    s('line', { x1: ml, x2: w - mr, y1: Y(t), y2: Y(t), class: 'grid' + (t === 0 && lo < 0 ? ' zero' : '') }),
    s('text', { x: ml - 7, y: Y(t) + 3.5, class: 'tick', 'text-anchor': 'end' }, labels[i])));
  (o.xTicks || timeTicks(x0, x1, pw)).forEach(t => xLabel(svg, X(t.x), H, w, t.label));

  for (const bd of bands) {
    const b = bd.pts;
    if (b.length === 1) svg.append(s('line', { x1: X(b[0].x), x2: X(b[0].x), y1: Y(b[0].hi), y2: Y(b[0].lo), stroke: bd.color, 'stroke-width': 8, 'stroke-linecap': 'round', opacity: .3 }));
    else svg.append(s('path', {
      d: 'M' + b.map(p => `${f(X(p.x))},${f(Y(p.hi))}`).join('L') + 'L' + b.slice().reverse().map(p => `${f(X(p.x))},${f(Y(p.lo))}`).join('L') + 'Z',
      fill: bd.color, opacity: bands.length > 1 ? .2 : .26,
    }));
  }
  for (const sr of o.series) {
    if (!sr.pts.length) continue;
    const kind = sr.kind || 'linedots', path = 'M' + sr.pts.map(p => `${f(X(p.x))},${f(Y(p.y))}`).join('L');
    if (sr.area && sr.pts.length > 1) svg.append(s('path', { d: `${path}L${f(X(sr.pts.at(-1).x))},${f(Y(lo))}L${f(X(sr.pts[0].x))},${f(Y(lo))}Z`, fill: sr.color, opacity: .1 }));
    if (kind !== 'dots' && sr.pts.length > 1) svg.append(s('path', { d: path, fill: 'none', stroke: sr.color, 'stroke-width': sr.width || 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round', 'stroke-dasharray': sr.dash || null }));
    const sparse = sr.pts.length <= pw / 9;
    if (kind === 'dots' || (kind === 'linedots' && sr.pts.length <= pw / 4) || sr.pts.length === 1) {
      const r = sparse ? 3.5 : 2;
      for (const p of sr.pts) svg.append(s('circle', { cx: f(X(p.x)), cy: f(Y(p.y)), r, fill: sr.color, class: sparse ? 'ring' : null }));
    }
  }
  if (o.trend) svg.append(s('line', { x1: X(o.trend.x0), y1: Y(o.trend.y0), x2: X(o.trend.x1), y2: Y(o.trend.y1), class: 'trend' }));
  for (const m of o.markers || []) svg.append(s('circle', { cx: f(X(m.x)), cy: f(Y(m.y)), r: 4.5, class: 'pr-dot ring' }));

  el.append(svg);
  scrub(el, svg, (o.scrub || []).map(p => ({ px: X(p.x), title: p.title, rows: p.rows, marks: (p.marks || []).filter(m => m.y != null).map(m => ({ py: Y(m.y), color: m.color })) })),
    { top: mt, bottom: mt + ph, w });
}

/** Vertical bars from zero. o = { bins:[{v, title, tick, rows}], color, yFmt, avg, label } */
export function barChart(el, w, H, o) {
  const fmt = o.yFmt || (v => num(v, 0));
  const max = Math.max(1e-9, ...o.bins.map(b => b.v), o.avg || 0);
  let ticks = niceTicks(0, max * 1.05, 3);
  if (o.integer) ticks = ticks.filter(t => Number.isInteger(t));
  const hi = ticks.at(-1), labels = ticks.map(fmt);
  const { svg, ml, mr, mt, pw, ph } = frame(w, H, ticks, labels, o.label);
  const Y = y => mt + (1 - y / hi) * ph, n = o.bins.length, slot = pw / n;
  const bw = clamp(slot - 2, 1, 26), rad = Math.min(4, bw / 2);
  ticks.forEach((t, i) => svg.append(
    s('line', { x1: ml, x2: w - mr, y1: Y(t), y2: Y(t), class: 'grid' }),
    s('text', { x: ml - 7, y: Y(t) + 3.5, class: 'tick', 'text-anchor': 'end' }, labels[i])));
  let lastLabel = -99;
  const bars = [];
  o.bins.forEach((b, i) => {
    const cx = ml + slot * (i + .5), x = cx - bw / 2, y = Y(b.v), y0 = Y(0);
    if (b.tick && cx - lastLabel > 44) { xLabel(svg, cx, H, w, b.tick); lastLabel = cx; }
    if (b.v > 0) {
      const hgt = Math.max(2, y0 - y), r = Math.min(rad, hgt);
      const bar = s('path', { d: `M${x},${y0}V${y0 - hgt + r}q0,${-r} ${r},${-r}h${bw - 2 * r}q${r},0 ${r},${r}V${y0}Z`, fill: o.color });
      svg.append(bar); bars[i] = bar;
    }
  });
  if (o.avg) svg.append(s('line', { x1: ml, x2: w - mr, y1: Y(o.avg), y2: Y(o.avg), class: 'trend' }));
  el.append(svg);
  scrub(el, svg, o.bins.map((b, i) => ({ px: ml + slot * (i + .5), i, title: b.title, rows: b.rows })), {
    top: mt, bottom: mt + ph, w,
    onShow: it => bars.forEach((bar, i) => bar && bar.setAttribute('opacity', !it || it.i === i ? 1 : .45)),
  });
}

/**
 * Bars stacked from several coloured parts. o = { bins:[{title, tick, parts:[{v, color, label}]}], yFmt, label }
 * Parts are separated by a 2px gap so neighbouring colours never touch.
 */
export function stackedBar(el, w, H, o) {
  const fmt = o.yFmt || (v => num(v, 0));
  const totals = o.bins.map(b => b.parts.reduce((a, p) => a + p.v, 0));
  const ticks = niceTicks(0, Math.max(1e-9, ...totals) * 1.05, 3), hi = ticks.at(-1), labels = ticks.map(fmt);
  const { svg, ml, mr, mt, pw, ph } = frame(w, H, ticks, labels, o.label);
  const Y = y => mt + (1 - y / hi) * ph, slot = pw / o.bins.length, bw = clamp(slot - 2, 1, 26);
  ticks.forEach((t, i) => svg.append(
    s('line', { x1: ml, x2: w - mr, y1: Y(t), y2: Y(t), class: 'grid' }),
    s('text', { x: ml - 7, y: Y(t) + 3.5, class: 'tick', 'text-anchor': 'end' }, labels[i])));
  let lastLabel = -99;
  const cols = [];
  o.bins.forEach((b, i) => {
    const cx = ml + slot * (i + .5), g = s('g');
    if (b.tick && cx - lastLabel > 44) { xLabel(svg, cx, H, w, b.tick); lastLabel = cx; }
    let acc = 0;
    for (const p of b.parts) {
      if (!(p.v > 0)) continue;
      const y1 = Y(acc), y0 = Y(acc + p.v), hgt = y1 - y0, gap = hgt > 4 ? 2 : 0;
      g.append(s('rect', { x: cx - bw / 2, y: y0 + gap, width: bw, height: Math.max(1, hgt - gap), rx: Math.min(2, bw / 2), fill: p.color }));
      acc += p.v;
    }
    svg.append(g); cols[i] = g;
  });
  el.append(svg);
  scrub(el, svg, o.bins.map((b, i) => ({
    px: ml + slot * (i + .5), i, title: b.title,
    rows: [...b.parts.filter(p => p.v > 0).slice().reverse().map(p => ({ label: p.label, value: fmt(p.v), color: p.color })), { label: 'Total', value: fmt(totals[i]) }],
  })), { top: mt, bottom: mt + ph, w, onShow: it => cols.forEach((g, i) => g.setAttribute('opacity', !it || it.i === i ? 1 : .45)) });
}

/** Tiny trend line for list rows. */
export function spark(pts, w = 66, H = 26, color = C.c1) {
  const svg = s('svg', { width: w, height: H, viewBox: `0 0 ${w} ${H}`, class: 'spark', 'aria-hidden': 'true' });
  if (pts.length < 2) return svg;
  const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), lo = Math.min(...ys), hi = Math.max(...ys);
  const X = x => 3 + (x1 > x0 ? (x - x0) / (x1 - x0) : .5) * (w - 6), Y = y => 3 + (hi > lo ? 1 - (y - lo) / (hi - lo) : .5) * (H - 6);
  svg.append(
    s('path', { d: 'M' + pts.map(p => `${X(p.x).toFixed(1)},${Y(p.y).toFixed(1)}`).join('L'), fill: 'none', stroke: color, 'stroke-width': 1.75, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }),
    s('circle', { cx: X(pts.at(-1).x), cy: Y(pts.at(-1).y), r: 2.5, fill: color }));
  return svg;
}

/** items: [{label, color, kind: 'line'|'band'|'dash'|'dot'}] */
export function legend(items) {
  return h('div', { class: 'legend' }, items.map(it =>
    h('span', { class: 'legend-item' }, h('i', { class: 'lg lg-' + (it.kind || 'line'), style: { '--k': it.color } }), it.label)));
}
