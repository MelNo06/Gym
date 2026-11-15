// Installed on an iPhone with the status bar drawn over the page, iOS reports a window that is shorter
// than the screen by the height of the status bar, yet starts the page at the very top. The page then
// ends above the bottom edge and leaves an empty strip there. This measures that gap once at start-up
// (before any keyboard can disturb the numbers) and lets the stylesheet stretch the app by it.
import { S } from './store.js';

const installed = navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
const measure = () => {
  const gap = Math.round(screen.height - window.innerHeight);
  const portrait = Math.abs(window.innerWidth - screen.width) < 2;
  return installed && portrait && gap > 8 && gap < 90 ? gap : 0;
};
/** Height of the strip in px, or 0 when the app already reaches the bottom edge. */
export let screenGap = measure();
window.addEventListener('orientationchange', () => setTimeout(() => { screenGap = measure(); fitScreen(); }, 600));

/** Apply (or drop) the stretch. The setting lets the user switch it off if a future iOS changes the numbers. */
export function fitScreen() {
  const px = S.settings.stretch !== false ? screenGap : 0;
  document.documentElement.style.setProperty('--vfix', px + 'px');
  return px;
}
