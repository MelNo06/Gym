// The set-logging screen. One component, three modes:
//   active  - the workout running right now (auto-saved after every change)
//   edit    - changing or back-filling a saved workout
//   routine - building a routine (no tick column, values are targets)
import { h, icon, uid, num, parseNum, fmtClock, big, dayKey, parseDay, pad } from '../util.js';
import { S, save, flush, exById, bwAt, isBW, SET_TYPES } from '../store.js';
import { livePRs, liveStats, prevSets, setShort, PR_LABEL } from '../stats.js';
import { pushPage, back, sheet, actionSheet, confirmBox, toast, refresh, field, topPage } from '../ui.js';
import { openPicker } from './picker.js';
import { openExercise } from './exercise.js';
import { openWorkout } from './history.js';

const FIELDS = {
  weight: [['kg', 'kg', 'decimal'], ['reps', 'Reps', 'numeric']],
  wbw: [['kg', '+ kg', 'decimal'], ['reps', 'Reps', 'numeric']],
  abw: [['kg', '− kg', 'decimal'], ['reps', 'Reps', 'numeric']],
  bw: [['reps', 'Reps', 'numeric']],
  time: [['min', 'Min', 'numeric'], ['s', 'Sec', 'numeric']],
  dist: [['km', 'km', 'decimal'], ['min', 'Min', 'decimal']],
};
const getField = (ex, set, f) =>
  f === 'min' ? (set.sec == null ? null : ex.type === 'dist' ? +(set.sec / 60).toFixed(2) : Math.floor(set.sec / 60))
    : f === 's' ? (set.sec == null ? null : set.sec % 60) : set[f] ?? null;

function readRow(ex, set, rowEl) {
  const v = {};
  rowEl.querySelectorAll('input[data-f]').forEach(inp => { v[inp.dataset.f] = parseNum(inp.value); });
  if (ex.type === 'time') set.sec = v.min == null && v.s == null ? null : Math.round(Math.abs(v.min || 0) * 60 + Math.abs(v.s || 0));
  else if (ex.type === 'dist') { set.km = v.km == null ? null : Math.abs(v.km); set.sec = v.min == null ? null : Math.round(Math.abs(v.min) * 60); }
  else {
    if ('kg' in v) set.kg = v.kg == null ? null : Math.abs(v.kg);
    set.reps = v.reps == null ? null : Math.round(Math.abs(v.reps));
  }
}
const valid = (ex, set) =>
  ex.type === 'time' ? set.sec > 0 : ex.type === 'dist' ? set.km > 0 : set.reps >= 1 && (ex.type !== 'weight' || set.kg != null);
const hasValue = s => s.reps != null || s.sec != null || s.km != null || s.kg != null;
const clean = s => {
  const o = { t: s.t || 'n' };
  for (const k of ['kg', 'reps', 'sec', 'km']) if (s[k] != null) o[k] = s[k];
  return o;
};
export const defaultName = (ms = Date.now()) => {
  const hr = new Date(ms).getHours();
  return (hr < 5 ? 'Night' : hr < 12 ? 'Morning' : hr < 17 ? 'Afternoon' : 'Evening') + ' workout';
};

let activePage = null;

/** Start a workout, optionally from a routine or an earlier workout ({name, exercises, id}). */
export async function startWorkout(from) {
  if (S.active) {
    const ok = await confirmBox({ title: 'A workout is already running', text: 'Starting a new one discards the workout in progress.', ok: 'Discard and start new', cancel: 'Keep current workout', danger: true });
    if (!ok) return;
  }
  S.active = {
    id: uid(), name: from ? from.name : defaultName(), start: Date.now(), notes: '', routineId: from?.routineId || null,
    exercises: from ? from.exercises.filter(we => exById(we.exId)).map(we => ({
      exId: we.exId, notes: '', sets: (we.sets.length ? we.sets : [{ t: 'n' }]).map(s => ({ t: s.t || 'n', done: false, h: clean(s) })),
    })) : [],
  };
  save('active'); flush(); refresh();
  resumeWorkout();
}
export function resumeWorkout() {
  if (!S.active || (activePage && topPage() === activePage)) return;
  openEditor(S.active, 'active');
}

