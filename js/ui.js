// Navigation (tabs, stacked pages), bottom sheets, toasts and small form controls.
import { h, icon } from './util.js';

const stack = [];
let renderTab = () => {};
export const setTabRenderer = fn => { renderTab = fn; };
export const topPage = () => stack.at(-1);

/** Re-render the current tab and every open page that allows it. */
export function refresh() {
  renderTab();
  for (const p of stack) if (!p.manual) p.render();
}

/**
 * Slide a full-screen page in. build(page) returns { title, actions, body, foot, backIcon }.
 * Pages are tied to browser history so the iOS back-swipe closes them.
 */
export function pushPage(build, opts = {}) {
  const el = h('div', { class: 'page' + (opts.up ? ' up' : '') });
  const page = { el, manual: !!opts.manual, guard: null, onClose: null };
  page.render = () => {
    const keep = page.scroller ? page.scroller.scrollTop : 0;
    const v = build(page);
    page.scroller = h('div', { class: 'page-body' }, v.body);
    el.replaceChildren(...[
      h('header', { class: 'page-head' },
        h('button', { class: 'icon-btn', 'aria-label': 'Back', onclick: () => back() }, icon(v.backIcon || 'back')),
        h('div', { class: 'page-title' }, v.title || ''),
        h('div', { class: 'page-actions' }, v.actions || [])),
      page.scroller,
      v.foot ? h('div', { class: 'page-foot' }, v.foot) : null].filter(Boolean));
    page.scroller.scrollTop = keep;
  };
  page.render();
  document.getElementById('pages').append(el);
  stack.push(page);
  history.pushState({ depth: stack.length }, '');
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('in')));
  return page;
}

let waiters = [];
/** Close the top n pages. Resolves once they are gone. */
export function back(n = 1) {
  if (!stack.length) return Promise.resolve();
  return new Promise(res => { waiters.push(res); history.go(-Math.min(n, stack.length)); });
}

window.addEventListener('popstate', e => {
  closeSheets();
  const depth = e.state?.depth || 0;
  const top = stack.at(-1);
  if (top?.guard && stack.length > depth) {
    // Unsaved changes: put the history entry back and ask first.
    history.pushState({ depth: stack.length }, '');
    const g = top.guard;
    waiters = [];
    g().then(leave => { if (leave) { top.guard = null; back(); } });
    return;
  }
  while (stack.length > depth) {
    const p = stack.pop();
    p.onClose?.();
    p.el.classList.remove('in');
    setTimeout(() => p.el.remove(), 240);
  }
  refresh();
  const w = waiters; waiters = [];
  w.forEach(f => f());
});

// ---- bottom sheets ----
const sheets = [];
export function closeSheets() { while (sheets.length) sheets.pop()(); }

/** build(close) returns the sheet content. */
export function sheet(build, { title } = {}) {
  const backdrop = h('div', { class: 'sheet-back' });
  const box = h('div', { class: 'sheet', role: 'dialog', 'aria-label': title || 'Options' });
  let closed = false;
  const close = () => {
    if (closed) return; closed = true;
    const i = sheets.indexOf(close); if (i >= 0) sheets.splice(i, 1);
    backdrop.classList.remove('in'); box.classList.remove('in');
    setTimeout(() => { backdrop.remove(); box.remove(); }, 220);
  };
  backdrop.addEventListener('click', close);
  box.append(h('div', { class: 'sheet-grip' }), title ? h('div', { class: 'sheet-title' }, title) : '', h('div', { class: 'sheet-content' }, build(close)));
  document.body.append(backdrop, box);
  sheets.push(close);
  requestAnimationFrame(() => requestAnimationFrame(() => { backdrop.classList.add('in'); box.classList.add('in'); }));
  return close;
}

/** items: [{label, hint, danger, onClick}] (falsy entries are skipped) */
export function actionSheet(title, items) {
  sheet(close => items.filter(Boolean).map(it =>
    h('button', { class: 'action' + (it.danger ? ' danger' : '') + (it.on ? ' on' : ''), onclick: () => { close(); it.onClick(); } },
      h('span', null, it.label), it.hint ? h('small', null, it.hint) : null)), { title });
}

export function confirmBox({ title, text, ok = 'OK', cancel = 'Cancel', danger = false }) {
  return new Promise(res => {
    let answered = false;
    const done = v => { if (!answered) { answered = true; res(v); } };
    const close = sheet(c => [
      text ? h('p', { class: 'sheet-text' }, text) : null,
      h('button', { class: 'btn ' + (danger ? 'btn-danger' : 'btn-primary'), onclick: () => { done(true); c(); } }, ok),
      h('button', { class: 'btn btn-ghost', onclick: () => { done(false); c(); } }, cancel),
    ], { title });
    // Tapping the backdrop counts as cancel.
    const iv = setInterval(() => { if (!sheets.includes(close)) { clearInterval(iv); done(false); } }, 200);
  });
}

let toastTimer = 0;
export function toast(msg, ms = 2600) {
  let el = document.getElementById('toast');
  if (!el) { el = h('div', { id: 'toast', role: 'status' }); document.body.append(el); }
  el.textContent = msg;
  el.classList.add('in');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('in'), ms);
}

// ---- controls ----
export function segmented(options, value, onChange) {
  return h('div', { class: 'seg', role: 'tablist' }, options.map(o => {
    const [val, label] = Array.isArray(o) ? o : [o, o];
    return h('button', { class: val === value ? 'on' : '', role: 'tab', 'aria-selected': String(val === value), onclick: () => val !== value && onChange(val) }, label);
  }));
}
export const field = (label, control, hint) => h('label', { class: 'field' }, h('span', { class: 'field-label' }, label), control, hint ? h('span', { class: 'field-hint' }, hint) : null);
export const select = (options, value, attrs = {}) =>
  h('select', { ...attrs, value }, options.map(o => { const [v, l] = Array.isArray(o) ? o : [o, o]; return h('option', { value: v }, l); }));
export const empty = (title, text, action) => h('div', { class: 'empty' }, h('div', { class: 'empty-title' }, title), text ? h('p', null, text) : null, action || null);
export const chip = (label, on, onClick) => h('button', { class: 'chip' + (on ? ' on' : ''), onclick: onClick }, label);
export const cap = t => t.charAt(0).toUpperCase() + t.slice(1);
