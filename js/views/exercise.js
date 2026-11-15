// Exercise detail: graphs, all-time records and session history for one lift.
// Every graph draws one line per gym, in that gym's colour.
import { h, icon, num, big, fmtDate, fmtClock, fmtDur, signed, DAY } from '../util.js';
import { S, exById, TYPES, isBW, gymById, groupById, exColor } from '../store.js';
import { sessionsOf, sessionsAt, gymsOf, records, repBest, trend, rangeFrom, RANGE_TEXT, setText, extText, MAX_REPS } from '../stats.js';
import { pushPage, segmented, empty, cap } from '../ui.js';
import { xyChart, C } from '../charts.js';
import { setTable, rangeControl, chartCard, perMonth, deltaChip, gymDot } from './common.js';
import { openExerciseForm } from './picker.js';
import { openWorkout } from './history.js';

const kg1 = v => `${num(v, 1)} kg`;
const dateFull = t => fmtDate(t, { year: true });
/** Gym key of a session: its gym id, or null when it has none (or the gym was deleted). */
const keyOf = s => (gymById(s.gym) ? s.gym : null);

export function openExercise(exId) {
  let tab = 'graphs', shown = 15, gym;          // gym === undefined shows every gym
  const page = pushPage(() => {
    const ex = exById(exId);
    if (!ex) return { title: 'Exercise', body: empty('This exercise was deleted.') };
    const keys = gymsOf(exId);
    if (gym !== undefined && !keys.includes(gym)) gym = undefined;
    const named = keys.length > 1 || (keys.length === 1 && keys[0] !== null);   // are gyms in play for this lift?
    // A line wears the exercise's muscle colour in the shade of its gym. Sessions without a gym are grey next to gym lines.
    const info = k => { const g = gymById(k); return g ? { key: k, name: g.name, color: exColor(ex, g.shade) } : { key: null, name: 'No gym', color: named ? C.mute : exColor(ex) }; };
    const sess = sessionsAt(exId, gym);
    const ctx = { ex, named, groups: (gym === undefined ? keys : [gym]).map(info) };
    const chips = keys.length > 1 ? h('div', { class: 'chips' },
      h('button', { class: 'chip' + (gym === undefined ? ' on' : ''), onclick: () => { gym = undefined; page.render(); } }, 'All gyms'),
      keys.map(k => h('button', { class: 'chip' + (gym === k ? ' on' : ''), onclick: () => { gym = k; page.render(); } }, gymDot(gymById(k), groupById(ex.group)?.color), info(k).name))) : null;
    const content = !sessionsOf(exId).length
      ? empty('No sets logged yet', 'Add this exercise to a workout. Its graphs and records show up here after the first session.')
      : tab === 'graphs' ? graphs(ctx, sess, () => page.render())
        : tab === 'records' ? recordsView(ex, gym)
          : historyView(ctx, sess, shown, () => { shown += 30; page.render(); });
    return {
      title: ex.name,
      actions: h('button', { class: 'icon-btn', 'aria-label': 'Edit exercise', onclick: () => openExerciseForm(ex) }, icon('edit', 20)),
      body: [
        h('div', { class: 'ex-meta' }, [TYPES[ex.type], ex.equip && cap(ex.equip), groupById(ex.group)?.name].filter(Boolean).join(' · ')),
        ex.notes ? h('div', { class: 'ex-pinned' }, ex.notes) : null,
        segmented([['graphs', 'Graphs'], ['records', 'Records'], ['history', 'History']], tab, v => { tab = v; page.render(); }),
        chips,
        content,
      ],
    };
  });
}

