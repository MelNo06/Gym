// Made-up training history for previewing the graphs. Loaded only on request from the Me tab.
import { slug } from './library.js';
import { DAY, dayKey, uid } from './util.js';

export function makeDemo(now = Date.now()) {
  let seed = 11;
  const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
  const jit = a => (rnd() * 2 - 1) * a;
  const id = n => 'lib-' + slug(n);
  const r25 = v => Math.max(0, Math.round(v / 2.5) * 2.5);
  const days = 548, t0 = new Date(now - days * DAY); t0.setHours(0, 0, 0, 0);
  const prog = d => Math.pow(d / days, 0.75);

  // body weight: 74 -> 80 kg, weighed roughly twice a week
  const measurements = [];
  const bwOn = d => 74 + 6 * prog(d) + Math.sin(d / 40) * 0.5;
  for (let d = 0; d <= days; d += 3 + Math.floor(rnd() * 3)) {
    const m = { id: uid() + d, date: dayKey(t0.getTime() + d * DAY), kg: +(bwOn(d) + jit(0.5)).toFixed(1) };
    if (d % 28 < 4) m.bf = +(17 - 3 * prog(d) + jit(0.4)).toFixed(1);
    measurements.push(m);
  }

  // [name, 1RM at start, 1RM now, reps, sets, warm-up?]
  const PLAN = {
    Push: [['Bench Press', 82, 112, 5, 3, 1], ['Overhead Press', 50, 68, 6, 3, 1], ['Incline Bench Press (Dumbbell)', 30, 42, 9, 3], ['Lateral Raise (Dumbbell)', 12, 18, 12, 3], ['Triceps Rope Pushdown', 32, 48, 12, 3], ['Dip', 'bw', 0, 8, 3]],
    Pull: [['Deadlift', 130, 180, 4, 2, 1], ['Pull-Up', 'bw', 0, 6, 4], ['Bent-Over Row', 75, 100, 8, 3], ['Lat Pulldown', 70, 92, 10, 3], ['Barbell Curl', 38, 50, 9, 3], ['Plank', 'time', 0, 0, 2]],
    Legs: [['Squat', 100, 142, 5, 3, 1], ['Romanian Deadlift', 95, 130, 8, 3], ['Leg Press', 200, 290, 10, 3], ['Seated Leg Curl', 55, 75, 11, 3], ['Standing Calf Raise', 90, 130, 12, 3], ['Hanging Leg Raise', 'reps', 0, 0, 3]],
  };
  const order = ['Push', 'Pull', 'Legs'];
  // The second gym's machines and cables run about 15 % heavier, so the same lift moves less weight there.
  const MACHINE = new Set(['Triceps Rope Pushdown', 'Lat Pulldown', 'Leg Press', 'Seated Leg Curl', 'Standing Calf Raise']);
  const workouts = [];
  let k = 0;
  for (let d = 0; d <= days; d++) {
    const date = new Date(t0.getTime() + d * DAY), wd = date.getDay();
    if (d > 300 && d < 316) continue;                       // a two-week break
    if (![1, 2, 4, 5].includes(wd) && !(wd === 6 && rnd() < 0.25)) continue;
    if (rnd() < 0.12) continue;                             // skipped session
    const start = date.getTime() + (17.5 + jit(1.2)) * 36e5;
    if (start > now) continue;
    const p = prog(d), form = 1 + Math.sin(d / 23) * 0.015 + jit(0.012), bw = bwOn(d);
    const gymId = wd === 6 ? null : wd === 5 || (d > 380 && d < 420) ? 'demo-g2' : 'demo-g1';
    if (wd === 6) {
      const km = +(4 + rnd() * 4).toFixed(1);
      workouts.push({ id: 'demo' + d, name: 'Run', gymId, start, end: start + km * (5.6 - 0.5 * p) * 60000, notes: '', routineId: null, exercises: [{ exId: id('Running'), notes: '', sets: [{ t: 'n', km, sec: Math.round(km * (5.6 - 0.5 * p + jit(0.15)) * 60) }] }] });
      continue;
    }
    const name = order[k++ % 3], exercises = [];
    for (const [ex, a, b, reps, nsets, warm] of PLAN[name]) {
      const sets = [];
      if (a === 'time') for (let i = 0; i < nsets; i++) sets.push({ t: 'n', sec: Math.round((60 + 70 * p) * form - i * 10) });
      else if (a === 'reps') for (let i = 0; i < nsets; i++) sets.push({ t: 'n', reps: Math.max(4, Math.round((8 + 8 * p) * form - i)) });
      else if (a === 'bw') {
        // total-load 1RM grows from 1.25x to 1.5x body weight (pull-ups) or 1.4x to 1.7x (dips)
        const rm = bw * (ex === 'Dip' ? 1.4 + 0.3 * p : 1.25 + 0.25 * p) * form;
        const add = Math.max(0, r25(rm / (1 + reps / 30) - bw));
        for (let i = 0; i < nsets; i++) {
          const can = Math.floor(30 * (rm / (bw + add) - 1));
          const s = { t: 'n', reps: Math.max(2, Math.min(reps + 2, can) - Math.floor(i * 0.7 + rnd() * 0.8)) };
          if (add) s.kg = add;
          sets.push(s);
        }
      } else {
        const rm = (a + (b - a) * p) * form * (gymId === 'demo-g2' && MACHINE.has(ex) ? 0.85 : 1), wk = r25(rm / (1 + reps / 30) * 0.97);
        if (warm) sets.push({ t: 'w', kg: r25(wk * 0.6), reps: 5 });
        for (let i = 0; i < nsets; i++) sets.push({ t: 'n', kg: wk, reps: Math.max(1, reps + (rnd() < 0.25 ? 1 : 0) - Math.floor(i * 0.6 + rnd() * 0.7)) });
      }
      exercises.push({ exId: id(ex), notes: '', sets });
    }
    workouts.push({ id: 'demo' + d, name, gymId, start, end: start + (58 + rnd() * 25) * 60000, notes: '', routineId: 'demo-' + name, exercises });
  }
  const routines = order.map(name => {
    const last = workouts.filter(w => w.name === name).at(-1);
    return { id: 'demo-' + name, name, notes: '', exercises: last ? last.exercises.map(we => ({ exId: we.exId, notes: '', sets: we.sets.map(s => ({ ...s })) })) : [] };
  });
  return {
    app: 'gym', schema: 1, exportedAt: new Date(now).toISOString(),
    data: { exercises: [], workouts, routines, measurements, gyms: [{ id: 'demo-g1', name: 'City gym', shade: 0 }, { id: 'demo-g2', name: 'Campus gym', shade: 2 }], profile: { birth: '2001-03-14', heightCm: 182 }, settings: { range: '1Y' }, meta: { demo: true } },
  };
}
