// Pieces shared by several screens.
import { h, icon, num, signed } from '../util.js';
import { S, save, exColor, exById, groupById } from '../store.js';
import { shade, NEUTRAL } from '../colors.js';
import { calc, setText, PR_LABEL, RANGES } from '../stats.js';
import { segmented } from '../ui.js';
import { mount, legend } from '../charts.js';

/** Dot for a gym. A gym has no colour of its own: it is a shade of `colorKey` (grey when no colour applies). */
export const gymDot = (g, colorKey) => h('i', { class: 'gym-dot', style: { background: g ? shade(colorKey, g.shade) : 'var(--tx3)' } });
/** Dot in the colour of an exercise's muscle group. */
export const exDot = ex => h('i', { class: 'ex-dot', style: { background: exColor(ex) } });

/**
 * Sets per muscle group of a list of logged exercises, in the order of the muscle group list.
 * Each part carries the group's colour, so a workout can be drawn as a strip or ring of its muscles.
 */
export function colorParts(exercises, count = we => we.sets.filter(s => s.t !== 'w').length) {
  const by = new Map();
  for (const we of exercises) {
    const ex = exById(we.exId), n = ex ? count(we) : 0;
    if (!n) continue;
    const k = groupById(ex.group) ? ex.group : '';
    by.set(k, (by.get(k) || 0) + n);
  }
  return [...S.groups.map(g => g.id), ''].filter(k => by.has(k)).map(k => {
    const g = groupById(k);
    return { key: k, v: by.get(k), color: g ? shade(g.color) : NEUTRAL[2], name: g ? g.name : 'No group' };
  });
}
/** Thin strip split into the muscle colours of a workout or routine, each as wide as its share of the sets. */
export const mixBar = parts => (parts.length ? h('div', { class: 'mix', 'aria-hidden': 'true' }, parts.map(p => h('i', { style: { flex: String(p.v), background: p.color } }))) : null);

export const prChips = cats => (cats || []).map(c => h('span', { class: 'pr' }, icon('trophy', 13), PR_LABEL[c]));

/** Read-only list of the sets of one exercise in one workout. prFor(i) returns the PR categories of set i. */
export function setTable(ex, rawSets, bw, prFor = () => null) {
  let n = 0;
  return h('div', { class: 'set-list' }, rawSets.map((raw, i) => {
    const c = calc(ex, raw, bw), warm = c.t === 'w';
    if (!warm) n++;
    return h('div', { class: 'set-line' + (warm ? ' warm' : '') },
      h('span', { class: 'set-tag t-' + c.t }, c.t === 'n' ? n : c.t.toUpperCase()),
      h('span', { class: 'set-val' }, setText(ex, c)),
      h('span', { class: 'set-rm' }, !warm && c.rm ? `1RM ≈ ${num(c.rm.mid, 1)}` : ''),
      h('span', { class: 'set-prs' }, prChips(prFor(i))));
  }));
}

/** The shared time-range control. Remembers the choice between screens. */
export function rangeControl(onChange) {
  return segmented(RANGES, S.settings.range, v => { S.settings.range = v; save('settings'); onChange(v); });
}

/** "▲ +1.8 kg / month". Direction is carried by the arrow and the sign, not by colour alone. */
export function deltaChip(v, text) {
  if (v == null || !isFinite(v)) return null;
  const flat = Math.abs(v) < 1e-9;
  return h('span', { class: 'delta ' + (flat ? 'flat' : v > 0 ? 'up' : 'down') }, flat ? '● ' : v > 0 ? '▲ ' : '▼ ', text);
}
export const perMonth = (tr, unit, dp = 1) => (tr ? deltaChip(+tr.perMonth.toFixed(dp + 1), `${signed(tr.perMonth, dp)} ${unit} / month`) : null);

/** Card with a title, a headline value and a chart. */
export function chartCard({ title, value, sub, chip, legendItems, draw, note, height = 190 }) {
  return h('section', { class: 'card chart-card' },
    h('div', { class: 'chart-head' }, h('h3', null, title), value != null ? h('div', { class: 'chart-value' }, value) : null),
    sub || chip ? h('div', { class: 'chart-sub' }, chip, sub ? h('span', null, sub) : null) : null,
    legendItems ? legend(legendItems) : null,
    mount(draw, height),
    note ? h('p', { class: 'chart-note' }, note) : null);
}