// ---------------------------------------------------------------- graphs
function graphs({ ex, named, groups }, all, rerender) {
  const range = S.settings.range, now = Date.now();
  let from = rangeFrom(range, now);
  const inR = all.filter(s => s.t >= from);
  if (from === -Infinity) from = all[0].t - Math.max(DAY, (now - all[0].t) * 0.03);
  const out = [rangeControl(rerender)];
  const base = { x0: from, x1: now };
  const title = s => fmtDate(s.t, { weekday: true, year: true });
  const gymRow = (s, color) => [{ label: 'Workout', value: s.w.name }, ...(named ? [{ label: 'Gym', value: gymById(s.gym)?.name || 'No gym', color }] : [])];

  /** One line per gym of a per-session number. A single line also gets a trend. */
  const lines = ({ name, get, fmt, axis, sub, unit, dp = 1, rows, note, zero = false, extra, legendExtra, height = 190, value, chip = true }) => {
    const gs = groups.map(g => ({ ...g, pts: inR.filter(s => keyOf(s) === g.key).map(s => ({ x: s.t, y: get(s), s, color: g.color })).filter(p => p.y != null) })).filter(g => g.pts.length);
    if (!gs.length) return null;
    const pts = gs.flatMap(g => g.pts).sort((a, b) => a.x - b.x);
    const tr = gs.length === 1 ? trend(pts) : null, last = pts.at(-1);
    const more = extra ? extra(gs, pts) : {};
    const legendItems = [
      ...(named ? gs.map(g => ({ label: g.name, color: g.color })) : []),      // always say which line is which gym
      ...(legendExtra ? legendExtra(gs, pts) : []),
    ];
    if (tr && legendItems.length) legendItems.push({ label: 'Trend', color: C.mute, kind: 'dash' });
    return chartCard({
      title: name, value: value ? value(last.s) : fmt(last.y), sub: typeof sub === 'function' ? sub(last.s) : sub, note, height,
      chip: chip && tr ? (unit === 'time' ? deltaChip(tr.perMonth, `${signed(tr.perMonth, 0)} s / month`) : perMonth(tr, unit, dp)) : null,
      legendItems: legendItems.length ? legendItems : null,
      draw: (el, w, H) => xyChart(el, w, H, {
        ...base, zero, yFmt: axis || (v => num(v, 1)), label: name, trend: tr, ...more,
        series: more.series || gs.map(g => ({ pts: g.pts, color: g.color })),
        scrub: pts.map(p => ({
          x: p.x, title: title(p.s),
          rows: [...gymRow(p.s, p.color), ...(rows ? rows(p.s, p.color) : [{ label: name, value: fmt(p.y), color: named ? null : p.color }])],
          marks: [{ y: p.y, color: p.color }],
        })),
      }),
    });
  };

  if (!inR.length) {
    out.push(empty(`No sessions in the ${RANGE_TEXT[range]}`, `Last trained on ${dateFull(all.at(-1).t)}. Pick a longer range to see it.`));
  } else if (ex.type === 'time') {
    out.push(
      lines({ name: 'Longest set', get: s => s.maxSec || null, fmt: fmtClock, axis: fmtClock, unit: 'time' }),
      lines({ name: 'Total time per session', get: s => s.sec || null, fmt: fmtClock, axis: fmtClock, unit: 'time', zero: true }));
  } else if (ex.type === 'dist') {
    out.push(
      lines({ name: 'Distance per session', get: s => s.km || null, fmt: v => `${num(v, 2)} km`, unit: 'km', dp: 2, zero: true }),
      lines({ name: 'Pace', get: s => s.pace, fmt: v => `${fmtClock(v)} / km`, axis: fmtClock, unit: 'time', sub: 'Lower is faster', chip: false }),
      lines({ name: 'Time per session', get: s => s.sec || null, fmt: fmtClock, axis: fmtClock, unit: 'time', zero: true }));
  } else if (ex.type === 'bw') {
    out.push(
      lines({ name: 'Most reps in a set', get: s => s.maxReps || null, fmt: v => `${num(v)} reps`, axis: v => num(v, 0), unit: 'reps' }),
      lines({ name: 'Total reps per session', get: s => s.reps || null, fmt: v => `${num(v)} reps`, axis: v => num(v, 0), unit: 'reps', zero: true }));
  } else {
    // ---- 1. heaviest set over time: touch a point to see the reps of every set ----
    const body = isBW(ex);
    const setRows = (s, color) => {
      const rows = s.sets.slice(0, 6).map((c, i) => ({ label: `Set ${i + 1}`, value: setText(ex, c), color: c === s.top ? color : null }));
      if (s.sets.length > 6) rows.push({ label: '', value: `and ${s.sets.length - 6} more` });
      return rows;
    };
    const weighted = inR.some(s => s.top && s.top.ext !== 0);
    const repsAtBW = () => lines({
      name: ex.type === 'wbw' ? 'Most reps at body weight' : 'Most reps in a set',
      get: s => (ex.type === 'wbw' ? s.bwReps : s.maxReps) || null, fmt: v => `${num(v)} reps`, axis: v => num(v, 0), unit: 'reps', rows: setRows,
    });
    if (weighted || !body) out.push(lines({
      name: ex.type === 'wbw' ? 'Heaviest added weight' : ex.type === 'abw' ? 'Least assistance' : 'Heaviest set',
      get: s => (s.top ? s.top.ext : null), fmt: v => extText(ex, v), value: s => setText(ex, s.top), axis: v => num(v, 1), unit: 'kg',
      sub: 'Touch the graph to see the reps of every set', rows: setRows, height: 210,
    }));
    else out.push(repsAtBW());

    // ---- 2. estimated 1RM ----
    const rmCard = lines({
      name: body ? 'Estimated 1RM, total load' : 'Estimated 1RM',
      get: s => (s.rm ? s.rm.mid : null), fmt: kg1, axis: v => num(v, 0), unit: 'kg', height: 220,
      sub: s => (body
        ? `Body weight ${num(s.bw, 1)} kg ${s.rm.mid - s.bw >= 0 ? '+' : '−'} ${num(Math.abs(s.rm.mid - s.bw), 1)} kg`
        : `${num(s.rm.lo, 1)}–${num(s.rm.hi, 1)} kg from ${setText(ex, s.rm.set)}`),
      extra: (gs, pts) => ({
        bands: gs.map(g => ({ color: g.color, pts: g.pts.map(p => ({ x: p.x, lo: p.s.rm.lo, hi: p.s.rm.hi })) })),
        markers: pts.filter(p => [...p.s.prs.values()].some(c => c.includes('rm'))).map(p => ({ x: p.x, y: p.y })),
        series: [...(body ? [{ pts: pts.map(p => ({ x: p.x, y: p.s.bw })), color: C.mute, kind: 'line', dash: '2 5' }] : []), ...gs.map(g => ({ pts: g.pts, color: g.color }))],
      }),
      legendExtra: (gs, pts) => [
        ...(gs.length === 1 && !named ? [{ label: 'Estimate', color: gs[0].color }] : []),
        { label: 'Formula spread', color: gs.length === 1 ? gs[0].color : C.mute, kind: 'band' },
        ...(body ? [{ label: 'Body weight', color: C.mute, kind: 'dash' }] : []),
        ...(pts.some(p => [...p.s.prs.values()].some(c => c.includes('rm'))) ? [{ label: 'Record', color: C.gold, kind: 'dot' }] : []),
      ],
      rows: (s, color) => [
        { label: 'Est. 1RM', value: `${num(s.rm.lo, 1)}–${num(s.rm.hi, 1)} kg`, color },
        ...(body ? [{ label: 'Body weight', value: kg1(s.bw) }, { label: 'Added, 1 rep', value: `${signed(s.rm.mid - s.bw, 1)} kg` }, { label: 'Relative', value: `${num(s.rm.mid / s.bw, 2)} × BW` }] : []),
        { label: 'Best set', value: setText(ex, s.rm.set) },
      ],
      note: 'Best set of each session with 10 reps or fewer. The band is the gap between the Epley and Brzycki formulas. It is not the real uncertainty, which is a few percent and grows with the rep count.'
        + (body ? ' The gap to the dotted body-weight line is the added weight you could move for one rep.' : ''),
    });
    if (rmCard) out.push(rmCard);
    else if (body && all.some(s => s.bw == null)) out.push(h('section', { class: 'card callout' }, h('b', null, 'Body weight missing'),
      h('p', null, 'Log your body weight under Me. For this exercise it is part of the load, so the estimated 1RM needs it.')));
    if (body && weighted && inR.some(s => s.bwReps)) out.push(repsAtBW());
  }

  // ---- 3. heaviest weight per rep count, all time ----
  if (ex.type === 'weight' || ex.type === 'wbw' || ex.type === 'abw') out.push(repCurve(ex, groups, named));
  return out;
}

