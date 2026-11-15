// All app data lives in memory in `S` and is persisted to IndexedDB on the device.
import { LIBRARY, DEFAULT_GROUPS, toGroup } from './library.js';
import { shade } from './colors.js';
import { dayKey, parseDay } from './util.js';

export const APP_VERSION = '1.3.0';
const DB = 'gym', STORE = 'kv', SCHEMA = 2;
const KEYS = ['exercises', 'workouts', 'routines', 'measurements', 'gyms', 'groups', 'profile', 'settings', 'active', 'meta'];

export const TYPES = {
  weight: 'Weight × reps',
  wbw: 'Bodyweight + added weight',
  abw: 'Bodyweight, assisted',
  bw: 'Bodyweight reps',
  time: 'Duration',
  dist: 'Distance',
};
export const EQUIP = ['barbell', 'dumbbell', 'machine', 'cable', 'bodyweight', 'kettlebell', 'band', 'other'];
export const isBW = ex => ex.type === 'wbw' || ex.type === 'abw' || ex.type === 'bw';
export const hasReps = ex => ex.type !== 'time' && ex.type !== 'dist';

const blank = () => ({
  exercises: [], workouts: [], routines: [], measurements: [], gyms: [], groups: [],
  profile: {}, settings: { range: '3M' }, active: null, meta: {},
});
export const S = blank();
/** Bumped on every data change; derived caches compare against it. */
export const rev = { n: 0 };

// ---- IndexedDB (falls back to localStorage if unavailable) ----
let db = null;
const openDB = () => new Promise((res, rej) => {
  const r = indexedDB.open(DB, 1);
  r.onupgradeneeded = () => r.result.createObjectStore(STORE);
  r.onsuccess = () => res(r.result);
  r.onerror = () => rej(r.error);
});
const idbGet = key => new Promise((res, rej) => {
  const r = db.transaction(STORE).objectStore(STORE).get(key);
  r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
});
const idbPut = (key, val) => new Promise((res, rej) => {
  const tx = db.transaction(STORE, 'readwrite');
  tx.objectStore(STORE).put(val, key);
  tx.oncomplete = res; tx.onerror = () => rej(tx.error);
});
async function read(key) {
  if (db) return idbGet(key);
  try { return JSON.parse(localStorage.getItem('gym:' + key)); } catch { return undefined; }
}
function write(key) {
  const val = S[key];
  if (db) return idbPut(key, val).catch(e => console.error('save failed', key, e));
  try { localStorage.setItem('gym:' + key, JSON.stringify(val)); } catch (e) { console.error(e); }
}

export async function init() {
  try { db = await openDB(); } catch (e) { console.warn('IndexedDB unavailable, using localStorage', e); }
  for (const k of KEYS) {
    const v = await read(k);
    if (v != null) S[k] = v;
  }
  normalize();
}

function normalize() {
  const d = blank();
  for (const k of KEYS) if (S[k] == null && k !== 'active') S[k] = d[k];
  S.settings = { ...d.settings, ...S.settings };
  // ---- upgrades from older versions (each step is safe to run again) ----
  const dirty = new Set();
  if (!S.meta.groupsSeeded) {                      // 1.2: muscle groups with colours
    if (!S.groups.length) S.groups = DEFAULT_GROUPS.map(g => ({ ...g }));
    S.meta.groupsSeeded = true; dirty.add('groups').add('meta');
  }
  for (const e of S.exercises) if (!('group' in e)) {   // 1.2: free-text muscle -> group
    const g = toGroup(e.muscle);
    e.group = S.groups.some(x => x.id === g) ? g : null; delete e.muscle; dirty.add('exercises');
  }
  S.gyms.forEach((g, i) => {                       // 1.2: a gym has a shade, not a colour of its own
    if (g.shade == null) { g.shade = [0, 1, -1, 2, -2][i % 5]; delete g.color; dirty.add('gyms'); }
  });
  // Merge built-in exercises that are new to this device. Never overwrite the user's edits.
  const have = new Set(S.exercises.map(e => e.id));
  const removed = new Set(S.meta.removedBuiltin || []);
  for (const e of LIBRARY) if (!have.has(e.id) && !removed.has(e.id)) {
    S.exercises.push({ ...e, group: S.groups.some(x => x.id === e.group) ? e.group : null }); dirty.add('exercises');
  }
  sortAll();
  rev.n++;
  for (const k of dirty) write(k);
}

function sortAll() {
  S.exercises.sort((a, b) => a.name.localeCompare(b.name));
  S.workouts.sort((a, b) => a.start - b.start);
  S.measurements.sort((a, b) => a.date.localeCompare(b.date));
}