/** opts: { isNew } for edit/routine mode */
export function openEditor(draft, mode, opts = {}) {
  const live = mode === 'active', routine = mode === 'routine';
  const bw = routine ? null : bwAt(draft.start);
  let dirty = false, durEl = null, volEl = null, setsEl = null, cardsEl = null, timer = 0;

  const stats = () => {
    if (!live) return;
    const st = liveStats(draft, bw);
    if (volEl) volEl.textContent = big(st.vol) + ' kg';
    if (setsEl) setsEl.textContent = st.sets;
  };
  const touch = () => {
    if (live) { save('active'); stats(); }
    else if (!dirty) {
      dirty = true;
      page.guard = () => confirmBox({ title: 'Discard your changes?', ok: 'Discard', cancel: 'Keep editing', danger: true });
    }
  };

  // ---- one set row ----
  function hints(ex, we, si, prev) {
    const set = we.sets[si], warm = set.t === 'w';
    let prevSet = null;
    if (prev) {
      const k = we.sets.slice(0, si).filter(x => (x.t === 'w') === warm).length;
      prevSet = prev.filter(x => (x.t === 'w') === warm)[k] || null;
    }
    let hint = prevSet || (set.h && hasValue(set.h) ? set.h : null);
    for (let j = si - 1; !hint && j >= 0; j--) if (hasValue(we.sets[j])) hint = we.sets[j];
    if (!hint && prev) hint = prev.filter(x => x.t !== 'w').at(-1) || null;
    return { prevSet, hint };
  }

  function row(ex, we, si, prev, cardEl) {
    const set = we.sets[si];
    const { prevSet, hint } = hints(ex, we, si, prev);
    const label = set.t === 'n' || !set.t ? String(we.sets.slice(0, si + 1).filter(x => x.t !== 'w').length) : set.t.toUpperCase();
    const el = h('div', { class: `set-row t-${set.t || 'n'}${set.done ? ' done' : ''}`, 'data-i': si });
    const inputs = FIELDS[ex.type].map(([f, lab, mode]) => {
      const v = getField(ex, set, f), hv = hint ? getField(ex, hint, f) : null;
      return h('input', {
        class: 'cell-in', type: 'text', inputmode: mode, 'data-f': f, autocomplete: 'off', enterkeyhint: 'done', 'aria-label': lab,
        value: v == null ? '' : num(v), placeholder: hv == null ? '' : num(hv),
        onfocus: e => setTimeout(() => { try { e.target.setSelectionRange(0, 99); } catch { /* not selectable */ } }, 0),
        oninput: () => {
          readRow(ex, set, el);
          if (set.done && !valid(ex, set)) { set.done = false; el.classList.remove('done'); }
          touch();
          if (live && set.done) paintPRs(cardEl, we, ex);
        },
      });
    });
    const fill = () => {
      if (!prevSet || set.done) return;
      inputs.forEach(inp => { const pv = getField(ex, prevSet, inp.dataset.f); inp.value = pv == null ? '' : num(pv); });
      readRow(ex, set, el); touch();
    };
    const toggle = () => {
      if (!set.done) {
        inputs.forEach(inp => { if (inp.value.trim() === '' && inp.placeholder) inp.value = inp.placeholder; });
        readRow(ex, set, el);
        if (!valid(ex, set)) {
          el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake');
          (inputs.find(i => i.value.trim() === '') || inputs[0]).focus();
          return;
        }
        set.done = true;
      } else set.done = false;
      el.classList.toggle('done', set.done);
      check.setAttribute('aria-pressed', String(set.done));
      touch();
      if (live) paintPRs(cardEl, we, ex);
    };
    const check = routine ? null : h('button', { class: 'set-check', 'aria-label': 'Set done', 'aria-pressed': String(!!set.done), onclick: toggle }, icon('check', 18));
    el.append(...[
      h('button', { class: 'set-no', 'aria-label': 'Set type', onclick: () => setMenu(we, si, cardEl) }, label),
      routine ? h('span', { class: 'set-prev' }) : h('button', { class: 'set-prev', onclick: fill, 'aria-label': 'Use previous values' }, prevSet ? setShort(ex, prevSet) : '–'),
      ...inputs, check].filter(Boolean));
    return el;
  }

  function paintPRs(cardEl, we, ex) {
    cardEl.querySelectorAll('.pr-line').forEach(n => n.remove());
    for (const [i, cats] of livePRs(ex, we.sets, bw)) {
      const rowEl = cardEl.querySelector(`.set-row[data-i="${i}"]`);
      rowEl?.after(h('div', { class: 'pr-line' }, cats.map(c => h('span', { class: 'pr' }, icon('trophy', 13), PR_LABEL[c] + ' record'))));
    }
  }

  function setMenu(we, si, cardEl) {
    const set = we.sets[si], ei = draft.exercises.indexOf(we);
    actionSheet('Set ' + (si + 1), [
      ...Object.entries(SET_TYPES).map(([t, label]) => ({
        label, on: (set.t || 'n') === t,
        hint: t === 'w' ? 'Not counted in volume, records or 1RM' : null,
        onClick: () => { set.t = t; touch(); rerender(ei); },
      })),
      { label: 'Delete set', danger: true, onClick: () => { we.sets.splice(si, 1); touch(); rerender(ei); } },
    ]);
  }

  // ---- one exercise card ----
  function card(we, ei) {
    const ex = exById(we.exId);
    if (!ex) return h('section', { class: 'ex-card' }, h('div', { class: 'ex-head' }, h('span', { class: 'muted' }, 'Deleted exercise'),
      h('button', { class: 'btn-text danger', onclick: () => { draft.exercises.splice(ei, 1); touch(); page.render(); } }, 'Remove')));
    const prev = routine ? null : prevSets(ex.id, draft.start, draft.id);
    const rowsEl = h('div', { class: 'set-rows' });
    const el = h('section', { class: 'ex-card' + (routine ? ' no-check' : ''), style: { '--n': FIELDS[ex.type].length } },
      h('div', { class: 'ex-head' },
        h('button', { class: 'ex-name', onclick: () => openExercise(ex.id) }, ex.name),
        h('button', { class: 'icon-btn', 'aria-label': 'Exercise options', onclick: () => exMenu(we, ei) }, icon('more'))),
      ex.notes ? h('div', { class: 'ex-pinned' }, ex.notes) : null,
      !routine && bw == null && isBW(ex) ? h('div', { class: 'ex-pinned' }, 'Log your body weight under Me so the volume and 1RM of this exercise include it.') : null,
      h('input', { class: 'ex-note', type: 'text', placeholder: live ? 'Add a note for today' : 'Note', value: we.notes || '', oninput: e => { we.notes = e.target.value; touch(); } }),
      h('div', { class: 'set-head' },
        h('span', null, 'Set'), h('span', null, routine ? '' : 'Previous'),
        FIELDS[ex.type].map(([, lab]) => h('span', { class: 'c' }, lab)),
        routine ? null : h('span', { class: 'c' }, icon('check', 14))),
      rowsEl,
      h('button', { class: 'btn btn-soft', onclick: () => { we.sets.push({ t: 'n', done: false }); touch(); rerender(ei); } }, icon('plus', 16), 'Add set'));
    we.sets.forEach((_, si) => rowsEl.append(row(ex, we, si, prev, el)));
    if (live) paintPRs(el, we, ex);
    return el;
  }
  function rerender(ei) {
    const old = cardsEl.children[ei], fresh = card(draft.exercises[ei], ei);
    old ? old.replaceWith(fresh) : cardsEl.append(fresh);
    stats();
  }
  function exMenu(we, ei) {
    const move = d => { draft.exercises.splice(ei, 1); draft.exercises.splice(ei + d, 0, we); touch(); page.render(); };
    actionSheet(exById(we.exId)?.name || 'Exercise', [
      ei > 0 && { label: 'Move up', onClick: () => move(-1) },
      ei < draft.exercises.length - 1 && { label: 'Move down', onClick: () => move(1) },
      { label: 'Replace exercise', onClick: () => openPicker({ multi: false, onPick: ([id]) => { we.exId = id; we.sets.forEach(s => { delete s.h; }); touch(); page.render(); } }) },
      { label: 'Remove exercise', danger: true, onClick: () => { draft.exercises.splice(ei, 1); touch(); page.render(); } },
    ]);
  }
  function addExercises(ids) {
    for (const id of ids) {
      const prev = routine ? null : prevSets(id, draft.start, draft.id);
      const sets = prev ? prev.slice(0, 8).map(s => ({ t: s.t || 'n', done: false })) : Array.from({ length: routine ? 3 : 1 }, () => ({ t: 'n', done: false }));
      draft.exercises.push({ exId: id, notes: '', sets });
    }
    touch(); page.render();
    requestAnimationFrame(() => cardsEl.lastElementChild?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }

  // ---- saving ----
  const doneExercises = () => draft.exercises
    .map(we => ({ exId: we.exId, notes: (we.notes || '').trim(), sets: we.sets.filter(s => s.done).map(clean) }))
    .filter(we => we.sets.length && exById(we.exId));

  async function finish() {
    document.activeElement?.blur?.();
    let done = 0, open = 0;
    draft.exercises.forEach(we => we.sets.forEach(s => (s.done ? done++ : open++)));
    if (!done) { toast('Tick at least one set before you finish.'); return; }
    if (open) {
      const ok = await confirmBox({ title: `${open} set${open > 1 ? 's are' : ' is'} not ticked`, text: 'Sets without a tick are not saved.', ok: 'Finish anyway', cancel: 'Keep logging' });
      if (!ok) return;
    }
    const st = liveStats(draft, bw);
    let prs = 0;
    draft.exercises.forEach(we => { const ex = exById(we.exId); if (ex) for (const c of livePRs(ex, we.sets, bw).values()) prs += c.length; });
    const rt = draft.routineId && S.routines.find(r => r.id === draft.routineId);
    const nameIn = h('input', { type: 'text', value: draft.name || defaultName(draft.start) });
    const minIn = h('input', { type: 'text', inputmode: 'numeric', value: Math.max(1, Math.round((Date.now() - draft.start) / 60000)) });
    const notesIn = h('textarea', { rows: 2, placeholder: 'How did it go?', value: draft.notes || '' });
    const upd = rt ? h('input', { type: 'checkbox' }) : null;
    sheet(close => [
      h('div', { class: 'tiles tiles-3' },
        tile('Volume', big(st.vol) + ' kg'), tile('Sets', st.sets), tile('Records', prs, prs ? 'gold' : '')),
      field('Name', nameIn), field('Duration in minutes', minIn), field('Notes', notesIn),
      rt ? h('label', { class: 'check-row' }, upd, h('span', null, `Update the routine “${rt.name}” to match this workout`)) : null,
      h('button', {
        class: 'btn btn-primary', onclick: async () => {
          const mins = Math.max(1, Math.round(parseNum(minIn.value) || 1));
          const w = { id: draft.id, name: nameIn.value.trim() || defaultName(draft.start), start: draft.start, end: draft.start + mins * 60000, notes: notesIn.value.trim(), routineId: draft.routineId || null, exercises: doneExercises() };
          S.workouts.push(w);
          if (upd?.checked) { rt.exercises = w.exercises.map(we => ({ exId: we.exId, notes: '', sets: we.sets.map(clean) })); save('routines'); }
          S.active = null;
          save('workouts', 'active'); flush();
          close(); await back(); openWorkout(w.id); toast('Workout saved');
        },
      }, 'Save workout'),
    ], { title: 'Finish workout' });
  }

  async function saveEdit(dateIn, timeIn, minIn) {
    document.activeElement?.blur?.();
    const exercises = doneExercises();
    if (!exercises.length) { toast('Tick at least one set to save this workout.'); return; }
    const [hh, mm] = (timeIn.value || '12:00').split(':').map(Number);
    const start = parseDay(dateIn.value || dayKey(draft.start)) + (hh * 60 + mm) * 60000;
    const mins = Math.max(1, Math.round(parseNum(minIn.value) || 1));
    const w = { id: draft.id, name: (draft.name || '').trim() || defaultName(start), start, end: start + mins * 60000, notes: (draft.notes || '').trim(), routineId: draft.routineId || null, exercises };
    const i = S.workouts.findIndex(x => x.id === w.id);
    i >= 0 ? (S.workouts[i] = w) : S.workouts.push(w);
    save('workouts');
    page.guard = null; await back(); toast('Workout saved');
  }
  async function saveRoutine() {
    const r = { id: draft.id, name: (draft.name || '').trim() || 'Routine', notes: '', exercises: draft.exercises.filter(we => exById(we.exId)).map(we => ({ exId: we.exId, notes: (we.notes || '').trim(), sets: we.sets.map(clean) })) };
    if (!r.exercises.length) { toast('Add at least one exercise.'); return; }
    const i = S.routines.findIndex(x => x.id === r.id);
    i >= 0 ? (S.routines[i] = r) : S.routines.push(r);
    save('routines');
    page.guard = null; await back(); toast('Routine saved');
  }
  async function discard() {
    const ok = await confirmBox({ title: 'Discard this workout?', text: 'Everything logged in it is lost.', ok: 'Discard workout', cancel: 'Keep going', danger: true });
    if (!ok) return;
    S.active = null; save('active'); flush();
    await back(); toast('Workout discarded');
  }

  // ---- page ----
  const page = pushPage(() => {
    cardsEl = h('div', { class: 'cards' }, draft.exercises.map(card));
    const nameIn = h('input', { class: 'title-in', type: 'text', value: draft.name || '', placeholder: routine ? 'Routine name' : 'Workout name', 'aria-label': 'Name', oninput: e => { draft.name = e.target.value; touch(); } });
    let meta, dateIn, timeIn, minIn;
    if (live) {
      durEl = h('b'); volEl = h('b'); setsEl = h('b');
      meta = h('div', { class: 'live-stats' },
        h('div', null, h('span', null, 'Duration'), durEl), h('div', null, h('span', null, 'Volume'), volEl), h('div', null, h('span', null, 'Sets'), setsEl));
      durEl.textContent = fmtClock((Date.now() - draft.start) / 1000);
    } else if (!routine) {
      const d = new Date(draft.start);
      dateIn = h('input', { type: 'date', value: dayKey(draft.start), max: dayKey(Date.now()), onchange: touch });
      timeIn = h('input', { type: 'time', value: `${pad(d.getHours())}:${pad(d.getMinutes())}`, onchange: touch });
      minIn = h('input', { type: 'text', inputmode: 'numeric', value: Math.max(1, Math.round((draft.end - draft.start) / 60000)), oninput: touch });
      meta = h('div', { class: 'grid-3' }, field('Date', dateIn), field('Start', timeIn), field('Minutes', minIn));
    }
    const body = [
      nameIn, meta,
      routine ? null : h('textarea', { class: 'notes-in', rows: 1, placeholder: 'Workout notes', value: draft.notes || '', oninput: e => { draft.notes = e.target.value; touch(); } }),
      cardsEl,
      draft.exercises.length ? null : h('p', { class: 'hint center' }, routine ? 'Add the exercises this routine is made of.' : 'Add your first exercise to start logging.'),
      h('button', { class: 'btn btn-primary', onclick: () => openPicker({ multi: true, onPick: addExercises }) }, icon('plus', 18), 'Add exercise'),
      live ? h('button', { class: 'btn btn-ghost danger', onclick: discard }, 'Discard workout') : null,
    ];
    requestAnimationFrame(stats);
    return {
      title: live ? 'Workout' : routine ? (opts.isNew ? 'New routine' : 'Edit routine') : (opts.isNew ? 'Log workout' : 'Edit workout'),
      backIcon: live ? 'down' : 'close',
      actions: h('button', { class: 'btn-pill', onclick: live ? finish : routine ? saveRoutine : () => saveEdit(dateIn, timeIn, minIn) }, live ? 'Finish' : 'Save'),
      body,
    };
  }, { manual: true, up: true });

  if (live) {
    activePage = page;
    timer = setInterval(() => { if (durEl) durEl.textContent = fmtClock((Date.now() - draft.start) / 1000); }, 1000);
  }
  page.onClose = () => { clearInterval(timer); if (activePage === page) activePage = null; flush(); };
  return page;
}

export const tile = (label, value, cls = '') => h('div', { class: 'tile ' + cls }, h('b', null, String(value)), h('span', null, label));

/** Draft for editing a saved workout, or a blank one on a given day. */
export function editWorkout(w, dayMs) {
  const draft = w
    ? { ...w, exercises: w.exercises.map(we => ({ exId: we.exId, notes: we.notes || '', sets: we.sets.map(s => ({ ...s, done: true })) })) }
    : { id: uid(), name: '', start: (dayMs ?? Date.now() - 36e5), end: (dayMs ?? Date.now() - 36e5) + 36e5, notes: '', routineId: null, exercises: [] };
  if (!w && dayMs != null) { draft.start = dayMs + 18 * 36e5; draft.end = draft.start + 36e5; }
  openEditor(draft, 'edit', { isNew: !w });
}
export function editRoutine(r) {
  const draft = r
    ? { ...r, exercises: r.exercises.map(we => ({ exId: we.exId, notes: we.notes || '', sets: we.sets.map(s => ({ ...s })) })) }
    : { id: uid(), name: '', exercises: [] };
  openEditor(draft, 'routine', { isNew: !r });
}