/** Heaviest weight ever done for at least r reps, r = 1..20, one line per gym. Ignores the time range. */
function repCurve(ex, groups, named) {
  const gs = groups.map(g => {
    const best = repBest(ex.id, g.key);
    return { ...g, best, pts: best.map((b, r) => (b ? { x: r, y: b.ext, b } : null)).filter(Boolean) };
  }).filter(g => g.pts.length);
  if (!gs.length) return null;
  const reps = [...new Set(gs.flatMap(g => g.pts.map(p => p.x)))].sort((a, b) => a - b);
  return chartCard({
    title: 'Heaviest weight per rep count',
    sub: 'All time. The heaviest weight you have done for at least this many reps.',
    legendItems: named ? gs.map(g => ({ label: g.name, color: g.color })) : null,
    height: 210,
    draw: (el, w, H) => xyChart(el, w, H, {
      x0: 1, x1: MAX_REPS, yFmt: v => num(v, 1), label: 'Heaviest weight per rep count',
      xTicks: [1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20].map(r => ({ x: r, label: String(r) })),
      series: gs.map(g => ({ pts: g.pts, color: g.color })),
      scrub: reps.map(r => ({
        x: r, title: `${r} rep${r > 1 ? 's' : ''} or more`,
        rows: gs.filter(g => g.best[r]).map(g => ({ label: named ? g.name : 'Heaviest', value: `${extText(ex, g.best[r].ext)} × ${num(g.best[r].reps)}`, color: g.color })),
        marks: gs.filter(g => g.best[r]).map(g => ({ y: g.best[r].ext, color: g.color })),
      })),
    }),
  });
}

