// History tab (calendar + list of workouts) and the read-only workout page.
import { h, icon, uid, big, fmtDate, fmtTime, fmtDur, fmtClock, num, dayKey, weekStart, monthStart, MONTHS, MON, DAY } from '../util.js';
import { S, save, exById, bwAt, gymById, exColor } from '../store.js';
import { idx, workoutStats, summarize, setText, streakWeeks } from '../stats.js';
import { pushPage, back, actionSheet, confirmBox, toast, segmented, empty } from '../ui.js';
import { setTable, gymDot } from './common.js';
import { tile, editWorkout, startWorkout } from './editor.js';
import { openExercise } from './exercise.js';

let view = 'month', cursor = monthStart(Date.now()), shown = 20;

const byDay = () => {
  const m = new Map();
  for (const w of S.workouts) { const k = dayKey(w.start); m.has(k) ? m.get(k).push(w) : m.set(k, [w]); }
  return m;
};
function bestText(ex, sm) {
  if (ex.type === 'bw') return `${sm.maxReps} reps`;
  if (ex.type === 'time') return fmtClock(sm.maxSec);
  if (ex.type === 'dist') return `${num(sm.km, 2)} km`;
  return sm.top ? setText(ex, sm.top) : '';
}
const statLine = w => {
  const st = workoutStats(w);
  const g = gymById(w.gymId);
  return h('div', { class: 'stat-line' },
    g ? h('span', { class: 'gym-tag' }, gymDot(g), g.name) : null,
    h('span', null, fmtDur(st.dur)), h('span', null, `${big(st.vol)} kg`), h('span', null, `${st.sets} set${st.sets === 1 ? '' : 's'}`),
    st.prs ? h('span', { class: 'pr' }, icon('trophy', 13), `${st.prs} record${st.prs > 1 ? 's' : ''}`) : null);
};

export function workoutCard(w) {
  const bw = bwAt(w.start);
  const lines = w.exercises.map(we => { const ex = exById(we.exId), sm = ex && summarize(ex, we.sets, bw); return sm ? [ex, sm] : null; }).filter(Boolean);
  return h('section', { class: 'card tap', onclick: () => openWorkout(w.id) },
    h('div', { class: 'card-head' }, h('b', null, w.name), h('span', { class: 'muted' }, `${fmtDate(w.start, { weekday: true })}, ${fmtTime(w.start)}`)),
    statLine(w),
    h('div', { class: 'ex-lines' }, lines.slice(0, 6).map(([ex, sm]) =>
      h('div', null, h('span', null, `${sm.sets.length} × ${ex.name}`), h('span', { class: 'muted' }, bestText(ex, sm)))),
      lines.length > 6 ? h('div', { class: 'muted' }, `and ${lines.length - 6} more`) : null));
}

function dayTap(dayMs, list) {
  if (list?.length === 1) return openWorkout(list[0].id);
  if (list?.length) return actionSheet(fmtDate(dayMs, { weekday: true, year: true }), list.map(w => ({ label: w.name, hint: fmtTime(w.start), onClick: () => openWorkout(w.id) })));
  if (dayMs > Date.now()) return;
  actionSheet(fmtDate(dayMs, { weekday: true, year: true }), [{ label: 'Log a workout on this day', onClick: () => editWorkout(null, dayMs) }]);
}

function monthGrid(first, days, mini) {
  const d0 = new Date(first), y = d0.getFullYear(), m = d0.getMonth();
  const n = new Date(y, m + 1, 0).getDate(), lead = (d0.getDay() + 6) % 7, today = dayKey(Date.now());
  const cells = Array.from({ length: lead }, () => h('span'));
  for (let d = 1; d <= n; d++) {
    const ms = new Date(y, m, d).getTime(), k = dayKey(ms), list = days.get(k);
    const cls = 'day' + (list ? ' has' : '') + (k === today ? ' today' : '') + (ms > Date.now() ? ' future' : '');
    cells.push(mini ? h('span', { class: cls })
      : h('button', { class: cls, 'aria-label': `${d} ${MONTHS[m]}${list ? `, ${list.length} workout${list.length > 1 ? 's' : ''}` : ''}`, onclick: () => dayTap(ms, list) },
        h('span', null, d), list?.length > 1 ? h('i', null, list.length) : null));
  }
  return h('div', { class: mini ? 'cal mini' : 'cal' }, cells);
}

