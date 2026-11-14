// Exercise detail: graphs, all-time records and session history for one lift.
import { h, icon, num, big, fmtDate, fmtClock, fmtDur, signed, DAY } from '../util.js';
import { S, exById, TYPES, isBW } from '../store.js';
import { sessionsOf, records, repBest, trend, rangeFrom, rangeSpan, RANGE_TEXT, setText, extText } from '../stats.js';
import { pushPage, segmented, empty, cap } from '../ui.js';
import { xyChart, C } from '../charts.js';
import { setTable, rangeControl, chartCard, perMonth, deltaChip } from './common.js';
import { openExerciseForm } from './picker.js';
import { openWorkout } from './history.js';

const kg1 = v => `${num(v, 1)} kg`;
const dateFull = t => fmtDate(t, { year: true });

export function openExercise(exId) {
  let tab = 'graphs', shown = 15;
  const page = pushPage(() => {
    const ex = exById(exId);
    if (!ex) return { title: 'Exercise', body: empty('This exercise was deleted.') };
    const sess = sessionsOf(exId);
    const content = !sess.length
      ? empty('No sets logged yet', 'Add this exercise to a workout. Its graphs and records show up here after the first session.')
      : tab === 'graphs' ? graphs(ex, sess, () => page.render())
        : tab === 'records' ? recordsView(ex)
          : historyView(ex, sess, shown, () => { shown += 30; page.render(); });
    return {
      title: ex.name,
      actions: h('button', { class: 'icon-btn', 'aria-label': 'Edit exercise', onclick: () => openExerciseForm(ex) }, icon('edit', 20)),
      body: [
        h('div', { class: 'ex-meta' }, [TYPES[ex.type], ex.equip && cap(ex.equip), ex.muscle && cap(ex.muscle)].filter(Boolean).join(' · ')),
        ex.notes ? h('div', { class: 'ex-pinned' }, ex.notes) : null,
        segmented([['graphs', 'Graphs'], ['records', 'Records'], ['history', 'History']], tab, v => { tab = v; page.render(); }),
        content,
      ],
    };
  });
}