// ---------------------------------------------------------------- records
function recordsView(ex, gym) {
  const r = records(ex.id, gym), body = isBW(ex);
  const rec = (label, value, t, sub) => h('div', { class: 'rec' }, h('span', null, label), h('b', null, value), h('small', null, [sub, t ? dateFull(t) : null].filter(Boolean).join(' · ')));
  const tiles = [];
  if (r.rm) tiles.push(rec(body ? 'Estimated 1RM, total load' : 'Estimated 1RM', kg1(r.rm.v), r.rm.t,
    `${num(r.rm.rm.lo, 1)}–${num(r.rm.rm.hi, 1)} kg from ${setText(ex, r.rm.set)}`));
  if (r.rm && body && r.rm.bw) tiles.push(rec('Estimated 1RM, added weight', `${signed(r.rm.v - r.rm.bw, 1)} kg`, r.rm.t, `at ${num(r.rm.bw, 1)} kg body weight`));
  if (r.top && ex.type !== 'bw') tiles.push(rec(ex.type === 'abw' ? 'Least assistance' : 'Heaviest set', setText(ex, r.top.set), r.top.t));
  if (r.setVol && ex.type !== 'bw') tiles.push(rec('Best set volume', `${big(r.setVol.v)} kg`, r.setVol.t, setText(ex, r.setVol.set)));
  if (r.sessVol && ex.type !== 'bw') tiles.push(rec('Best session volume', `${big(r.sessVol.v)} kg`, r.sessVol.t));
  if (r.maxReps && body) tiles.push(rec('Most reps in a set', `${num(r.maxReps.v)} reps`, r.maxReps.t));
  if (r.sessReps && body) tiles.push(rec('Most reps in a session', `${num(r.sessReps.v)} reps`, r.sessReps.t));
  if (r.maxSec) tiles.push(rec(ex.type === 'time' ? 'Longest set' : 'Longest session', fmtClock(r.maxSec.v), r.maxSec.t));
  if (r.sessSec && ex.type === 'time') tiles.push(rec('Most time in a session', fmtClock(r.sessSec.v), r.sessSec.t));
  if (r.sessKm) tiles.push(rec('Longest distance', `${num(r.sessKm.v, 2)} km`, r.sessKm.t));
  if (r.pace) tiles.push(rec('Fastest pace', `${fmtClock(r.pace.v)} / km`, r.pace.t));

  const totals = [['Sessions', r.n], ['Sets', big(r.sets)]];
  if (r.reps) totals.push(['Reps', big(r.reps)]);
  if (r.vol) totals.push(['Volume', `${big(r.vol)} kg`]);
  if (r.sec) totals.push(['Time', fmtDur(r.sec)]);
  if (r.km) totals.push(['Distance', `${num(r.km, 1)} km`]);

  const best = ex.type === 'weight' || ex.type === 'wbw' || ex.type === 'abw' ? repBest(ex.id, gym) : null;
  const rows = best ? best.map((b, n) => (b ? [n, b] : null)).filter(Boolean) : [];
  return [
    h('div', { class: 'recs' }, tiles),
    h('section', { class: 'card' }, h('h3', null, gym === undefined ? 'All time' : `All time at ${gymById(gym)?.name || 'no gym'}`),
      h('div', { class: 'totals' }, totals.map(([k, v]) => h('div', null, h('b', null, String(v)), h('span', null, k)))),
      h('p', { class: 'chart-note' }, `First logged ${dateFull(r.first)}, last ${dateFull(r.last)}.`)),
    rows.length ? h('section', { class: 'card' }, h('h3', null, 'Heaviest weight per rep count'),
      h('p', { class: 'chart-note' }, 'Heaviest weight you have done for at least this many reps.'),
      h('table', { class: 'table' },
        h('thead', null, h('tr', null, h('th', null, 'Reps'), h('th', null, 'Weight'), h('th', null, 'Set'), h('th', null, 'Date'))),
        h('tbody', null, rows.map(([n, b]) => h('tr', null, h('td', null, `${n}+`), h('td', null, h('b', null, extText(ex, b.ext))), h('td', null, `× ${num(b.reps)}`), h('td', null, dateFull(b.t))))))) : null,
  ];
}

// ---------------------------------------------------------------- history
function historyView({ ex, named }, sess, shown, more) {
  const list = sess.slice().reverse();
  return [
    list.slice(0, shown).map(s => h('section', { class: 'card tap', onclick: () => openWorkout(s.w.id) },
      h('div', { class: 'card-head' }, h('b', null, fmtDate(s.t, { weekday: true, year: true })),
        h('span', { class: 'muted gym-tag' }, named ? [gymDot(gymById(s.gym), groupById(ex.group)?.color), gymById(s.gym)?.name || 'No gym'] : s.w.name)),
      s.w.exercises[s.ei].notes ? h('p', { class: 'note' }, s.w.exercises[s.ei].notes) : null,
      setTable(ex, s.w.exercises[s.ei].sets, s.bw, i => s.prs.get(i)))),
    list.length > shown ? h('button', { class: 'btn btn-soft', onclick: more }, `Show older sessions (${list.length - shown})`) : null,
  ];
}