export function historyTab(rerender) {
  const now = Date.now(), ws = S.workouts, days = byDay();
  const count = (a, b) => ws.filter(w => w.start >= a && w.start < b).length;
  const cur = new Date(cursor), year = cur.getFullYear(), yearStart = new Date(new Date(now).getFullYear(), 0, 1).getTime();
  const shift = n => { const d = new Date(cursor); view === 'month' ? d.setMonth(d.getMonth() + n) : d.setFullYear(d.getFullYear() + n); cursor = d.getTime(); rerender(); };
  const atEnd = view === 'month' ? cursor >= monthStart(now) : year >= new Date(now).getFullYear();

  // "12 workouts, 2.8 per week": the period only counts up to today.
  const tally = (n, a, b) => `${n} workout${n === 1 ? '' : 's'}${n ? `, ${num(n / Math.max(1, (Math.min(b, now) - a) / (7 * DAY)), 1)} per week` : ''}`;
  let cal;
  if (view === 'month') {
    const next = new Date(year, cur.getMonth() + 1, 1).getTime(), n = count(cursor, next);
    cal = [
      h('div', { class: 'cal-sub' }, tally(n, cursor, next)),
      h('div', { class: 'cal-wd' }, ['M', 'T', 'W', 'T', 'F', 'S', 'S'].map(d => h('span', null, d))),
      monthGrid(cursor, days),
    ];
  } else {
    const n = count(new Date(year, 0, 1).getTime(), new Date(year + 1, 0, 1).getTime());
    cal = [
      h('div', { class: 'cal-sub' }, tally(n, new Date(year, 0, 1).getTime(), new Date(year + 1, 0, 1).getTime())),
      h('div', { class: 'year-grid' }, MON.map((name, m) => {
        const first = new Date(year, m, 1).getTime(), c = count(first, new Date(year, m + 1, 1).getTime());
        return h('button', { class: 'mini-month', 'aria-label': `${MONTHS[m]}, ${c} workouts`, onclick: () => { view = 'month'; cursor = first; rerender(); } },
          h('div', { class: 'mini-head' }, h('span', null, name), h('b', null, c || '')), monthGrid(first, days, true));
      })),
    ];
  }

  // list, newest first, grouped by month
  const list = ws.slice().reverse(), items = [];
  let lastMonth = null;
  for (const w of list.slice(0, shown)) {
    const ms = monthStart(w.start);
    if (ms !== lastMonth) {
      lastMonth = ms;
      const d = new Date(ms), c = count(ms, new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime());
      items.push(h('div', { class: 'list-label' }, `${MONTHS[d.getMonth()]} ${d.getFullYear()}`, h('span', null, `${c} workout${c === 1 ? '' : 's'}`)));
    }
    items.push(workoutCard(w));
  }

  return [
    h('div', { class: 'tab-head' }, h('h1', null, 'History'),
      h('button', { class: 'btn-pill ghost', onclick: () => editWorkout(null) }, icon('plus', 16), 'Log past workout')),
    h('div', { class: 'tiles tiles-4' },
      tile('This week', count(weekStart(now), Infinity)), tile('This month', count(monthStart(now), Infinity)),
      tile('This year', count(yearStart, Infinity)), tile('All time', ws.length)),
    ws.length ? h('section', { class: 'card' }, h('h3', null, 'Average workouts per week'),
      h('div', { class: 'totals' },
        [['4 weeks', count(now - 28 * DAY, Infinity) / 4], ['12 weeks', count(now - 84 * DAY, Infinity) / 12],
          ['This year', count(yearStart, Infinity) / Math.max(1, (now - yearStart) / (7 * DAY))]]
          .map(([k, v]) => h('div', null, h('b', null, num(v, 1)), h('span', null, k))),
        h('div', null, h('b', null, streakWeeks(now)), h('span', null, 'Week streak')))) : null,
    h('section', { class: 'card' },
      h('div', { class: 'cal-head' },
        h('button', { class: 'icon-btn', 'aria-label': 'Previous', onclick: () => shift(-1) }, icon('left', 20)),
        h('h3', null, view === 'month' ? `${MONTHS[cur.getMonth()]} ${year}` : String(year)),
        h('button', { class: 'icon-btn', 'aria-label': 'Next', disabled: atEnd, onclick: () => shift(1) }, icon('right', 20)),
        segmented([['month', 'Month'], ['year', 'Year']], view, v => { view = v; if (cursor > now) cursor = monthStart(now); rerender(); })),
      cal),
    ws.length ? items : empty('No workouts yet', 'Finished workouts appear here and on the calendar.'),
    list.length > shown ? h('button', { class: 'btn btn-soft', onclick: () => { shown += 30; rerender(); } }, `Show older workouts (${list.length - shown})`) : null,
  ];
}

