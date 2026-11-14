// Everything derived from the raw log: loads, estimated 1RM, records, PRs, trends, bins.
import { S, rev, exById, bwAt } from './store.js';
import { DAY, num, fmtClock, weekStart, monthStart } from './util.js';

// ---- estimated one-rep max ----
export const epley = (w, r) => (r === 1 ? w : w * (1 + r / 30));
export const brzycki = (w, r) => (r === 1 ? w : w * 36 / (37 - r));
/** Both formulas for one set. Only defined for 1–10 reps; above that the formulas are not trustworthy. */
export function e1rm(w, r) {
  if (!(w > 0) || !(r >= 1) || r > 10) return null;
  const a = epley(w, r), b = brzycki(w, r);
  return { lo: Math.min(a, b), hi: Math.max(a, b), mid: (a + b) / 2 };
}

/**
 * One set with its derived numbers.
 * ext  = weight on the bar / added weight (negative for assistance)
 * load = what is actually moved: ext, or body weight + ext for bodyweight exercises
 */
export function calc(ex, set, bw) {
  const o = { t: set.t || 'n', kg: set.kg ?? null, reps: set.reps ?? null, sec: set.sec ?? null, km: set.km ?? null, ext: null, load: null, vol: null, rm: null };
  switch (ex.type) {
    case 'weight': o.ext = o.kg ?? 0; o.load = o.ext; break;
    case 'wbw': o.ext = o.kg ?? 0; o.load = bw == null ? null : bw + o.ext; break;
    case 'abw': o.ext = -(o.kg ?? 0); o.load = bw == null ? null : Math.max(0, bw + o.ext); break;
    case 'bw': o.ext = 0; o.load = bw; break;
  }
  if (o.reps != null && o.ext != null) {
    o.vol = (o.load ?? Math.max(0, o.ext)) * o.reps;
    if (ex.type !== 'bw' && o.load != null) o.rm = e1rm(o.load, o.reps);
  }
  return o;
}

/** Aggregates for one exercise within one workout. Warm-up sets are left out of every statistic. */
export function summarize(ex, rawSets, bw, onlyDone = false) {
  const sets = [];
  rawSets.forEach((r, i) => {
    if ((onlyDone && !r.done) || r.t === 'w') return;
    const c = calc(ex, r, bw); c.i = i; sets.push(c);
  });
  if (!sets.length) return null;
  const o = { sets, bw, rm: null, top: null, vol: 0, setVol: 0, reps: 0, maxReps: 0, bwReps: 0, sec: 0, maxSec: 0, km: 0, pace: null };
  for (const c of sets) {
    if (c.rm && (!o.rm || c.rm.mid > o.rm.mid)) o.rm = { ...c.rm, set: c };
    if (c.reps) {
      if (ex.type !== 'bw' && (!o.top || c.ext > o.top.ext || (c.ext === o.top.ext && c.reps > o.top.reps))) o.top = c;
      o.vol += c.vol || 0; o.setVol = Math.max(o.setVol, c.vol || 0);
      o.reps += c.reps; o.maxReps = Math.max(o.maxReps, c.reps);
      if (c.ext === 0) o.bwReps = Math.max(o.bwReps, c.reps);
    }
    if (c.sec) { o.sec += c.sec; o.maxSec = Math.max(o.maxSec, c.sec); }
    if (c.km) o.km += c.km;
  }
  if (o.km > 0 && o.sec > 0) o.pace = o.sec / o.km;
  return o;
}

// ---- personal records ----
const CATS = { weight: ['rm', 'wt', 'vol'], wbw: ['rm', 'wt', 'vol'], abw: ['rm', 'wt'], bw: ['reps'], time: ['sec'], dist: ['km'] };
export const PR_LABEL = { rm: '1RM', wt: 'Weight', vol: 'Volume', reps: 'Reps', sec: 'Time', km: 'Distance' };
const catVal = (cat, c) =>
  cat === 'rm' ? c.rm?.mid
    : cat === 'wt' ? (c.reps >= 1 ? c.ext : null)
      : cat === 'vol' ? c.vol : cat === 'reps' ? c.reps : cat === 'sec' ? c.sec : c.km;