let activeTimer = 0;
/** Persist the given keys. Everything is written at once except the in-progress workout, which is debounced. */
export function save(...keys) {
  if (keys.some(k => k !== 'active')) { sortAll(); requestPersist(); }
  // Only these keys feed the statistics, so only they invalidate the derived caches.
  if (keys.some(k => k === 'exercises' || k === 'workouts' || k === 'measurements' || k === 'gyms' || k === 'groups')) rev.n++;
  for (const k of keys) {
    if (k === 'active') {
      clearTimeout(activeTimer);
      activeTimer = setTimeout(() => { activeTimer = 0; write('active'); }, 250);
    } else write(k);
  }
}
export function flush() {
  if (activeTimer) { clearTimeout(activeTimer); activeTimer = 0; write('active'); }
}

let exMap = null, exMapRev = -1;
export function exById(id) {
  if (exMapRev !== rev.n) { exMap = new Map(S.exercises.map(e => [e.id, e])); exMapRev = rev.n; }
  return exMap.get(id);
}

/** Body weight valid on a given day: the latest entry on or before it, else the earliest entry, else null. */
export function bwAt(ms) {
  const m = S.measurements;
  if (!m.length) return null;
  const key = dayKey(ms);
  let found = null;
  for (const e of m) { if (e.kg == null) continue; if (e.date <= key) found = e; else { if (!found) found = e; break; } }
  return found ? found.kg : null;
}

// ---- persistence request & info ----
let asked = false;
export async function requestPersist() {
  if (asked || !navigator.storage?.persist) return;
  asked = true;
  try { await navigator.storage.persist(); } catch { /* best effort */ }
}
export async function storageInfo() {
  const out = { persisted: null, usage: null };
  try {
    if (navigator.storage?.persisted) out.persisted = await navigator.storage.persisted();
    if (navigator.storage?.estimate) out.usage = (await navigator.storage.estimate()).usage;
  } catch { /* ignore */ }
  return out;
}

// ---- backup ----
export function exportData() {
  const data = {};
  for (const k of KEYS) if (k !== 'active') data[k] = S[k];
  return { app: 'gym', schema: SCHEMA, version: APP_VERSION, exportedAt: new Date().toISOString(), data };
}
/** Replaces everything on this device with the contents of a backup file. Throws on a file that is not a Gym backup. */
export function importData(obj) {
  if (!obj || obj.app !== 'gym' || !obj.data || !Array.isArray(obj.data.workouts)) throw new Error('This file is not a Gym backup.');
  if (obj.schema > SCHEMA) throw new Error('This backup was made by a newer version of the app. Update the app first.');
  const d = blank();
  for (const k of KEYS) if (k !== 'active') S[k] = obj.data[k] ?? d[k];
  S.active = null;
  normalize();
  for (const k of KEYS) write(k);
}
export function wipe() {
  Object.assign(S, blank());
  normalize();
  for (const k of KEYS) write(k);
}

/** One row per logged set, for analysis in Python or a spreadsheet. */
export function toCSV(rowFn) {
  const head = ['date', 'start_time', 'workout', 'gym', 'exercise', 'type', 'set_no', 'set_type', 'kg', 'reps', 'seconds', 'km',
    'bodyweight_kg', 'load_kg', 'e1rm_epley_kg', 'e1rm_brzycki_kg'];
  const q = v => (v == null ? '' : /[",\n]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v));
  const lines = [head.join(',')];
  for (const w of S.workouts) for (const we of w.exercises) {
    const ex = exById(we.exId);
    if (!ex) continue;
    we.sets.forEach((set, i) => lines.push(rowFn(w, ex, set, i).map(q).join(',')));
  }
  return lines.join('\n');
}

export const gymById = id => (id ? S.gyms.find(g => g.id === id) || null : null);
export const groupById = id => (id ? S.groups.find(g => g.id === id) || null : null);
/** Is this a cardio exercise? Decided by its muscle group: the built-in Cardio group, or any group named like it. */
export const isCardio = ex => { const g = groupById(ex?.group); return !!g && (g.id === 'cardio' || /cardio/i.test(g.name)); };
/** Colour of an exercise: its muscle group's colour at a gym shade level (0 = plain). Grey without a group. */
export const exColor = (ex, level = 0) => shade(groupById(ex?.group)?.color, level);

export const SET_TYPES = { n: 'Normal', w: 'Warm-up', d: 'Drop set', f: 'To failure' };
export { parseDay };
