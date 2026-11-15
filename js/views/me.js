// Me tab: measurements, backup, settings.
import { h, icon, uid, num, fmtDate, dayKey, parseDay, parseNum, DAY } from '../util.js';
import { S, save, exportData, importData, wipe, toCSV, storageInfo, gymById, APP_VERSION } from '../store.js';
import { COLOR_KEYS, SHADES, shade, shadeName } from '../colors.js';
import { trend, rangeFrom, csvRow } from '../stats.js';
import { sheet, confirmBox, toast, field, refresh } from '../ui.js';
import { xyChart, C } from '../charts.js';
import { chartCard, rangeControl, perMonth, gymDot } from './common.js';
import { tile } from './editor.js';

const latest = key => S.measurements.slice().reverse().find(m => m[key] != null);
export function ageFrom(birth, now = Date.now()) {
  if (!birth) return null;
  const b = new Date(parseDay(birth)), n = new Date(now);
  let a = n.getFullYear() - b.getFullYear();
  if (n.getMonth() < b.getMonth() || (n.getMonth() === b.getMonth() && n.getDate() < b.getDate())) a--;
  return a;
}

/** Body weight over time with a 14-day trailing average. Returns null when nothing is logged in the range. */
export function weightCard() {
  const now = Date.now();
  const all = S.measurements.filter(m => m.kg != null).map(m => ({ x: parseDay(m.date) + DAY / 2, y: m.kg, m }));
  if (!all.length) return null;
  let from = rangeFrom(S.settings.range, now);
  if (from === -Infinity) from = all[0].x - Math.max(DAY, (now - all[0].x) * 0.03);
  const avgAll = all.map((p, i) => {
    let sum = 0, n = 0;
    for (let j = i; j >= 0 && p.x - all[j].x <= 14 * DAY; j--) { sum += all[j].y; n++; }
    return { x: p.x, y: sum / n };
  });
  const pts = all.filter(p => p.x >= from), avg = avgAll.filter(p => p.x >= from);
  if (!pts.length) return null;
  const tr = trend(pts);
  return chartCard({
    title: 'Body weight', value: `${num(pts.at(-1).y, 1)} kg`, chip: perMonth(tr, 'kg'),
    legendItems: [{ label: 'Weigh-in', color: C.mute, kind: 'dot' }, { label: '14-day average', color: C.c1 }],
    draw: (el, w, H) => xyChart(el, w, H, {
      x0: from, x1: now, yFmt: v => num(v, 1), label: 'Body weight over time',
      series: [{ pts, color: C.mute, kind: 'dots' }, { pts: avg, color: C.c1, kind: 'line' }],
      scrub: pts.map((p, i) => ({
        x: p.x, title: fmtDate(p.x, { weekday: true, year: true }),
        rows: [{ label: 'Weigh-in', value: `${num(p.y, 1)} kg`, color: C.mute }, { label: '14-day average', value: `${num(avg[i].y, 1)} kg`, color: C.c1 },
          p.m.bf != null ? { label: 'Body fat', value: `${num(p.m.bf, 1)} %` } : null].filter(Boolean),
        marks: [{ y: avg[i].y, color: C.c1 }],
      })),
    }),
  });
}

function measureSheet(m) {
  const isNew = !m;
  const dateIn = h('input', { type: 'date', value: m?.date || dayKey(Date.now()), max: dayKey(Date.now()) });
  const kgIn = h('input', { type: 'text', inputmode: 'decimal', value: m?.kg ?? '', placeholder: latest('kg') ? num(latest('kg').kg, 1) : '' });
  const bfIn = h('input', { type: 'text', inputmode: 'decimal', value: m?.bf ?? '', placeholder: 'Optional' });
  sheet(close => [
    field('Date', dateIn),
    h('div', { class: 'grid-2' }, field('Weight in kg', kgIn), field('Body fat in %', bfIn)),
    h('button', {
      class: 'btn btn-primary', onclick: () => {
        const kg = parseNum(kgIn.value), bf = parseNum(bfIn.value);
        if (!(kg > 0)) { toast('Enter your weight in kg.'); kgIn.focus(); return; }
        const date = dateIn.value || dayKey(Date.now());
        // One entry per day: a second entry on the same date replaces the first.
        S.measurements = S.measurements.filter(x => x.id !== m?.id && x.date !== date);
        S.measurements.push({ id: m?.id || uid(), date, kg, ...(bf > 0 ? { bf } : {}) });
        save('measurements'); close(); refresh();
      },
    }, 'Save'),
    isNew ? null : h('button', { class: 'btn btn-ghost danger', onclick: () => { S.measurements = S.measurements.filter(x => x.id !== m.id); save('measurements'); close(); refresh(); } }, 'Delete entry'),
  ], { title: isNew ? 'Log weight' : 'Edit entry' });
}

