// Progress tab: "Exercises" (every logged lift, tap for its graphs) and "Muscles" (sets per week per muscle group).
// The Exercises bottom tab (the full exercise list) lives here too.
import { h, icon, num, fmtDate, signed, weekStart, MON, DAY } from '../util.js';
import { S, exColor, exById, groupById } from '../store.js';
import { shade, NEUTRAL } from '../colors.js';
import { sessionsOf, primarySeries, trend, rangeFrom, RANGE_TEXT, groupSets } from '../stats.js';
import { empty, segmented } from '../ui.js';
import { barChart, catBars, spark } from '../charts.js';
import { rangeControl, chartCard, deltaChip, exDot } from './common.js';
import { openExercise } from './exercise.js';
import { openExerciseForm, visibleExercises, matches, muscleChips, exSub, inGroup } from './picker.js';

let pview = 'exercises', pq = '';

export function progressTab(rerender) {
  const head = [
    h('div', { class: 'tab-head' }, h('h1', null, 'Progress')),
    segmented([['exercises', 'Exercises'], ['muscles', 'Muscles']], pview, v => { pview = v; rerender(); }),
  ];
  if (!S.workouts.length) return [...head, empty('Nothing to chart yet', 'Finish your first workout and your graphs start here. To see what they look like with data, load the demo data under Me.')];
  return [...head, ...(pview === 'exercises' ? exercisesView(rerender) : musclesView(rerender))];
}

// ---------------------------------------------------------------- Progress > Exercises
function exercisesView(rerender) {
  const range = S.settings.range, from = rangeFrom(range);
  const lifts = S.exercises.filter(ex => sessionsOf(ex.id).length).map(ex => {
    const ss = sessionsOf(ex.id), ps = primarySeries(ex, from), tr = trend(ps.pts);
    const first = ps.pts[0]?.y, last = ps.pts.at(-1)?.y;
    return {
      ex, n: ss.length, lastT: ss.at(-1).t, ps,
      last: last ?? primarySeries(ex).pts.at(-1)?.y,
      pct: tr?.pct ?? (ps.pts.length > 1 && first > 0 ? (last - first) / first * 100 : null),
    };
  }).sort((a, b) => b.lastT - a.lastT);
  const row = l => h('button', { class: 'list-row lift', onclick: () => openExercise(l.ex.id) },
    exDot(l.ex),
    h('span', { class: 'row-main' }, h('b', null, l.ex.name),
      h('small', null, l.last != null ? `${l.ps.fmt(l.last)} ${l.ps.label}` : `${l.n} session${l.n > 1 ? 's' : ''}`)),
    spark(l.ps.pts, 66, 26, exColor(l.ex)),
    h('span', { class: 'lift-pct' }, l.pct == null ? h('span', { class: 'muted' }, '–') : deltaChip(+l.pct.toFixed(1), `${signed(l.pct, Math.abs(l.pct) < 10 ? 1 : 0)} %`)));
  const listEl = h('div', { class: 'list flush' });
  const paint = () => {
    const shown = lifts.filter(l => matches(l.ex, pq));
    listEl.replaceChildren(...(shown.length ? shown.map(row) : [h('p', { class: 'hint center' }, `No logged exercise matches “${pq.trim()}”.`)]));
  };
  paint();
  return [
    h('label', { class: 'search' }, icon('search', 18),
      h('input', { type: 'search', placeholder: 'Search your exercises', value: pq, autocomplete: 'off', autocapitalize: 'off', 'aria-label': 'Search your exercises', oninput: e => { pq = e.target.value; paint(); } })),
    rangeControl(rerender),
    h('section', { class: 'card' },
      h('p', { class: 'chart-note' }, `Tap an exercise to open its graphs. The small line and the percentage show its trend over the ${RANGE_TEXT[range]}.`),
      listEl),
  ];
}

// ---------------------------------------------------------------- Progress > Muscles
/** Sets done since Monday, one bar per muscle group. Starts again at zero every Monday. */
function thisWeekCard() {
  const now = Date.now(), mon = weekStart(now), lastMon = weekStart(mon - DAY);
  const [last, cur] = groupSets(lastMon, now, 'week');
  const by = { ...(cur ? cur.by : {}) };
  // Sets already ticked in the workout that is still running count too.
  for (const we of S.active?.exercises || []) {
    const ex = exById(we.exId), n = ex ? we.sets.filter(s => s.done && s.t !== 'w').length : 0;
    if (n) { const k = groupById(ex.group) ? ex.group : ''; by[k] = (by[k] || 0) + n; }
  }
  const keys = [...S.groups.map(g => g.id), ...(by[''] ? [''] : [])];
  const info = k => { const g = groupById(k); return g ? { name: g.name, color: shade(g.color) } : { name: 'No group', color: NEUTRAL[2] }; };
  const total = keys.reduce((a, k) => a + (by[k] || 0), 0);
  return chartCard({
    title: 'This week', value: `${total} set${total === 1 ? '' : 's'}`, height: 250,
    sub: `Sets per muscle group since Monday ${fmtDate(mon)}. Starts again at zero every Monday.`,
    draw: (el, w, H) => catBars(el, w, H, {
      label: 'Sets this week by muscle group',
      bars: keys.map(k => {
        const g = info(k), v = by[k] || 0, before = last?.by[k] || 0;
        return { label: g.name, v, color: g.color, rows: [{ label: 'This week', value: `${v} set${v === 1 ? '' : 's'}`, color: g.color }, { label: 'Last week', value: `${before} set${before === 1 ? '' : 's'}` }] };
      }),
    }),
  });
}

