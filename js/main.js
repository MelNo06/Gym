// Boot, tab bar, screen wake lock and app updates.
import { h, icon, fmtClock } from './util.js';
import { S, init, flush } from './store.js';
import { setTabRenderer, toast, topPage } from './ui.js';
import { workoutTab } from './views/workout.js';
import { historyTab } from './views/history.js';
import { progressTab, exercisesTab } from './views/progress.js';
import { meTab } from './views/me.js';
import { resumeWorkout } from './views/editor.js';

const TABS = [
  ['workout', 'Workout', 'lift', workoutTab],
  ['history', 'History', 'cal', historyTab],
  ['progress', 'Progress', 'chart', progressTab],
  ['exercises', 'Exercises', 'list', exercisesTab],
  ['me', 'Me', 'me', meTab],
];
let tab = 'workout';
const view = document.getElementById('view'), bar = document.getElementById('tabbar'), mini = document.getElementById('mini');

function render() {
  const t = TABS.find(x => x[0] === tab);
  view.replaceChildren(...[t[3](render)].flat(Infinity).filter(Boolean));
  bar.replaceChildren(...TABS.map(([id, label, ic]) =>
    h('button', { class: id === tab ? 'on' : '', 'aria-current': id === tab ? 'page' : null, onclick: () => { if (tab !== id) { tab = id; render(); view.scrollTop = 0; } else view.scrollTo({ top: 0, behavior: 'smooth' }); } },
      icon(ic, 24), h('span', null, label))));
  // Running-workout bar on every tab except the Workout tab, which shows its own card.
  const a = S.active;
  mini.hidden = !a || tab === 'workout';
  if (!mini.hidden) mini.replaceChildren(
    h('span', { class: 'mini-dot' }), h('span', { class: 'mini-name' }, a.name || 'Workout'),
    h('b', { 'data-elapsed': '' }, fmtClock((Date.now() - a.start) / 1000)), h('span', { class: 'mini-go' }, 'Continue'));
  syncWake();
}
mini.addEventListener('click', resumeWorkout);
setInterval(() => {
  if (!S.active) return;
  const txt = fmtClock((Date.now() - S.active.start) / 1000);
  document.querySelectorAll('[data-elapsed]').forEach(el => { el.textContent = txt; });
}, 1000);

// ---- keep the screen on while a workout is running ----
let lock = null;
async function syncWake() {
  const want = !!S.active && S.settings.wake !== false && document.visibilityState === 'visible';
  if (want && !lock && navigator.wakeLock) {
    try { lock = await navigator.wakeLock.request('screen'); lock.addEventListener('release', () => { lock = null; }); } catch { /* not allowed right now */ }
  } else if (!want && lock) { lock.release().catch(() => {}); lock = null; }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') flush();
  else { syncWake(); navigator.serviceWorker?.getRegistration().then(r => r?.update()).catch(() => {}); }
});
window.addEventListener('pagehide', flush);

// ---- offline support and updates ----
const boot = Date.now();
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  let had = !!navigator.serviceWorker?.controller;
  navigator.serviceWorker?.register('sw.js').catch(e => console.warn('service worker', e));
  navigator.serviceWorker?.addEventListener('controllerchange', () => {
    if (!had) { had = true; return; }
    // A new version took over. Reload right away only if nothing is in progress.
    if (!S.active && !topPage() && Date.now() - boot < 15000) location.reload();
    else toast('Update installed. It is used the next time you open the app.', 4000);
  });
}

// Keep sheets and page bottoms above the on-screen keyboard.
if (window.visualViewport) {
  const vv = window.visualViewport;
  const kb = () => document.documentElement.style.setProperty('--kb', Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)) + 'px');
  vv.addEventListener('resize', kb); vv.addEventListener('scroll', kb);
}

// ---- start ----
history.replaceState({ depth: 0 }, '');
setTabRenderer(render);
init().then(() => {
  document.body.classList.remove('loading');
  render();
  // Come back to a workout that was running when the app was closed.
  if (S.active && Date.now() - S.active.start < 12 * 36e5) resumeWorkout();
}).catch(e => {
  console.error(e);
  view.replaceChildren(h('div', { class: 'empty' }, h('div', { class: 'empty-title' }, 'The app could not start'), h('p', null, String(e?.message || e))));
});
