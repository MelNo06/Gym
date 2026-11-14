// Small DOM, date and number helpers shared by every module.

function add(el, kids) {
  for (const k of kids) {
    if (k == null || k === false) continue;
    if (Array.isArray(k)) add(el, k);
    else el.append(k.nodeType ? k : String(k));
  }
}

function build(el, attrs, kids) {
  let value;
  if (attrs) for (const k in attrs) {
    const v = attrs[k];
    if (v == null || v === false) continue;
    if (k === 'class') el.setAttribute('class', v);
    else if (k === 'style' && typeof v === 'object') { for (const p in v) p.startsWith('--') ? el.style.setProperty(p, v[p]) : (el.style[p] = v[p]); }
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'value') value = v;
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  add(el, kids);
  if (value !== undefined) el.value = value;
  return el;
}

export const h = (tag, attrs, ...kids) => build(document.createElement(tag), attrs, kids);
export const s = (tag, attrs, ...kids) =>
  build(document.createElementNS('http://www.w3.org/2000/svg', tag), attrs, kids);

const ICONS = {
  back: '<path d="M15 5l-7 7 7 7"/>',
  down: '<path d="M5 9l7 7 7-7"/>',
  right: '<path d="M9 5l7 7-7 7"/>',
  left: '<path d="M15 5l-7 7 7 7"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  more: '<circle cx="5" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.6" fill="currentColor" stroke="none"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  trophy: '<path d="M8 4h8v5a4 4 0 01-8 0V4z"/><path d="M8 6H5a3 3 0 003 4M16 6h3a3 3 0 01-3 4M12 13v4M8.5 20h7M10 17h4"/>',
  // tab icons
  lift: '<path d="M3 12h18"/><rect x="5" y="7" width="3" height="10" rx="1"/><rect x="16" y="7" width="3" height="10" rx="1"/><path d="M2 10v4M22 10v4"/>',
  cal: '<rect x="4" y="5" width="16" height="15" rx="2.5"/><path d="M4 10h16M8.5 3v4M15.5 3v4"/>',
  chart: '<path d="M4 19h16"/><path d="M5 15l4.5-5 3.5 3L19 6"/><path d="M15 6h4v4"/>',
  list: '<path d="M9 7h11M9 12h11M9 17h11"/><circle cx="4.5" cy="7" r="1.2" fill="currentColor" stroke="none"/><circle cx="4.5" cy="12" r="1.2" fill="currentColor" stroke="none"/><circle cx="4.5" cy="17" r="1.2" fill="currentColor" stroke="none"/>',
  me: '<circle cx="12" cy="8.5" r="3.5"/><path d="M5 20c.8-3.6 3.5-5.5 7-5.5s6.2 1.9 7 5.5"/>',
};

export function icon(name, size = 22) {
  const el = s('svg', {
    viewBox: '0 0 24 24', width: size, height: size, fill: 'none', stroke: 'currentColor',
    'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true',
  });
  el.innerHTML = ICONS[name] || '';
  return el;
}

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// ---- dates (always local time) ----
export const DAY = 864e5;
export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const MON = MONTHS.map(m => m.slice(0, 3));
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const pad = n => String(n).padStart(2, '0');

export const dayKey = ms => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
export const parseDay = k => {
  const [y, m, d] = k.split('-').map(Number);
  return new Date(y, m - 1, d).getTime();
};
export const dayStart = ms => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); };
export const weekStart = ms => {
  const d = new Date(ms); d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // Monday
  return d.getTime();
};
export const monthStart = ms => { const d = new Date(ms); return new Date(d.getFullYear(), d.getMonth(), 1).getTime(); };

/** "Sat 14 Nov" · with year: "14 Nov 2026" · both: "Sat 14 Nov 2026" */
export function fmtDate(ms, { weekday = false, year = 'auto' } = {}) {
  const d = new Date(ms);
  const showYear = year === true || (year === 'auto' && d.getFullYear() !== new Date().getFullYear());
  return `${weekday ? WD[d.getDay()] + ' ' : ''}${d.getDate()} ${MON[d.getMonth()]}${showYear ? ' ' + d.getFullYear() : ''}`;
}
export const fmtTime = ms => { const d = new Date(ms); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };

/** 3900 -> "1h 05m", 1500 -> "25m" */
export function fmtDur(sec) {
  const m = Math.round(sec / 60);
  if (m < 1) return '<1m';
  if (m >= 6000) return `${Math.round(m / 60)} h`;
  return m >= 60 ? `${Math.floor(m / 60)}h ${pad(m % 60)}m` : `${m}m`;
}
/** 3909 -> "1:05:09", 309 -> "5:09" */
export function fmtClock(sec) {
  sec = Math.max(0, Math.round(sec));
  const hh = Math.floor(sec / 3600), mm = Math.floor(sec % 3600 / 60), ss = sec % 60;
  return hh ? `${hh}:${pad(mm)}:${pad(ss)}` : `${mm}:${pad(ss)}`;
}

// ---- numbers ----
/** Up to `dp` decimals, trailing zeros removed: 102.50 -> "102.5" */
export const num = (v, dp = 2) => (v == null || isNaN(v) ? '–' : String(+(+v).toFixed(dp)));
/** Thousands grouped with a thin space: 12450 -> "12 450" */
export const big = v => (v == null || isNaN(v) ? '–' : Math.round(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' '));
/** Accepts "82,5" as well as "82.5". Empty or invalid -> null */
export function parseNum(str) {
  if (str == null) return null;
  const t = String(str).trim().replace(',', '.');
  if (t === '') return null;
  const v = Number(t);
  return isFinite(v) ? v : null;
}
export const signed = (v, dp = 1) => (v > 0 ? '+' : v < 0 ? '−' : '') + num(Math.abs(v), dp);