// ---------------------------------------------------------------- graphs
function graphs(ex, all, rerender) {
  const range = S.settings.range, now = Date.now();
  let from = rangeFrom(range, now);
  const inR = all.filter(s => s.t >= from);
  if (from === -Infinity) from = all[0].t - Math.max(DAY, (now - all[0].t) * 0.03);
  const out = [rangeControl(rerender)];
  if (!inR.length) {
    out.push(empty(`No sessions in the ${RANGE_TEXT[range]}`, `Last trained on ${dateFull(all.at(-1).t)}. Pick a longer range to see it.`));
    return out;
  }
  const base = { x0: from, x1: now };
  const title = s => fmtDate(s.t, { weekday: true, year: true });

  /** A plain one-line chart of a per-session number. */
  const metric = ({ name, get, fmt, axis, sub, unit, dp = 1, rows, note, zero = false, area = false, trendChip = true }) => {
    const pts = inR.map(s => ({ x: s.t, y: get(s), s })).filter(p => p.y != null);
    if (!pts.length) return null;
    const tr = trend(pts), last = pts.at(-1);
    return chartCard({
      title: name, value: fmt(last.y), sub,
      chip: trendChip && tr ? (unit === 'time' ? deltaChip(tr.perMonth, `${signed(tr.perMonth, 0)} s / month`) : perMonth(tr, unit, dp)) : null,
      note,
      draw: (el, w, H) => xyChart(el, w, H, {
        ...base, zero, yFmt: axis || (v => num(v, 1)), label: name,
        series: [{ pts, color: C.c1, area }], trend: tr,
        scrub: pts.map(p => ({ x: p.x, title: title(p.s), rows: rows ? rows(p.s) : [{ label: name, value: fmt(p.y), color: C.c1 }], marks: [{ y: p.y, color: C.c1 }] })),
      }),
    });
  };

  if (ex.type === 'time') {
    out.push(
      metric({ name: 'Longest set', get: s => s.maxSec || null, fmt: fmtClock, axis: fmtClock, unit: 'time' }),
      metric({ name: 'Total time per session', get: s => s.sec || null, fmt: fmtClock, axis: fmtClock, unit: 'time', zero: true, area: true }));
    return out;
  }
  if (ex.type === 'dist') {
    out.push(
      metric({ name: 'Distance per session', get: s => s.km || null, fmt: v => `${num(v, 2)} km`, unit: 'km', dp: 2, zero: true, area: true }),
      metric({ name: 'Pace', get: s => s.pace, fmt: v => `${fmtClock(v)} / km`, axis: fmtClock, unit: 'time', sub: 'Lower is faster', trendChip: false }),
      metric({ name: 'Time per session', get: s => s.sec || null, fmt: fmtClock, axis: fmtClock, unit: 'time', zero: true }));
    return out;
  }
  if (ex.type === 'bw') {
    out.push(
      metric({ name: 'Most reps in a set', get: s => s.maxReps || null, fmt: v => `${v} reps`, axis: v => num(v, 0), unit: 'reps' }),
      metric({ name: 'Total reps per session', get: s => s.reps || null, fmt: v => `${v} reps`, axis: v => num(v, 0), unit: 'reps', zero: true, area: true }));
    return out;
  }

  // ---- weighted lifts and bodyweight lifts with added / removed weight ----
  const body = isBW(ex);
  const rmPts = inR.filter(s => s.rm).map(s => ({ x: s.t, y: s.rm.mid, lo: s.rm.lo, hi: s.rm.hi, s }));
  if (rmPts.length) {
    const tr = trend(rmPts), last = rmPts.at(-1);
    const markers = rmPts.filter(p => [...p.s.prs.values()].some(c => c.includes('rm'))).map(p => ({ x: p.x, y: p.y }));
    const bwPts = body ? rmPts.map(p => ({ x: p.x, y: p.s.bw })) : [];
    out.push(chartCard({
      title: body ? 'Estimated 1RM, total load' : 'Estimated 1RM',
      value: kg1(last.y),
      chip: perMonth(tr, 'kg'),
      sub: body
        ? `Body weight ${num(last.s.bw, 1)} kg ${last.y - last.s.bw >= 0 ? '+' : '−'} ${num(Math.abs(last.y - last.s.bw), 1)} kg`
        : `${num(last.lo, 1)}–${num(last.hi, 1)} kg from ${setText(ex, last.s.rm.set)}`,
      legendItems: [
        { label: 'Estimate', color: C.c1 }, { label: 'Formula spread', color: C.c1, kind: 'band' },
        body ? { label: 'Body weight', color: C.c2 } : null,
        tr ? { label: 'Trend', color: C.mute, kind: 'dash' } : null,
        markers.length ? { label: 'Record', color: C.gold, kind: 'dot' } : null,
      ].filter(Boolean),
      note: 'Best set of each session with 10 reps or fewer. The band is the gap between the Epley and Brzycki formulas. It is not the real uncertainty, which is a few percent and grows with the rep count.'
        + (body ? ' The gap between the two lines is the added weight you could move for one rep.' : ''),
      height: 220,
      draw: (el, w, H) => xyChart(el, w, H, {
        ...base, yFmt: v => num(v, 0), label: 'Estimated one-rep max over time',
        band: { pts: rmPts, color: C.c1 },
        series: [...(body ? [{ pts: bwPts, color: C.c2, kind: 'line' }] : []), { pts: rmPts, color: C.c1 }],
        trend: tr, markers,
        scrub: rmPts.map(p => ({
          x: p.x, title: title(p.s),
          rows: [
            { label: 'Est. 1RM', value: `${num(p.lo, 1)}–${num(p.hi, 1)} kg`, color: C.c1 },
            body ? { label: 'Body weight', value: kg1(p.s.bw), color: C.c2 } : null,
            body ? { label: 'Added, 1 rep', value: `${signed(p.y - p.s.bw, 1)} kg` } : null,
            { label: 'Best set', value: setText(ex, p.s.rm.set) },
          ].filter(Boolean),
          marks: [{ y: p.y, color: C.c1 }, body ? { y: p.s.bw, color: C.c2 } : null].filter(Boolean),
        })),
      }),
    }));
    if (body) out.push(metric({
      name: 'Relative strength', get: s => (s.rm && s.bw ? s.rm.mid / s.bw : null),
      fmt: v => `${num(v, 2)} × BW`, axis: v => num(v, 2), trendChip: false,
      sub: 'Estimated 1RM divided by body weight',
      note: 'Gaining body weight raises the total load on its own. This ratio only rises when you get stronger for your size.',
    }));
  } else if (body && all.some(s => s.bw == null)) {
    out.push(h('section', { class: 'card callout' }, h('b', null, 'Body weight missing'),
      h('p', null, 'Log your body weight under Me. For this exercise it is part of the load, so the estimated 1RM and volume need it.')));
  }

  const hasExt = inR.some(s => s.top && s.top.ext !== 0);
  if (hasExt) out.push(metric({
    name: ex.type === 'wbw' ? 'Heaviest added weight' : ex.type === 'abw' ? 'Least assistance' : 'Heaviest set',
    get: s => (s.top ? s.top.ext : null), fmt: v => extText(ex, v), axis: v => num(v, 1), unit: 'kg',
    rows: s => [{ label: 'Heaviest', value: setText(ex, s.top), color: C.c1 }],
  }));
  if (body) out.push(metric({
    name: ex.type === 'wbw' ? 'Most reps at body weight' : 'Most reps in a set',
    get: s => (ex.type === 'wbw' ? s.bwReps : s.maxReps) || null, fmt: v => `${v} reps`, axis: v => num(v, 0), unit: 'reps',
  }));
  out.push(metric({
    name: 'Volume per session', get: s => s.vol || null, fmt: v => `${big(v)} kg`, axis: v => (v >= 10000 ? num(v / 1000, 0) + 'k' : big(v)),
    unit: 'kg', dp: 0, zero: true, area: true,
    sub: body ? 'Sets × reps × load, body weight included' : 'Sets × reps × weight, warm-ups left out',
    rows: s => [{ label: 'Volume', value: `${big(s.vol)} kg`, color: C.c1 }, { label: 'Sets', value: String(s.sets.length) }, { label: 'Reps', value: String(s.reps) }],
  }));
  out.push(repCurve(ex, range, now));
  return out;
}

