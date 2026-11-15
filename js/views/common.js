// Pieces shared by several screens.
import { h, icon, num, signed } from '../util.js';
import { S, save } from '../store.js';
import { calc, setText, PR_LABEL, RANGES } from '../stats.js';
import { segmented } from '../ui.js';
import { mount, legend } from '../charts.js';

/** Small colour dot for a gym (grey when there is none). */
export const gymDot = g => h('i', { class: 'gym-dot', style: { background: g ? g.color : 'var(--tx3)' } });

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
