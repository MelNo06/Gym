// Workout tab: start a session and manage routines.
import { h, icon, uid, fmtDate, fmtClock } from '../util.js';
import { S, save, exById } from '../store.js';
import { actionSheet, confirmBox, toast, empty } from '../ui.js';
import { startWorkout, resumeWorkout, editRoutine } from './editor.js';
import { colorParts, mixBar } from './common.js';

export function workoutTab(rerender) {
  const a = S.active;
  const routineCard = r => {
    const names = r.exercises.map(we => exById(we.exId)?.name).filter(Boolean);
    const menu = e => {
      e.stopPropagation();
      actionSheet(r.name, [
        { label: 'Edit routine', onClick: () => editRoutine(r) },
        { label: 'Duplicate', onClick: () => { S.routines.push({ ...JSON.parse(JSON.stringify(r)), id: uid(), name: r.name + ' copy' }); save('routines'); rerender(); } },
        {
          label: 'Delete routine', danger: true, onClick: async () => {
            if (!await confirmBox({ title: `Delete “${r.name}”?`, text: 'Workouts you already logged with it are kept.', ok: 'Delete routine', danger: true })) return;
            S.routines.splice(S.routines.indexOf(r), 1); save('routines'); rerender(); toast('Routine deleted');
          },
        },
      ]);
    };
    return h('section', { class: 'card routine' },
      mixBar(colorParts(r.exercises, we => Math.max(1, we.sets.length))),
      h('div', { class: 'card-head' }, h('b', null, r.name), h('button', { class: 'icon-btn', 'aria-label': 'Routine options', onclick: menu }, icon('more'))),
      h('p', { class: 'routine-ex' }, names.join(', ') || 'No exercises'),
      h('button', { class: 'btn btn-soft', onclick: () => startWorkout({ name: r.name, exercises: r.exercises, routineId: r.id }) }, 'Start routine'));
  };
  return [
    h('div', { class: 'tab-head' }, h('h1', null, 'Workout'), h('span', { class: 'muted' }, fmtDate(Date.now(), { weekday: true }))),
    a
      ? h('section', { class: 'card running' },
        h('div', null, h('span', { class: 'muted' }, 'Workout in progress'), h('b', null, a.name || 'Workout')),
        h('div', { class: 'running-time', 'data-elapsed': '' }, fmtClock((Date.now() - a.start) / 1000)),
        h('button', { class: 'btn btn-primary', onclick: resumeWorkout }, 'Continue workout'))
      : h('button', { class: 'btn btn-primary btn-big', onclick: () => startWorkout() }, icon('plus', 20), 'Start empty workout'),
    h('div', { class: 'section-head' }, h('h2', null, 'Routines'),
      h('button', { class: 'btn-pill ghost', onclick: () => editRoutine(null) }, icon('plus', 16), 'New routine')),
    S.routines.length ? S.routines.map(routineCard)
      : empty('No routines yet', 'A routine is a saved list of exercises and sets. Build one here, or finish a workout and save it as a routine.'),
  ];
}