function musclesView(rerender) {
  const range = S.settings.range, now = Date.now();
  let from = rangeFrom(range, now);
  if (from === -Infinity) from = S.workouts[0].start;
  // Short ranges: one bar per week. Long ranges: one bar per month, shown as that month's average sets per week.
  const monthly = range === '6M' || range === '1Y' || range === 'All';
  const bs = groupSets(from, now, monthly ? 'month' : 'week');
  const val = (b, k) => (b.by[k] || 0) / (monthly ? b.weeks : 1);
  const keys = [...S.groups.map(g => g.id), ''].filter(k => bs.some(b => b.by[k]));
  const out = [thisWeekCard(), h('div', { class: 'section-head' }, h('h2', null, 'Over time')), rangeControl(rerender)];
  if (!keys.length) return [...out, empty(`No sets in the ${RANGE_TEXT[range]}`, 'Pick a longer range.')];
  const info = k => { const g = groupById(k); return g ? { name: g.name, color: shade(g.color) } : { name: 'No group', color: NEUTRAL[2] }; };
  const weeks = Math.max(1, (now - bs[0].x) / (7 * DAY));
  const sum = k => bs.reduce((a, b) => a + (b.by[k] || 0), 0);
  const title = b => { const d = new Date(b.x); return monthly ? `${MON[d.getMonth()]} ${d.getFullYear()}, per week` : `Week of ${fmtDate(b.x, { year: true })}`; };
  const tick = b => {
    const d = new Date(b.x);
    if (monthly) return d.getMonth() === 0 ? String(d.getFullYear()) : bs.length <= 13 || d.getMonth() % 3 === 0 ? MON[d.getMonth()] : null;
    if (bs.length <= 6) return `${d.getDate()} ${MON[d.getMonth()]}`;
    return d.getDate() <= 7 ? (d.getMonth() === 0 ? String(d.getFullYear()) : MON[d.getMonth()]) : null;
  };
  const f = v => num(v, monthly ? 1 : 0);
  out.push(h('p', { class: 'hint' }, (monthly ? 'Each bar is one month, shown as its average number of sets per week. ' : 'Each bar is one week. ') + 'Warm-up sets are left out and all gyms are added together.'));
  for (const k of keys.slice().sort((a, b) => sum(b) - sum(a))) {
    const g = info(k), avg = sum(k) / weeks;
    out.push(chartCard({
      title: [h('i', { class: 'ex-dot big', style: { background: g.color } }), g.name], value: num(avg, 1), sub: 'sets per week on average', height: 130,
      draw: (el, w, H) => barChart(el, w, H, {
        label: `${g.name}: sets per week`, color: g.color, avg, yFmt: f,
        bins: bs.map(b => ({ v: val(b, k), tick: tick(b), title: title(b), rows: [{ label: g.name, value: `${f(val(b, k))} sets`, color: g.color }] })),
      }),
    }));
  }
  return out;
}

// ---------------------------------------------------------------- Exercises tab
let q = '', group = '';
export function exercisesTab(rerender) {
  const listEl = h('div', { class: 'list' });
  const paint = () => {
    const all = visibleExercises().filter(e => inGroup(e, group) && matches(e, q));
    const row = ex => {
      const ss = sessionsOf(ex.id);
      return h('button', { class: 'list-row', onclick: () => openExercise(ex.id) },
        exDot(ex),
        h('span', { class: 'row-main' }, h('b', null, ex.name), h('small', null, exSub(ex) + (ex.builtin ? '' : ' · yours'))),
        ss.length ? h('span', { class: 'row-side' }, h('b', null, ss.length), h('small', null, fmtDate(ss.at(-1).t))) : null,
        icon('right', 16));
    };
    const kids = [];
    if (!q.trim() && !group) {
      const used = all.filter(e => sessionsOf(e.id).length).sort((a, b) => sessionsOf(b.id).length - sessionsOf(a.id).length).slice(0, 8);
      if (used.length) kids.push(h('div', { class: 'list-label' }, 'Most trained'), ...used.map(row), h('div', { class: 'list-label' }, 'All exercises', h('span', null, String(all.length))));
    }
    kids.push(...all.map(row));
    if (!all.length) kids.push(empty('No exercise found', q.trim() ? `Nothing matches “${q.trim()}”.` : 'No exercises in this group.',
      h('button', { class: 'btn btn-soft', onclick: () => openExerciseForm(null, { name: q.trim() }) }, 'Create exercise')));
    listEl.replaceChildren(...kids);
  };
  paint();
  return [
    h('div', { class: 'tab-head' }, h('h1', null, 'Exercises'),
      h('button', { class: 'btn-pill ghost', onclick: () => openExerciseForm(null, { name: q.trim() }) }, icon('plus', 16), 'New exercise')),
    h('label', { class: 'search' }, icon('search', 18),
      h('input', { type: 'search', placeholder: 'Search exercises', value: q, autocomplete: 'off', autocapitalize: 'off', 'aria-label': 'Search exercises', oninput: e => { q = e.target.value; paint(); } })),
    muscleChips(group, g => { group = g; rerender(); }),
    listEl,
  ];
}