function sessionBest(ex, sets) {
  const out = {};
  for (const cat of CATS[ex.type] || []) for (const c of sets) {
    const v = catVal(cat, c);
    if (v != null && (cat === 'wt' || v > 0) && (!out[cat] || v > out[cat].v)) out[cat] = { v, i: c.i };
  }
  return out;
}
/** Which sets of a session beat everything before it. Map: set index -> ['rm', 'wt', ...] */
export function sessionPRs(ex, best, sets) {
  const out = new Map(), sb = sessionBest(ex, sets);
  for (const cat in sb) if (best[cat] != null && sb[cat].v > best[cat] + 1e-9) {
    const a = out.get(sb[cat].i) || []; a.push(cat); out.set(sb[cat].i, a);
  }
  return out;
}

// ---- index over the whole log (rebuilt only when data changed) ----
let cache = { n: -1 };
export function idx() {
  if (cache.n === rev.n) return cache;
  const byEx = new Map(), prs = new Map(), bests = new Map(), wstats = new Map();
  for (const w of S.workouts) {
    const bw = bwAt(w.start), st = { vol: 0, sets: 0, reps: 0, dur: Math.max(0, (w.end - w.start) / 1000), prs: 0 };
    w.exercises.forEach((we, ei) => {
      const ex = exById(we.exId);
      const sess = ex && summarize(ex, we.sets, bw);
      if (!sess) return;
      sess.w = w; sess.t = w.start; sess.ei = ei;
      st.vol += sess.vol; st.sets += sess.sets.length; st.reps += sess.reps;
      if (!byEx.has(ex.id)) byEx.set(ex.id, []);
      byEx.get(ex.id).push(sess);
    });
    wstats.set(w.id, st);
  }
  for (const [id, arr] of byEx) {
    const ex = exById(id), best = {};
    arr.forEach((sess, n) => {
      sess.prs = n ? sessionPRs(ex, best, sess.sets) : new Map();
      if (sess.prs.size) {
        if (!prs.has(sess.w.id)) prs.set(sess.w.id, new Map());
        for (const [i, cats] of sess.prs) { prs.get(sess.w.id).set(sess.ei + ':' + i, cats); wstats.get(sess.w.id).prs += cats.length; }
      }
      const sb = sessionBest(ex, sess.sets);
      for (const c in sb) if (best[c] == null || sb[c].v > best[c]) best[c] = sb[c].v;
    });
    bests.set(id, best);
  }
  cache = { n: rev.n, byEx, prs, bests, wstats };
  return cache;
}
export const sessionsOf = exId => idx().byEx.get(exId) || [];
export const workoutStats = w => idx().wstats.get(w.id) || { vol: 0, sets: 0, reps: 0, dur: 0, prs: 0 };

/** PRs for a workout that is still being logged, measured against the whole saved history. */
export function livePRs(ex, rawSets, bw) {
  const best = idx().bests.get(ex.id);
  const sm = best && summarize(ex, rawSets, bw, true);
  return sm ? sessionPRs(ex, best, sm.sets) : new Map();
}
export function liveStats(draft, bw) {
  const st = { vol: 0, sets: 0 };
  for (const we of draft.exercises) {
    const ex = exById(we.exId);
    const sm = ex && summarize(ex, we.sets, bw, true);
    if (sm) { st.vol += sm.vol; st.sets += sm.sets.length; }
  }
  return st;
}
/** Raw sets of the most recent earlier session of an exercise (warm-ups included). */
export function prevSets(exId, beforeT, excludeWid) {
  const arr = sessionsOf(exId);
  for (let i = arr.length - 1; i >= 0; i--) {
    if (arr[i].t < beforeT && arr[i].w.id !== excludeWid) return arr[i].w.exercises[arr[i].ei].sets;
  }
  return null;
}