function profileSheet() {
  const birthIn = h('input', { type: 'date', value: S.profile.birth || '', max: dayKey(Date.now()) });
  const heightIn = h('input', { type: 'text', inputmode: 'decimal', value: S.profile.heightCm ?? '' });
  sheet(close => [
    field('Date of birth', birthIn, 'Your age is worked out from this.'), field('Height in cm', heightIn),
    h('button', { class: 'btn btn-primary', onclick: () => { S.profile = { ...S.profile, birth: birthIn.value || null, heightCm: parseNum(heightIn.value) }; save('profile'); close(); refresh(); } }, 'Save'),
  ], { title: 'About you' });
}

// A stripe of three sample colours at one shade level, to show what "lighter" or "darker" does.
const shadeStripe = level => `linear-gradient(90deg, ${shade('green', level)} 0 33.3%, ${shade('blue', level)} 33.3% 66.6%, ${shade('pink', level)} 66.6%)`;

function gymSheet(g) {
  const isNew = !g;
  let level = g ? g.shade || 0 : (SHADES.find(([v]) => !S.gyms.some(x => (x.shade || 0) === v)) || SHADES[0])[0];
  const nameIn = h('input', { type: 'text', value: g?.name || '', placeholder: 'Gym name', autocapitalize: 'words' });
  const opts = h('div', { class: 'shade-opts' }), clash = h('span', { class: 'field-hint' });
  const paint = () => {
    opts.replaceChildren(...[2, 1, 0, -1, -2].map(v => h('button', { class: 'shade-opt' + (v === level ? ' on' : ''), 'aria-pressed': String(v === level), onclick: () => { level = v; paint(); } },
      h('i', { style: { background: shadeStripe(v) } }), h('span', null, shadeName(v)))));
    const same = S.gyms.filter(x => x !== g && (x.shade || 0) === level).map(x => x.name);
    clash.textContent = same.length ? `${same.join(' and ')} already ${same.length > 1 ? 'use' : 'uses'} this shade. Their lines would look the same in a graph.` : 'In a graph, each exercise is drawn in its muscle colour at this shade when it was done at this gym.';
  };
  paint();
  const untagged = S.workouts.filter(w => !gymById(w.gymId)).length;
  const here = g ? S.workouts.filter(w => w.gymId === g.id).length : 0;
  sheet(close => [
    field('Name', nameIn),
    h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Shade in graphs'), opts, clash),
    h('button', {
      class: 'btn btn-primary', onclick: () => {
        const name = nameIn.value.trim();
        if (!name) { toast('Give the gym a name.'); nameIn.focus(); return; }
        if (isNew) S.gyms.push({ id: 'g-' + uid(), name, shade: level }); else Object.assign(g, { name, shade: level });
        save('gyms'); close(); refresh();
      },
    }, 'Save'),
    !isNew && untagged ? h('button', {
      class: 'btn btn-soft', onclick: async () => {
        close();
        if (!await confirmBox({ title: `Tag ${untagged} workout${untagged === 1 ? '' : 's'} as ${g.name}?`, text: 'Every workout that has no gym yet is assigned to this gym.', ok: 'Tag workouts' })) return;
        for (const w of S.workouts) if (!gymById(w.gymId)) w.gymId = g.id;
        save('workouts'); refresh(); toast('Workouts tagged');
      },
    }, `Tag the ${untagged} workout${untagged === 1 ? '' : 's'} without a gym`) : null,
    isNew ? null : h('button', {
      class: 'btn btn-ghost danger', onclick: async () => {
        close();
        if (!await confirmBox({ title: `Delete ${g.name}?`, text: here ? `The ${here} workout${here === 1 ? '' : 's'} logged there are kept and no longer have a gym.` : null, ok: 'Delete gym', danger: true })) return;
        S.gyms.splice(S.gyms.indexOf(g), 1);
        for (const w of S.workouts) if (w.gymId === g.id) w.gymId = null;
        if (S.active?.gymId === g.id) { S.active.gymId = null; save('active'); }
        save('gyms', 'workouts'); refresh(); toast('Gym deleted');
      },
    }, 'Delete gym'),
  ], { title: isNew ? 'Add gym' : 'Edit gym' });
}