/** Heaviest weight per rep count: this period against the one before it. */
function repCurve(ex, range, now) {
  const span = rangeSpan(range);
  const cur = repBest(ex.id, span ? now - span : -Infinity, Infinity);
  const old = span ? repBest(ex.id, now - 2 * span, now - span) : null;
  const toPts = arr => arr ? arr.map((b, r) => (b ? { x: r, y: b.ext, b } : null)).filter(Boolean) : [];
  const a = toPts(cur), b = toPts(old);
  if (a.length < 2) return null;
  const nowLabel = span ? cap(RANGE_TEXT[range]) : 'All time', oldLabel = 'Period before';
  return chartCard({
    title: 'Rep maxes',
    sub: 'Heaviest weight for at least this many reps',
    legendItems: b.length ? [{ label: nowLabel, color: C.c1 }, { label: oldLabel, color: C.mute, kind: 'dash' }] : null,
    note: b.length ? 'A curve above the dashed one means you are stronger at that rep count than in the period before.' : null,
    draw: (el, w, H) => xyChart(el, w, H, {
      x0: 1, x1: 12, yFmt: v => num(v, 1), label: 'Best weight per rep count',
      xTicks: [1, 2, 3, 4, 5, 6, 8, 10, 12].map(r => ({ x: r, label: String(r) })),
      series: [...(b.length ? [{ pts: b, color: C.mute, dash: '4 4', kind: 'line' }] : []), { pts: a, color: C.c1 }],
      scrub: a.map(p => {
        const o = old && old[p.x];
        return {
          x: p.x, title: `${p.x} rep${p.x > 1 ? 's' : ''} or more`,
          rows: [{ label: nowLabel, value: `${extText(ex, p.y)} × ${p.b.reps}`, color: C.c1 }, o ? { label: oldLabel, value: `${extText(ex, o.ext)} × ${o.reps}`, color: C.mute } : null].filter(Boolean),
          marks: [{ y: p.y, color: C.c1 }],
        };
      }),
    }),
  });
}

