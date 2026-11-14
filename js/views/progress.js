// Progress tab: the overview across all training, plus the Exercises tab list.
import { h, icon, big, num, fmtDate, fmtDur, signed, MON, DAY } from '../util.js';
import { S } from '../store.js';
import { sessionsOf, workoutStats, bins, primarySeries, trend, rangeFrom, RANGE_TEXT } from '../stats.js';
import { empty } from '../ui.js';
import { barChart, spark, C } from '../charts.js';
import { rangeControl, chartCard, deltaChip } from './common.js';
import { tile } from './editor.js';
import { weightCard } from './me.js';
import { openExercise } from './exercise.js';
import { openExerciseForm, visibleExercises, matches, muscleChips, exSub } from './picker.js';

let showAllLifts = false;

export function progressTab(rerender) {
  const head = h('div', { class: 'tab-head' }, h('h1', null, 'Progress'));
  if (!S.workouts.length) return [head, empty('Nothing to chart yet', 'Finish your first workout and your graphs start here. To see what they look like with data, load the demo data under Me.')];
  const range = S.settings.range, now = Date.now();
  let from = rangeFrom(range, now);
  if (from === -Infinity) from = S.workouts[0].start;
  const ws = S.workouts.filter(w => w.start >= from);
  const tot = ws.reduce((a, w) => { const st = workoutStats(w); a.vol += st.vol; a.dur += st.dur; a.prs += st.prs; return a; }, { vol: 0, dur: 0, prs: 0 });
  const unit = (now - from) / DAY > 550 ? 'month' : 'week';
  const bs = bins(from, now, unit);
  const binTitle = b => unit === 'week' ? `Week of ${fmtDate(b.x, { year: true })}` : `${MON[new Date(b.x).getMonth()]} ${new Date(b.x).getFullYear()}`;
  const tick = (b, i) => {
    const d = new Date(b.x);
    if (unit === 'month') return d.getMonth() === 0 ? String(d.getFullYear()) : d.getMonth() % 3 === 0 ? MON[d.getMonth()] : null;
    if (bs.length <= 6) return `${d.getDate()} ${MON[d.getMonth()]}`;
    return d.getDate() <= 7 ? (d.getMonth() === 0 ? String(d.getFullYear()) : MON[d.getMonth()]) : null;
  };
  const per = unit === 'week' ? 'week' : 'month';
  const periods = Math.max(1, (now - from) / DAY / (unit === 'week' ? 7 : 30.4375));
  const avgN = ws.length / periods, avgVol = tot.vol / periods;

  // lifts trained in the range, most sessions first
  const lifts = [];
  for (const ex of S.exercises) {
    const n = sessionsOf(ex.id).filter(s => s.t >= from).length;
    if (!n) continue;
    const ps = primarySeries(ex, from);
    if (!ps.pts.length) continue;
    const tr = trend(ps.pts);
    const first = ps.pts[0].y, last = ps.pts.at(-1).y;
    const pct = tr?.pct ?? (ps.pts.length > 1 && first > 0 ? (last - first) / first * 100 : null);
    lifts.push({ ex, n, ps, pct, last });
  }
  lifts.sort((a, b) => b.n - a.n);

  return [
    head,
    rangeControl(rerender),
    h('div', { class: 'tiles tiles-4' },
      tile('Workouts', ws.length), tile('Volume', tot.vol >= 1e6 ? num(tot.vol / 1000, 0) + ' t' : big(tot.vol) + ' kg'),
      tile('Time', fmtDur(tot.dur)), tile('Records', tot.prs, tot.prs ? 'gold' : '')),
    ws.length ? null : empty(`No workouts in the ${RANGE_TEXT[range]}`, 'Pick a longer range.'),
    ws.length ? chartCard({
      title: `Workouts per ${per}`, value: num(avgN, 1), sub: `average per ${per}`, height: 160,
      legendItems: null,
      draw: (el, w, H) => barChart(el, w, H, {
        bins: bs.map((b, i) => ({ v: b.n, tick: tick(b, i), title: binTitle(b), rows: [{ label: 'Workouts', value: String(b.n), color: C.c1 }, { label: 'Time', value: fmtDur(b.sec) }] })),
        color: C.c1, integer: true, avg: avgN, label: `Workouts per ${per}`,
      }),
    }) : null,
    ws.length ? chartCard({
      title: `Volume per ${per}`, value: `${big(avgVol)} kg`, sub: `average per ${per}`, height: 160,
      draw: (el, w, H) => barChart(el, w, H, {
        bins: bs.map((b, i) => ({ v: b.vol, tick: tick(b, i), title: binTitle(b), rows: [{ label: 'Volume', value: `${big(b.vol)} kg`, color: C.c3 }, { label: 'Workouts', value: String(b.n) }] })),
        color: C.c3, avg: avgVol, yFmt: v => (v >= 1000 ? num(v / 1000, 1) + 'k' : num(v, 0)), label: `Training volume per ${per}`,
      }),
      note: 'The dashed line is the average. Volume is sets × reps × load, warm-ups left out.',
    }) : null,
    weightCard(),
    lifts.length ? h('section', { class: 'card' },
      h('h3', null, 'Your lifts'),
      h('p', { class: 'chart-note' }, `Change over the ${RANGE_TEXT[range]}, measured on the fitted trend line.`),
      h('div', { class: 'list flush' }, lifts.slice(0, showAllLifts ? 1e9 : 10).map(l => h('button', { class: 'list-row lift', onclick: () => openExercise(l.ex.id) },
        h('span', { class: 'row-main' }, h('b', null, l.ex.name), h('small', null, `${l.ps.fmt(l.last)} ${l.ps.label} · ${l.n} session${l.n > 1 ? 's' : ''}`)),
        spark(l.ps.pts),
        h('span', { class: 'lift-pct' }, l.pct == null ? h('span', { class: 'muted' }, '–') : deltaChip(+l.pct.toFixed(1), `${signed(l.pct, Math.abs(l.pct) < 10 ? 1 : 0)} %`))))),
      lifts.length > 10 && !showAllLifts ? h('button', { class: 'btn btn-soft', onclick: () => { showAllLifts = true; rerender(); } }, `Show all ${lifts.length} lifts`) : null) : null,
  ];
}

