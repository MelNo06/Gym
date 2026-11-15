// Exercise picker (used while logging) and the create / edit exercise form.
import { h, icon, uid } from '../util.js';
import { S, save, TYPES, EQUIP, groupById } from '../store.js';
import { shade } from '../colors.js';
import { exDot } from './common.js';
import { sessionsOf } from '../stats.js';
import { pushPage, back, toast, confirmBox, field, select, chip, cap } from '../ui.js';

export const visibleExercises = () => S.exercises.filter(e => !e.archived);
export function matches(ex, q) {
  const name = ex.name.toLowerCase();
  return q.toLowerCase().split(/\s+/).filter(Boolean).every(t => name.includes(t));
}
export const exSub = ex => [groupById(ex.group)?.name, ex.equip && cap(ex.equip)].filter(Boolean).join(', ');
/** Does an exercise pass the group filter? '' = all, '-' = exercises without a group. */
export const inGroup = (ex, f) => !f || (f === '-' ? !groupById(ex.group) : ex.group === f);

/** Chips for filtering by muscle group. */
export function muscleChips(current, onChange) {
  const all = visibleExercises(), used = new Set(all.map(e => e.group));
  return h('div', { class: 'chips' }, chip('All', !current, () => onChange('')),
    S.groups.filter(g => used.has(g.id)).map(g => h('button', { class: 'chip' + (current === g.id ? ' on' : ''), onclick: () => onChange(g.id) },
      h('i', { class: 'ex-dot', style: { background: shade(g.color) } }), g.name)),
    all.some(e => !groupById(e.group)) ? chip('No group', current === '-', () => onChange('-')) : null);
}

export function openPicker({ multi, onPick }) {
  let q = '', muscle = '', chosen = [];
  let listEl, footBtn, chipsEl;
  const done = async ids => { await back(); onPick(ids); };

  const item = ex => {
    const n = sessionsOf(ex.id).length, on = chosen.includes(ex.id);
    return h('button', {
      class: 'list-row' + (on ? ' on' : ''), onclick: () => {
        if (!multi) return done([ex.id]);
        on ? chosen.splice(chosen.indexOf(ex.id), 1) : chosen.push(ex.id);
        paint();
      },
    },
      exDot(ex),
      h('span', { class: 'row-main' }, h('b', null, ex.name), h('small', null, exSub(ex) + (n ? ` · ${n} session${n > 1 ? 's' : ''}` : ''))),
      multi ? h('span', { class: 'pick' + (on ? ' on' : '') }, on ? icon('check', 16) : null) : null);
  };
  function paint() {
    const all = visibleExercises().filter(e => inGroup(e, muscle) && matches(e, q));
    const kids = [];
    if (q.trim()) kids.push(h('button', { class: 'list-row create', onclick: () => openExerciseForm(null, { name: q.trim(), onSaved: ex => { if (multi) { chosen.push(ex.id); q = ''; page.render(); } else done([ex.id]); } }) },
      icon('plus', 18), h('span', { class: 'row-main' }, h('b', null, `Create “${q.trim()}”`), h('small', null, 'New exercise'))));
    if (!q.trim() && !muscle) {
      const recent = all.filter(e => sessionsOf(e.id).length).sort((a, b) => sessionsOf(b.id).at(-1).t - sessionsOf(a.id).at(-1).t).slice(0, 8);
      if (recent.length) kids.push(h('div', { class: 'list-label' }, 'Recently trained'), recent.map(item), h('div', { class: 'list-label' }, 'All exercises'));
    }
    kids.push(all.map(item));
    if (!all.length && !q.trim()) kids.push(h('p', { class: 'hint center' }, 'No exercises in this group.'));
    listEl.replaceChildren(...kids.flat());
    chipsEl.replaceWith(chipsEl = muscleChips(muscle, m => { muscle = m; paint(); }));
    if (footBtn) { footBtn.hidden = !chosen.length; footBtn.textContent = `Add ${chosen.length} exercise${chosen.length === 1 ? '' : 's'}`; }
  }

  const page = pushPage(() => {
    listEl = h('div', { class: 'list' });
    chipsEl = h('div');
    footBtn = multi ? h('button', { class: 'btn btn-primary', hidden: true, onclick: () => done(chosen) }) : null;
    const search = h('label', { class: 'search' }, icon('search', 18),
      h('input', { type: 'search', placeholder: 'Search exercises', value: q, autocomplete: 'off', autocapitalize: 'off', 'aria-label': 'Search exercises', oninput: e => { q = e.target.value; paint(); } }));
    requestAnimationFrame(paint);
    return {
      title: multi ? 'Add exercises' : 'Choose exercise', backIcon: 'close',
      actions: h('button', { class: 'btn-pill ghost', onclick: () => openExerciseForm(null, { name: q.trim(), onSaved: ex => { if (multi) { chosen.push(ex.id); page.render(); } else done([ex.id]); } }) }, 'New'),
      body: [h('div', { class: 'sticky-top' }, search, chipsEl), listEl],
      foot: footBtn,
    };
  }, { manual: true, up: true });
}