function groupSheet(g) {
  const isNew = !g;
  let color = g?.color || COLOR_KEYS.find(c => !S.groups.some(x => x.color === c)) || COLOR_KEYS[0];
  const nameIn = h('input', { type: 'text', value: g?.name || '', placeholder: 'e.g. Chest', autocapitalize: 'words' });
  const sw = h('div', { class: 'swatches' }), clash = h('span', { class: 'field-hint' });
  const paint = () => {
    sw.replaceChildren(...COLOR_KEYS.map(c => h('button', { class: 'swatch' + (c === color ? ' on' : ''), style: { background: shade(c) }, 'aria-label': c, 'aria-pressed': String(c === color), onclick: () => { color = c; paint(); } }, c === color ? icon('check', 16) : null)));
    const same = S.groups.filter(x => x !== g && x.color === color).map(x => x.name);
    clash.textContent = same.length ? `${same.join(' and ')} already ${same.length > 1 ? 'have' : 'has'} this colour.` : '';
  };
  paint();
  const n = g ? S.exercises.filter(e => e.group === g.id).length : 0;
  sheet(close => [
    field('Name', nameIn),
    h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Colour'), sw, clash),
    h('button', {
      class: 'btn btn-primary', onclick: () => {
        const name = nameIn.value.trim();
        if (!name) { toast('Give the muscle group a name.'); nameIn.focus(); return; }
        if (isNew) S.groups.push({ id: 'm-' + uid(), name, color }); else Object.assign(g, { name, color });
        save('groups'); close(); refresh();
      },
    }, 'Save'),
    isNew ? null : h('button', {
      class: 'btn btn-ghost danger', onclick: async () => {
        close();
        if (!await confirmBox({ title: `Delete ${g.name}?`, text: n ? `Its ${n} exercise${n === 1 ? '' : 's'} are kept and no longer have a muscle group.` : null, ok: 'Delete muscle group', danger: true })) return;
        S.groups.splice(S.groups.indexOf(g), 1);
        for (const e of S.exercises) if (e.group === g.id) e.group = null;
        save('groups', 'exercises'); refresh(); toast('Muscle group deleted');
      },
    }, 'Delete muscle group'),
  ], { title: isNew ? 'Add muscle group' : 'Edit muscle group' });
}

async function shareFile(name, text, type) {
  const file = new File([text], name, { type });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file] }); return true; } catch (e) { if (e.name === 'AbortError') return false; }
  }
  const a = h('a', { href: URL.createObjectURL(file), download: name });
  document.body.append(a); a.click(); a.remove();
  return true;
}
async function doExport() {
  if (await shareFile(`gym-backup-${dayKey(Date.now())}.json`, JSON.stringify(exportData()), 'application/json')) {
    S.meta.lastBackup = Date.now(); save('meta'); refresh();
  }
}
function doImport() {
  const inp = h('input', { type: 'file', accept: '.json,application/json', onchange: async () => {
    const file = inp.files[0];
    if (!file) return;
    try {
      const obj = JSON.parse(await file.text());
      const n = obj?.data?.workouts?.length ?? 0;
      const ok = await confirmBox({ title: 'Replace all data on this phone?', text: `The backup from ${obj.exportedAt ? fmtDate(Date.parse(obj.exportedAt), { year: true }) : 'an unknown date'} holds ${n} workout${n === 1 ? '' : 's'}. Everything currently in the app is overwritten.`, ok: 'Replace with backup', danger: true });
      if (!ok) return;
      importData(obj); refresh(); toast('Backup restored');
    } catch (e) { toast(e.message?.startsWith('This') ? e.message : 'That file could not be read as a Gym backup.', 4000); }
  } });
  inp.click();
}
async function loadDemo() {
  if (S.workouts.length && !S.meta.demo) {
    const ok = await confirmBox({ title: 'Replace your data with demo data?', text: 'Export a backup first if you want to keep what you have logged.', ok: 'Replace with demo data', danger: true });
    if (!ok) return;
  }
  const { makeDemo } = await import('../demo.js');
  importData(makeDemo()); refresh(); toast('Demo data loaded');
}
async function doWipe(text) {
  if (!await confirmBox({ title: 'Delete everything?', text, ok: 'Delete all data', danger: true })) return;
  wipe(); refresh(); toast('All data deleted');
}