// ---------------------------------------------------------------- Exercises tab
let q = '', muscle = '';
export function exercisesTab(rerender) {
  let listEl;
  const paint = () => {
    const all = visibleExercises().filter(e => (!muscle || e.muscle === muscle) && matches(e, q));
    const row = ex => {
      const ss = sessionsOf(ex.id);
      return h('button', { class: 'list-row', onclick: () => openExercise(ex.id) },
        h('span', { class: 'row-main' }, h('b', null, ex.name), h('small', null, exSub(ex) + (ex.builtin ? '' : ' · yours'))),
        ss.length ? h('span', { class: 'row-side' }, h('b', null, ss.length), h('small', null, fmtDate(ss.at(-1).t))) : null,
        icon('right', 16));
    };
    const kids = [];
    if (!q.trim() && !muscle) {
      const used = all.filter(e => sessionsOf(e.id).length).sort((a, b) => sessionsOf(b.id).length - sessionsOf(a.id).length).slice(0, 8);
      if (used.length) kids.push(h('div', { class: 'list-label' }, 'Most trained'), ...used.map(row), h('div', { class: 'list-label' }, 'All exercises', h('span', null, String(all.length))));
    }
    kids.push(...all.map(row));
    if (!all.length) kids.push(empty('No exercise found', q.trim() ? `Nothing matches “${q.trim()}”.` : 'No exercises in this group.',
      h('button', { class: 'btn btn-soft', onclick: () => openExerciseForm(null, { name: q.trim() }) }, 'Create exercise')));
    listEl.replaceChildren(...kids);
  };
  listEl = h('div', { class: 'list' });
  const search = h('label', { class: 'search' }, icon('search', 18),
    h('input', { type: 'search', placeholder: 'Search exercises', value: q, autocomplete: 'off', autocapitalize: 'off', 'aria-label': 'Search exercises', oninput: e => { q = e.target.value; paint(); } }));
  paint();
  return [
    h('div', { class: 'tab-head' }, h('h1', null, 'Exercises'),
      h('button', { class: 'btn-pill ghost', onclick: () => openExerciseForm(null, { name: q.trim() }) }, icon('plus', 16), 'New exercise')),
    search,
    muscleChips(muscle, m => { muscle = m; rerender(); }),
    listEl,
  ];
}