const TYPE_HELP = {
  weight: 'Bar, dumbbell or machine weight times reps.',
  wbw: 'Pull-ups, dips and the like. Your body weight counts as load; added weight is optional.',
  abw: 'Assisted machine or band. The assistance is subtracted from your body weight.',
  bw: 'Reps only, for example leg raises.',
  time: 'Held or timed sets, for example planks.',
  dist: 'Distance and time, for example running.',
};

export function openExerciseForm(ex, { name = '', onSaved } = {}) {
  const isNew = !ex, used = !!ex && sessionsOf(ex.id).length > 0;
  const d = ex ? { ...ex } : { id: 'x-' + uid(), name, type: 'weight', equip: 'barbell', group: null, notes: '', builtin: false };
  const page = pushPage(() => {
    const help = h('span', { class: 'field-hint' }, used ? 'The type cannot change once sets are logged.' : TYPE_HELP[d.type]);
    const nameIn = h('input', { type: 'text', value: d.name, placeholder: 'e.g. Pull-Up (wide grip)', autocapitalize: 'words', oninput: e => { d.name = e.target.value; } });
    const typeSel = select(Object.entries(TYPES), d.type, { disabled: used, onchange: e => { d.type = e.target.value; help.textContent = TYPE_HELP[d.type]; } });
    const save_ = async () => {
      d.name = d.name.trim();
      if (!d.name) { toast('Give the exercise a name.'); nameIn.focus(); return; }
      if (S.exercises.some(e => e.id !== d.id && !e.archived && e.name.toLowerCase() === d.name.toLowerCase())) { toast('An exercise with this name already exists.'); return; }
      const i = S.exercises.findIndex(e => e.id === d.id);
      i >= 0 ? (S.exercises[i] = d) : S.exercises.push(d);
      save('exercises');
      await back();
      onSaved?.(d);
    };
    const remove = async () => {
      const ok = await confirmBox({
        title: `Delete “${d.name}”?`, danger: true, ok: 'Delete exercise',
        text: used ? 'It disappears from the exercise list. Workouts where you logged it keep their sets.' : null,
      });
      if (!ok) return;
      const i = S.exercises.findIndex(e => e.id === d.id);
      if (used) S.exercises[i] = { ...S.exercises[i], archived: true };
      else {
        S.exercises.splice(i, 1);
        if (d.builtin) { S.meta.removedBuiltin = [...(S.meta.removedBuiltin || []), d.id]; save('meta'); }
      }
      for (const r of S.routines) r.exercises = r.exercises.filter(we => we.exId !== d.id);
      save('exercises', 'routines');
      await back(2);
      toast('Exercise deleted');
    };
    return {
      title: isNew ? 'New exercise' : 'Edit exercise', backIcon: 'close',
      actions: h('button', { class: 'btn-pill', onclick: save_ }, 'Save'),
      body: h('div', { class: 'form' },
        field('Name', nameIn),
        h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'How it is logged'), typeSel, help),
        h('div', { class: 'grid-2' },
          field('Equipment', select(EQUIP.map(e => [e, cap(e)]), d.equip || 'other', { onchange: e => { d.equip = e.target.value; } })),
          field('Muscle group', select([['', 'None'], ...S.groups.map(g => [g.id, g.name])], groupById(d.group) ? d.group : '', { onchange: e => { d.group = e.target.value || null; } }))),
        field('Notes', h('textarea', { rows: 3, value: d.notes || '', placeholder: 'Machine settings, grip width, cues…', oninput: e => { d.notes = e.target.value; } }),
          'Shown on the card every time you log this exercise.'),
        isNew ? null : h('button', { class: 'btn btn-ghost danger', onclick: remove }, 'Delete exercise')),
    };
  }, { manual: true, up: true });
}
