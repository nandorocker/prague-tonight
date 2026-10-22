import '@fontsource/fira-sans-extra-condensed/600.css';
import '@fontsource/fira-sans-extra-condensed/800.css';
import '@fontsource/fira-sans/400.css';
import '@fontsource/fira-sans/600.css';
import '@fontsource/fira-sans/700.css';
import '@fontsource/instrument-serif/400.css';
import '@fontsource/instrument-serif/400-italic.css';
import '@fontsource/baloo-2/800.css';
import './styles.css';

import { App } from './app';
import { filterCount } from './core/filters';
import { esc } from './core/format';
import { clock, dayLabel } from './core/time';
import { renderAll } from './ui/all';
import { clearDeckKeys, deckKeys, renderDeck } from './ui/deck';
import { renderDetails } from './ui/details';
import { renderNight, resetNightScope, upcomingCount } from './ui/night';
import { renderOps } from './ui/ops';
import { openSettings } from './ui/settings';

const app = new App();
const main = document.getElementById('main')!;
const banner = document.getElementById('banner')!;
const settingsBtn = document.querySelector<HTMLButtonElement>('.settings-btn')!;
let current = '';

function renderBanner() {
  banner.innerHTML = app.isStale()
    ? `<p class="stale" role="status">${navigator.onLine ? 'Couldn’t refresh' : 'You’re offline'} — showing events as of ${esc(dayLabel(app.fetchedAt.slice(0, 10)).toLowerCase())} ${clock(app.fetchedAt)}. Check the listing before you go.</p>`
    : '';
}

function route() {
  const hash = location.hash.replace(/^#\/?/, '');
  const [name, arg] = hash.split('/');
  const view = ['night', 'all', 'event', 'ops'].includes(name) ? name : 'deck';
  const changedView = view !== current;
  if (changedView && view === 'night' && current !== 'event') resetNightScope();
  current = view;
  clearDeckKeys();
  main.className = `view-${view}`;
  document.body.dataset.view = view;
  renderBanner();

  const rerender = () => route();
  switch (view) {
    case 'night':
      renderNight(app, main, arg === 'map' ? 'map' : 'list', rerender);
      document.title = 'My Night · Prague Tonight';
      break;
    case 'all':
      renderAll(app, main, rerender);
      document.title = 'All events · Prague Tonight';
      break;
    case 'event':
      renderDetails(app, main, decodeURIComponent(arg ?? ''), rerender);
      document.title = `${app.byId.get(decodeURIComponent(arg ?? ''))?.title ?? 'Event'} · Prague Tonight`;
      break;
    case 'ops':
      renderOps(app, main, rerender);
      document.title = 'Tools · Prague Tonight';
      break;
    default:
      renderDeck(app, main, rerender);
      document.title = 'Prague Tonight';
  }

  settingsBtn.querySelector('.settings-label')!.textContent = app.window.label;
  settingsBtn.querySelector<HTMLElement>('.settings-dot')!.hidden = !filterCount(app.filters);
  settingsBtn.setAttribute('aria-label', `Settings: ${app.window.label}${filterCount(app.filters) ? ', filtered' : ''}`);

  const n = upcomingCount(app);
  document.querySelectorAll('.bottom a').forEach((a) => {
    const on = (a.classList.contains('nav-deck') && (view === 'deck' || view === 'all')) || (a.classList.contains('nav-night') && view === 'night');
    a.classList.toggle('on', on);
    if (on) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  document.querySelector('.nav-night .count')!.textContent = n ? String(n) : '';

  if (changedView) {
    main.scrollTop = 0;
    main.querySelector<HTMLElement>('h1[tabindex]')?.focus({ preventScroll: true });
  }
}

/** Re-render for fresh statuses without moving focus, scroll or selection. */
function refreshInPlace() {
  const before = main.innerHTML;
  const el = document.activeElement as HTMLElement | null;
  const attrs = ['href', 'data-i', 'data-act', 'data-scope', 'aria-label', 'id'];
  const key = el && main.contains(el) ? attrs.map((a) => el.getAttribute(a) && `[${a}="${CSS.escape(el.getAttribute(a)!)}"]`).find(Boolean) : null;
  const y = main.scrollTop;
  route();
  if (main.innerHTML === before) return;
  main.scrollTop = y;
  if (key) main.querySelector<HTMLElement>(key)?.focus({ preventScroll: true });
}

window.addEventListener('hashchange', route);
window.addEventListener('online', route);
window.addEventListener('offline', route);

settingsBtn.addEventListener('click', () => openSettings(app, route));

// The wordmark goes home on tap. Holding it for a second opens the tools.
const logo = document.querySelector<HTMLButtonElement>('.logo')!;
let pressTimer: number | undefined;
let longPressed = false;
logo.addEventListener('pointerdown', () => {
  longPressed = false;
  pressTimer = window.setTimeout(() => {
    longPressed = true;
    navigator.vibrate?.(20);
    location.hash = '#/ops';
  }, 900);
});
for (const t of ['pointerup', 'pointerleave', 'pointercancel']) logo.addEventListener(t, () => clearTimeout(pressTimer));
logo.addEventListener('contextmenu', (ev) => ev.preventDefault());
logo.addEventListener('click', () => {
  if (longPressed) return;
  if (location.hash.replace(/^#\/?/, '')) location.hash = '#/';
  else route();
});

document.addEventListener('keydown', (ev) => {
  if (!deckKeys || ev.metaKey || ev.ctrlKey || ev.altKey) return;
  if (document.querySelector('.sheet-backdrop')) return;
  // Only when nothing else wants the keys: the card itself, or no focus.
  const t = ev.target as HTMLElement;
  if (!(t === document.body || t.id === 'main' || t.classList.contains('card'))) return;
  deckKeys(ev);
});

// Keep statuses ("starts in", "ended") honest while the app stays open.
setInterval(() => {
  const nightRolled = app.tick() && app.tonight !== document.body.dataset.night;
  document.body.dataset.night = app.tonight;
  if (app.busy || document.querySelector('.sheet-backdrop')) return;
  if (nightRolled) route();
  else if (current !== 'deck' && current !== 'ops') refreshInPlace();
}, 30_000);
document.body.dataset.night = app.tonight;

route();