export function openWorkout(id) {
  pushPage(() => {
    const w = S.workouts.find(x => x.id === id);
    if (!w) return { title: 'Workout', body: empty('This workout was deleted.') };
    const st = workoutStats(w), prs = idx().prs.get(w.id), bw = bwAt(w.start);
    const menu = () => actionSheet(w.name, [
      { label: 'Edit workout', onClick: () => editWorkout(w) },
      { label: 'Do this workout again', onClick: () => startWorkout({ name: w.name, exercises: w.exercises, routineId: w.routineId }) },
      {
        label: 'Save as routine', onClick: () => {
          S.routines.push({ id: uid(), name: w.name, notes: '', exercises: w.exercises.map(we => ({ exId: we.exId, notes: '', sets: we.sets.map(s => ({ ...s })) })) });
          save('routines'); toast('Routine saved');
        },
      },
      {
        label: 'Delete workout', danger: true, onClick: async () => {
          if (!await confirmBox({ title: 'Delete this workout?', text: 'Its sets are removed from your statistics and records.', ok: 'Delete workout', danger: true })) return;
          S.workouts.splice(S.workouts.indexOf(w), 1); save('workouts');
          await back(); toast('Workout deleted');
        },
      },
    ]);
    return {
      title: fmtDate(w.start, { weekday: true, year: true }),
      actions: h('button', { class: 'icon-btn', 'aria-label': 'Workout options', onclick: menu }, icon('more')),
      body: [
        h('h1', { class: 'page-h1' }, w.name),
        h('div', { class: 'muted gym-tag' }, gymById(w.gymId) ? [gymDot(gymById(w.gymId)), gymById(w.gymId).name + ' ·'] : null, `${fmtTime(w.start)}–${fmtTime(w.end)}${bw ? ` · body weight ${num(bw, 1)} kg` : ''}`),
        h('div', { class: 'tiles tiles-4' }, tile('Duration', fmtDur(st.dur)), tile('Volume', big(st.vol) + ' kg'), tile('Sets', st.sets), tile('Records', st.prs, st.prs ? 'gold' : '')),
        w.notes ? h('p', { class: 'note' }, w.notes) : null,
        w.exercises.map((we, ei) => {
          const ex = exById(we.exId);
          if (!ex) return null;
          return h('section', { class: 'card', style: { '--exc': exColor(ex) } },
            h('button', { class: 'ex-name', onclick: () => openExercise(ex.id) }, ex.name),
            we.notes ? h('p', { class: 'note' }, we.notes) : null,
            setTable(ex, we.sets, bw, i => prs?.get(ei + ':' + i)));
        }),
      ],
    };
  });
}