/** All-time records and totals for one exercise. */
export function records(exId) {
  const arr = sessionsOf(exId);
  const r = { n: arr.length, sets: 0, reps: 0, vol: 0, sec: 0, km: 0, first: arr[0]?.t, last: arr.at(-1)?.t };
  const up = (key, v, t, extra) => { if (v != null && (!r[key] || v > r[key].v)) r[key] = { v, t, ...extra }; };
  for (const s of arr) {
    r.sets += s.sets.length; r.reps += s.reps; r.vol += s.vol; r.sec += s.sec; r.km += s.km;
    if (s.rm) up('rm', s.rm.mid, s.t, { rm: s.rm, set: s.rm.set, bw: s.bw });
    if (s.top && (!r.top || s.top.ext > r.top.v || (s.top.ext === r.top.v && s.top.reps > r.top.set.reps))) r.top = { v: s.top.ext, t: s.t, set: s.top };
    up('sessVol', s.vol || null, s.t);
    for (const c of s.sets) up('setVol', c.vol || null, s.t, { set: c });
    up('maxReps', s.maxReps || null, s.t); up('sessReps', s.reps || null, s.t); up('bwReps', s.bwReps || null, s.t);
    up('maxSec', s.maxSec || null, s.t); up('sessSec', s.sec || null, s.t); up('sessKm', s.km || null, s.t);
    if (s.pace && (!r.pace || s.pace < r.pace.v)) r.pace = { v: s.pace, t: s.t };
  }
  return r;
}

/** Heaviest weight done for at least r reps (r = 1..12) inside a time window. Index 0 is unused. */
export function repBest(exId, from = -Infinity, to = Infinity) {
  const best = new Array(13).fill(null);
  for (const s of sessionsOf(exId)) {
    if (s.t < from || s.t >= to) continue;
    for (const c of s.sets) {
      if (!c.reps || c.ext == null) continue;
      for (let r = 1; r <= Math.min(c.reps, 12); r++) {
        if (!best[r] || c.ext > best[r].ext) best[r] = { ext: c.ext, reps: c.reps, t: s.t };
      }
    }
  }
  return best;
}

// ---- trends and time ranges ----
/** Least-squares line through {x: ms, y}. Needs 3 points spread over at least a week. */
export function trend(pts) {
  const n = pts.length;
  if (n < 3) return null;
  const x0 = pts[0].x, xs = pts.map(p => (p.x - x0) / DAY);
  if (xs[n - 1] < 7) return null;
  const mx = xs.reduce((a, b) => a + b, 0) / n, my = pts.reduce((a, p) => a + p.y, 0) / n;
  let sxy = 0, sxx = 0;
  for (let i = 0; i < n; i++) { sxy += (xs[i] - mx) * (pts[i].y - my); sxx += (xs[i] - mx) ** 2; }
  if (!sxx) return null;
  const slope = sxy / sxx, icpt = my - slope * mx, y0 = icpt, y1 = icpt + slope * xs[n - 1];
  return { perMonth: slope * 30.4375, x0, x1: pts[n - 1].x, y0, y1, pct: y0 > 0 ? (y1 - y0) / y0 * 100 : null };
}

export const RANGES = ['1M', '3M', '6M', '1Y', 'All'];
const RANGE_DAYS = { '1M': 30.4375, '3M': 91.3125, '6M': 182.625, '1Y': 365.25 };
export const RANGE_TEXT = { '1M': 'last month', '3M': 'last 3 months', '6M': 'last 6 months', '1Y': 'last year', All: 'all time' };
/** Start of the selected range in ms, or -Infinity for "All". */
export const rangeFrom = (range, now = Date.now()) => (RANGE_DAYS[range] ? now - RANGE_DAYS[range] * DAY : -Infinity);
export const rangeSpan = range => (RANGE_DAYS[range] ? RANGE_DAYS[range] * DAY : null);

