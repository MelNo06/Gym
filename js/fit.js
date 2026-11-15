// Installed on an iPhone with the status bar drawn over the page, iOS reports a window that is shorter
// than the screen by the height of the status bar, yet starts the page at the very top. The page then
// ends above the bottom edge, and iOS draws nothing in the strip below it (stretching the page into it
// was tried in 1.3.1 and gets cut off). That strip is taller than the home-indicator area, so the app
// needs no bottom padding of its own there: this takes the gap off the bottom safe-area inset, which
// moves the tab bar down to the true end of the drawable screen.
const installed = navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;

function safeBottom() {
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;visibility:hidden;padding-bottom:env(safe-area-inset-bottom)';
  document.body.append(probe);
  const px = parseFloat(getComputedStyle(probe).paddingBottom) || 0;
  probe.remove();
  return px;
}
function measure() {
  const gap = Math.round(screen.height - window.innerHeight);
  const portrait = Math.abs(window.innerWidth - screen.width) < 2;
  return installed && portrait && gap > 8 && gap < 90 ? gap : 0;
}

// Measured once at start-up, before any keyboard can disturb the numbers.
let gap = measure();
window.addEventListener('orientationchange', () => setTimeout(() => { gap = measure(); fitScreen(); }, 600));

export function fitScreen() {
  const root = document.documentElement;
  if (gap) root.style.setProperty('--sb', Math.max(0, Math.round(safeBottom() - gap)) + 'px');
  else root.style.removeProperty('--sb');          // normal case: the stylesheet's own safe-area value applies
}