// ---------------------------------------------------------------- records
function recordsView(ex) {
  const r = records(ex.id), body = isBW(ex);
  const rec = (label, value, t, sub) => h('div', { class: 'rec' }, h('span', null, label), h('b', null, value), h('small', null, [sub, t ? dateFull(t) : null].filter(Boolean).join(' · ')));
  const tiles = [];
  if (r.rm) tiles.push(rec(body ? 'Estimated 1RM, total load' : 'Estimated 1RM', kg1(r.rm.v), r.rm.t,
    `${num(r.rm.rm.lo, 1)}–${num(r.rm.rm.hi, 1)} kg from ${setText(ex, r.rm.set)}`));
  if (r.rm && body && r.rm.bw) tiles.push(rec('Estimated 1RM, added weight', `${signed(r.rm.v - r.rm.bw, 1)} kg`, r.rm.t, `at ${num(r.rm.bw, 1)} kg body weight`));
  if (r.top && ex.type !== 'bw') tiles.push(rec(ex.type === 'abw' ? 'Least assistance' : 'Heaviest set', setText(ex, r.top.set), r.top.t));
  if (r.setVol && ex.type !== 'bw') tiles.push(rec('Best set volume', `${big(r.setVol.v)} kg`, r.setVol.t, setText(ex, r.setVol.set)));
  if (r.sessVol && ex.type !== 'bw') tiles.push(rec('Best session volume', `${big(r.sessVol.v)} kg`, r.sessVol.t));
  if (r.maxReps && body) tiles.push(rec('Most reps in a set', `${r.maxReps.v} reps`, r.maxReps.t));
  if (r.sessReps && body) tiles.push(rec('Most reps in a session', `${r.sessReps.v} reps`, r.sessReps.t));
  if (r.maxSec) tiles.push(rec(ex.type === 'time' ? 'Longest set' : 'Longest session', fmtClock(r.maxSec.v), r.maxSec.t));
  if (r.sessSec && ex.type === 'time') tiles.push(rec('Most time in a session', fmtClock(r.sessSec.v), r.sessSec.t));
  if (r.sessKm) tiles.push(rec('Longest distance', `${num(r.sessKm.v, 2)} km`, r.sessKm.t));
  if (r.pace) tiles.push(rec('Fastest pace', `${fmtClock(r.pace.v)} / km`, r.pace.t));

  const totals = [['Sessions', r.n], ['Sets', big(r.sets)]];
  if (r.reps) totals.push(['Reps', big(r.reps)]);
  if (r.vol) totals.push(['Volume', `${big(r.vol)} kg`]);
  if (r.sec) totals.push(['Time', fmtDur(r.sec)]);
  if (r.km) totals.push(['Distance', `${num(r.km, 1)} km`]);

  const best = ex.type === 'weight' || ex.type === 'wbw' || ex.type === 'abw' ? repBest(ex.id) : null;
  const rows = best ? best.map((b, n) => (b ? [n, b] : null)).filter(Boolean) : [];
  return [
    h('div', { class: 'recs' }, tiles),
    h('section', { class: 'card' }, h('h3', null, 'All time'),
      h('div', { class: 'totals' }, totals.map(([k, v]) => h('div', null, h('b', null, String(v)), h('span', null, k)))),
      h('p', { class: 'chart-note' }, `First logged ${dateFull(r.first)}, last ${dateFull(r.last)}.`)),
    rows.length ? h('section', { class: 'card' }, h('h3', null, 'Rep maxes'),
      h('p', { class: 'chart-note' }, 'Heaviest weight you have done for at least this many reps.'),
      h('table', { class: 'table' },
        h('thead', null, h('tr', null, h('th', null, 'Reps'), h('th', null, 'Weight'), h('th', null, 'Set'), h('th', null, 'Date'))),
        h('tbody', null, rows.map(([n, b]) => h('tr', null, h('td', null, `${n}+`), h('td', null, h('b', null, extText(ex, b.ext))), h('td', null, `× ${b.reps}`), h('td', null, dateFull(b.t))))))) : null,
  ];
}

// ---------------------------------------------------------------- history
function historyView(ex, sess, shown, more) {
  const list = sess.slice().reverse();
  return [
    list.slice(0, shown).map(s => h('section', { class: 'card tap', onclick: () => openWorkout(s.w.id) },
      h('div', { class: 'card-head' }, h('b', null, fmtDate(s.t, { weekday: true, year: true })), h('span', { class: 'muted' }, s.w.name)),
      s.w.exercises[s.ei].notes ? h('p', { class: 'note' }, s.w.exercises[s.ei].notes) : null,
      setTable(ex, s.w.exercises[s.ei].sets, s.bw, i => s.prs.get(i)))),
    list.length > shown ? h('button', { class: 'btn btn-soft', onclick: more }, `Show older sessions (${list.length - shown})`) : null,
  ];
}
