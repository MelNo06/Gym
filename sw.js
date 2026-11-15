// Offline support. Bump VERSION (and APP_VERSION in js/store.js) with every change,
// otherwise installed copies keep serving the old files.
const VERSION = '1.2.0';
const CACHE = 'gym-' + VERSION;
const ASSETS = [
  './', 'index.html', 'manifest.webmanifest', 'css/app.css',
  'js/main.js', 'js/util.js', 'js/colors.js', 'js/store.js', 'js/library.js', 'js/stats.js', 'js/charts.js', 'js/ui.js', 'js/demo.js',
  'js/views/common.js', 'js/views/editor.js', 'js/views/picker.js', 'js/views/exercise.js',
  'js/views/history.js', 'js/views/workout.js', 'js/views/progress.js', 'js/views/me.js',
  'fonts/barlow-condensed-500.woff2', 'fonts/barlow-condensed-600.woff2', 'fonts/barlow-condensed-700.woff2',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png',
];

self.addEventListener('install', e => e.waitUntil(
  caches.open(CACHE)
    .then(c => c.addAll(ASSETS.map(u => new Request(u, { cache: 'reload' }))))
    .then(() => self.skipWaiting())));

self.addEventListener('activate', e => e.waitUntil(
  caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('gym-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim())));

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(hit => hit || fetch(e.request)));
});
