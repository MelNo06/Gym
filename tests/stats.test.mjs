import assert from 'node:assert/strict';
import { S, rev, bwAt } from '../js/store.js';
import { LIBRARY } from '../js/library.js';
import * as st from '../js/stats.js';
import { makeDemo } from '../js/demo.js';
import { DAY } from '../js/util.js';

const near = (a, b, e = 1e-6) => assert.ok(Math.abs(a - b) < e, `${a} != ${b}`);
// formulas
near(st.epley(100, 5), 116.6666667, 1e-6); near(st.brzycki(100, 5), 112.5);
near(st.epley(100, 10), st.brzycki(100, 10)); near(st.epley(100, 10), 133.3333333, 1e-6);
assert.deepEqual(st.e1rm(100, 1), { lo: 100, hi: 100, mid: 100 });
assert.equal(st.e1rm(100, 11), null); assert.equal(st.e1rm(0, 5), null);
assert.equal(new Set(LIBRARY.map(e => e.id)).size, LIBRARY.length, 'duplicate library ids');
console.log('library size', LIBRARY.length);

// hand-built log
const now = Date.UTC(2026, 10, 14, 12);
S.exercises = LIBRARY.map(e => ({ ...e }));
const B = 'lib-bench-press', P = 'lib-pull-up';
const day = n => now - n * DAY;
S.measurements = [{ id: 'a', date: '2026-01-01', kg: 80 }];
S.workouts = [
  { id: 'w1', name: 'A', start: day(30), end: day(30) + 36e5, exercises: [{ exId: B, sets: [{ t: 'w', kg: 60, reps: 5 }, { t: 'n', kg: 100, reps: 5 }, { t: 'n', kg: 100, reps: 4 }] }, { exId: P, sets: [{ t: 'n', reps: 8 }] }] },
  { id: 'w2', name: 'B', start: day(20), end: day(20) + 36e5, exercises: [{ exId: B, sets: [{ t: 'n', kg: 102.5, reps: 5 }, { t: 'n', kg: 90, reps: 12 }] }, { exId: P, sets: [{ t: 'n', kg: 10, reps: 5 }] }] },
  { id: 'w3', name: 'C', start: day(5), end: day(5) + 36e5, exercises: [{ exId: B, sets: [{ t: 'n', kg: 100, reps: 5 }] }] },
];
rev.n++;
const ix = st.idx();
const bs = st.sessionsOf(B);
assert.equal(bs.length, 3);
assert.equal(bs[0].sets.length, 2, 'warm-up excluded');
near(bs[0].vol, 900); near(bs[0].rm.mid, (116.6666667 + 112.5) / 2, 1e-6);
assert.equal(bs[0].prs.size, 0, 'no PRs in the first session');
// second session: 102.5x5 beats 1RM and weight; 90x12 = 1080 beats set volume 500
assert.deepEqual(bs[1].prs.get(0), ['rm', 'wt']); assert.deepEqual(bs[1].prs.get(1), ['vol']);
assert.equal(bs[2].prs.size, 0);
assert.equal(st.workoutStats(S.workouts[1]).prs, 3 + 2); // + pull-up: rm, wt
// pull-up uses body weight
const ps = st.sessionsOf(P);
assert.equal(bwAt(day(30)), 80);
near(ps[0].sets[0].load, 80); near(ps[1].sets[0].load, 90); near(ps[1].vol, 450);
near(ps[1].rm.mid, (st.epley(90, 5) + st.brzycki(90, 5)) / 2);
assert.deepEqual(ps[1].prs.get(0), ['rm', 'wt']);
// records and rep maxes
const r = st.records(B);
near(r.top.v, 102.5); assert.equal(r.top.set.reps, 5); near(r.setVol.v, 1080); near(r.sessVol.v, 102.5 * 5 + 1080);
const rb = st.repBest(B);
near(rb[1].ext, 102.5); near(rb[5].ext, 102.5); near(rb[6].ext, 90); near(rb[12].ext, 90);
// prev sets
assert.equal(st.prevSets(B, now, null).length, 1); assert.equal(st.prevSets(B, day(10), null).length, 2);
assert.equal(st.prevSets(B, now, 'w3').length, 2);
// trend: perfectly linear +3 kg / 30.4375 d
const tr = st.trend([0, 10, 20, 30.4375].map(d => ({ x: now + d * DAY, y: 100 + 3 * d / 30.4375 })));
near(tr.perMonth, 3, 1e-9); near(tr.pct, 3, 1e-9);
assert.equal(st.trend([{ x: 0, y: 1 }, { x: 1, y: 2 }]), null);
// live PRs against history
const live = st.livePRs(S.exercises.find(e => e.id === B), [{ t: 'n', kg: 105, reps: 5, done: true }, { t: 'n', kg: 110, reps: 3, done: false }], 80);
assert.deepEqual(live.get(0), ['rm', 'wt']);
assert.equal(st.streakWeeks(now) >= 0, true);

// demo data sanity
const demo = makeDemo(now);
S.workouts = demo.data.workouts; S.measurements = demo.data.measurements; rev.n++;
S.workouts.sort((a, b) => a.start - b.start);
const bench = st.sessionsOf(B), pull = st.sessionsOf(P);
console.log('demo workouts', S.workouts.length, 'bench sessions', bench.length, 'pull-up sessions', pull.length);
console.log('bench e1RM first/last', bench[0].rm.mid.toFixed(1), bench.at(-1).rm.mid.toFixed(1));
console.log('pull-up first/last', JSON.stringify(pull[0].w.exercises[pull[0].ei].sets), JSON.stringify(pull.at(-1).w.exercises[pull.at(-1).ei].sets), 'bw', pull.at(-1).bw);
console.log('dip last', JSON.stringify(st.sessionsOf('lib-dip').at(-1).w.exercises.find(e => e.exId === 'lib-dip').sets));
for (const w of S.workouts) for (const we of w.exercises) { assert.ok(S.exercises.find(e => e.id === we.exId), 'unknown ' + we.exId); for (const s of we.sets) assert.ok(s.reps == null || s.reps >= 1); }
const b = st.bins(now - 91 * DAY, now, 'week'); console.log('weekly bins', b.map(x => x.n).join(' '));
console.log('streak', st.streakWeeks(now), 'PR total', [...st.idx().wstats.values()].reduce((a, x) => a + x.prs, 0));
console.log('OK');