/** The one number that best tracks progress for an exercise, as a time series. */
export function primarySeries(ex, from = -Infinity) {
  const arr = sessionsOf(ex.id).filter(s => s.t >= from);
  const mk = (f, label, fmt) => ({ pts: arr.map(s => ({ x: s.t, y: f(s) })).filter(p => p.y != null && p.y > -Infinity), label, fmt });
  if (ex.type === 'bw') return mk(s => s.maxReps || null, 'best set', v => `${num(v, 0)} reps`);
  if (ex.type === 'time') return mk(s => s.maxSec || null, 'longest set', v => fmtClock(v));
  if (ex.type === 'dist') return mk(s => s.km || null, 'distance', v => `${num(v, 1)} km`);
  const rm = mk(s => s.rm?.mid ?? null, 'est. 1RM', v => `${num(v, 1)} kg`);
  if (rm.pts.length || ex.type === 'weight') return rm;
  return mk(s => (s.top ? s.top.ext : null), 'heaviest', v => `${v > 0 ? '+' : ''}${num(v, 1)} kg`);
}

/** Workouts grouped into weeks (Monday start) or months between two instants. */
export function bins(from, to, unit) {
  const start = unit === 'week' ? weekStart : monthStart;
  const next = x => { const d = new Date(x); unit === 'week' ? d.setDate(d.getDate() + 7) : d.setMonth(d.getMonth() + 1); return d.getTime(); };
  const out = [], at = new Map();
  for (let x = start(from); x <= to; x = next(x)) { const b = { x, n: 0, vol: 0, sec: 0 }; at.set(x, b); out.push(b); }
  for (const w of S.workouts) {
    const b = at.get(start(w.start));
    if (!b) continue;
    const st = workoutStats(w);
    b.n++; b.vol += st.vol; b.sec += st.dur;
  }
  return out;
}

/** Consecutive weeks with at least one workout, counting back from this week (or last week if this one is still empty). */
export function streakWeeks(now = Date.now()) {
  const weeks = new Set(S.workouts.map(w => weekStart(w.start)));
  let cur = weekStart(now), n = 0;
  if (!weeks.has(cur)) cur = weekStart(cur - DAY);
  while (weeks.has(cur)) { n++; cur = weekStart(cur - DAY); }
  return n;
}

// ---- text ----
const kgSigned = (ex, c) => ex.type === 'wbw' ? (c.kg ? `+${num(c.kg)}` : 'BW') : ex.type === 'abw' ? `−${num(c.kg || 0)}` : num(c.kg || 0);
/** "100 kg × 5" */
export function setText(ex, c) {
  switch (ex.type) {
    case 'weight': return `${num(c.kg || 0)} kg × ${c.reps}`;
    case 'wbw': return c.kg ? `+${num(c.kg)} kg × ${c.reps}` : `BW × ${c.reps}`;
    case 'abw': return `−${num(c.kg || 0)} kg × ${c.reps}`;
    case 'bw': return `${c.reps} reps`;
    case 'time': return fmtClock(c.sec || 0);
    default: return `${num(c.km || 0)} km${c.sec ? ' in ' + fmtClock(c.sec) : ''}`;
  }
}
/** Compact form for the "Previous" column: "100 × 5" */
export function setShort(ex, c) {
  switch (ex.type) {
    case 'bw': return `× ${c.reps}`;
    case 'time': return fmtClock(c.sec || 0);
    case 'dist': return `${num(c.km || 0)} km`;
    default: return `${kgSigned(ex, c)} × ${c.reps}`;
  }
}
/** Added-weight label for bodyweight lifts: 10 -> "+10 kg", 0 -> "BW", -20 -> "−20 kg" */
export const extText = (ex, v) => (ex.type === 'weight' ? `${num(v)} kg` : v === 0 ? 'BW' : `${v > 0 ? '+' : '−'}${num(Math.abs(v))} kg`);

/** CSV row for the export. */
export function csvRow(w, ex, set, i) {
  const bw = bwAt(w.start), c = calc(ex, set, bw), d = new Date(w.start);
  const p = n => String(n).padStart(2, '0');
  const ok = c.load > 0 && c.reps >= 1 && c.reps <= 10 && ex.type !== 'bw';
  return [`${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`, `${p(d.getHours())}:${p(d.getMinutes())}`, w.name, ex.name, ex.type,
    i + 1, c.t, c.kg, c.reps, c.sec, c.km, bw, c.load == null ? null : +c.load.toFixed(2),
    ok ? +epley(c.load, c.reps).toFixed(2) : null, ok ? +brzycki(c.load, c.reps).toFixed(2) : null];
}