/** What the phone reports about the screen. Shown under App so a layout problem can be pinned down from a screenshot. */
function displayInfo() {
  const probe = h('div', { style: 'position:fixed;visibility:hidden;padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)' });
  document.body.append(probe);
  const cs = getComputedStyle(probe), top = Math.round(parseFloat(cs.paddingTop) || 0), bottom = Math.round(parseFloat(cs.paddingBottom) || 0);
  probe.remove();
  const installed = navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
  return `${installed ? 'Installed app' : 'Browser'}, window ${window.innerWidth} × ${window.innerHeight}, screen ${screen.width} × ${screen.height}, safe area top ${top} and bottom ${bottom}.`;
}

let info = null, showAll = false;
export function meTab(rerender) {
  if (!info) storageInfo().then(i => { info = i; rerender(); });
  const w = latest('kg'), bf = latest('bf'), age = ageFrom(S.profile.birth);
  const entries = S.measurements.slice().reverse();
  const backupAge = S.meta.lastBackup ? Math.floor((Date.now() - S.meta.lastBackup) / DAY) : null;
  const toggle = (label, key, hint) => h('label', { class: 'check-row' },
    h('input', { type: 'checkbox', checked: S.settings[key] !== false, onchange: e => { S.settings[key] = e.target.checked; save('settings'); refresh(); } }),
    h('span', null, label, hint ? h('small', null, hint) : null));
  return [
    h('div', { class: 'tab-head' }, h('h1', null, 'Me'),
      h('button', { class: 'btn-pill ghost', onclick: profileSheet }, icon('edit', 15), 'Edit')),
    h('div', { class: 'tiles tiles-4' },
      tile('Weight', w ? num(w.kg, 1) + ' kg' : '–'), tile('Height', S.profile.heightCm ? num(S.profile.heightCm, 0) + ' cm' : '–'),
      tile('Age', age ?? '–'), tile('Body fat', bf ? num(bf.bf, 1) + ' %' : '–')),
    h('button', { class: 'btn btn-primary', onclick: () => measureSheet(null) }, icon('plus', 18), 'Log weight'),
    S.measurements.length ? [rangeControl(rerender), weightCard() || h('p', { class: 'hint center' }, 'No weigh-ins in this range.')] : h('p', { class: 'hint' }, 'Your body weight is used as load for pull-ups, dips and other bodyweight exercises, so their volume and estimated 1RM depend on it.'),
    entries.length ? h('section', { class: 'card' }, h('h3', null, 'Weigh-ins'),
      h('div', { class: 'list flush' }, entries.slice(0, showAll ? 1e9 : 6).map(m => h('button', { class: 'list-row', onclick: () => measureSheet(m) },
        h('span', { class: 'row-main' }, h('b', null, `${num(m.kg, 1)} kg`), h('small', null, fmtDate(parseDay(m.date), { weekday: true, year: true }))),
        m.bf != null ? h('span', { class: 'muted' }, `${num(m.bf, 1)} %`) : null))),
      entries.length > 6 && !showAll ? h('button', { class: 'btn btn-soft', onclick: () => { showAll = true; rerender(); } }, `Show all ${entries.length}`) : null) : null,

    h('section', { class: 'card' },
      h('div', { class: 'card-head' }, h('h3', null, 'Gyms'), h('button', { class: 'btn-pill ghost', onclick: () => gymSheet(null) }, icon('plus', 16), 'Add gym')),
      S.gyms.length
        ? h('div', { class: 'list flush' }, S.gyms.map(g => {
          const n = S.workouts.filter(w => w.gymId === g.id).length;
          return h('button', { class: 'list-row', onclick: () => gymSheet(g) }, gymDot(g),
            h('span', { class: 'row-main' }, h('b', null, g.name), h('small', null, `${shadeName(g.shade)} shade, ${n} workout${n === 1 ? '' : 's'}`)), icon('right', 16));
        }))
        : h('p', { class: 'chart-note' }, 'Add the gyms you train at. You pick the gym when a workout starts. Graphs, previous values and records are then kept per gym, because the same machine can feel heavier or lighter somewhere else.')),

    h('section', { class: 'card' },
      h('div', { class: 'card-head' }, h('h3', null, 'Muscle groups'), h('button', { class: 'btn-pill ghost', onclick: () => groupSheet(null) }, icon('plus', 16), 'Add group')),
      h('p', { class: 'chart-note' }, 'Each exercise belongs to one group and is drawn in its colour. Change the group of an exercise on its page (Exercises, tap it, then the pencil).'),
      h('div', { class: 'list flush' }, S.groups.map(g => {
        const n = S.exercises.filter(e => e.group === g.id && !e.archived).length;
        return h('button', { class: 'list-row', onclick: () => groupSheet(g) }, h('i', { class: 'ex-dot big', style: { background: shade(g.color) } }),
          h('span', { class: 'row-main' }, h('b', null, g.name), h('small', null, `${n} exercise${n === 1 ? '' : 's'}`)), icon('right', 16));
      }))),

    h('section', { class: 'card' }, h('h3', null, 'Backup'),
      h('p', { class: 'chart-note' }, backupAge == null ? 'No backup exported yet.' : backupAge === 0 ? 'Last backup exported today.' : `Last backup exported ${backupAge} day${backupAge === 1 ? '' : 's'} ago.`,
        ' Your data is stored only on this phone. Removing the app from the Home Screen deletes it.'),
      h('button', { class: 'btn btn-soft', onclick: doExport }, 'Export backup'),
      h('button', { class: 'btn btn-soft', onclick: doImport }, 'Restore from backup'),
      h('button', { class: 'btn btn-soft', onclick: () => shareFile(`gym-sets-${dayKey(Date.now())}.csv`, toCSV(csvRow), 'text/csv') }, 'Export all sets as CSV'),
      info ? h('p', { class: 'chart-note' },
        info.persisted == null ? '' : info.persisted ? 'Storage is protected from automatic clean-up. ' : 'Storage is not yet protected from automatic clean-up. Add the app to your Home Screen. ',
        info.usage != null ? `The app uses ${num(info.usage / 1048576, 1)} MB.` : '') : null),

    h('section', { class: 'card' }, h('h3', null, 'Settings'),
      toggle('Keep the screen on during a workout', 'wake', 'You can still lock the phone yourself.')),

    h('section', { class: 'card' }, h('h3', null, 'Demo data'),
      h('p', { class: 'chart-note' }, S.meta.demo ? 'You are looking at made-up demo data.' : 'Fills the app with 18 months of made-up training so you can see what the graphs look like.'),
      S.meta.demo
        ? h('button', { class: 'btn btn-soft', onclick: () => doWipe('This removes the demo data and leaves the app empty.') }, 'Remove demo data')
        : h('button', { class: 'btn btn-soft', onclick: loadDemo }, 'Load demo data')),

    h('section', { class: 'card' }, h('h3', null, 'App'),
      h('p', { class: 'chart-note' }, `Version ${APP_VERSION}. Updates install on their own when you open the app with a connection.`),
      h('p', { class: 'chart-note' }, 'Display: ', displayInfo()),
      h('button', { class: 'btn btn-soft', onclick: async () => {
        const reg = await navigator.serviceWorker?.getRegistration();
        if (!reg) { toast('Updates need the installed app.'); return; }
        await reg.update(); toast(reg.installing || reg.waiting ? 'Update found. Installing…' : 'You have the latest version.');
      } }, 'Check for update'),
      S.meta.demo ? null : h('button', { class: 'btn btn-ghost danger', onclick: () => doWipe('All workouts, routines, measurements and your own exercises are removed from this phone. This cannot be undone.') }, 'Delete all data')),
  ];
}
