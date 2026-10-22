import '@fontsource/fira-sans-extra-condensed/600.css';
import '@fontsource/fira-sans-extra-condensed/800.css';
import '@fontsource/fira-sans/400.css';
import '@fontsource/fira-sans/600.css';
import '@fontsource/fira-sans/700.css';
import '@fontsource/instrument-serif/400.css';
import './styles.css';

import { App } from './app';
import { esc } from './core/format';
import { store } from './core/store';
import { clock, dayLabel } from './core/time';
import { star } from './posters/render';
import { renderAll } from './ui/all';
import { clearDeckKeys, deckKeys, renderDeck } from './ui/deck';
import { renderDetails } from './ui/details';
import { renderNight } from './ui/night';
import { renderOps } from './ui/ops';

const app = new App();
const main = document.getElementById('main')!;
const banner = document.getElementById('banner')!;
let current = '';

document.querySelector('.mark')!.innerHTML = `PT ${star()}`;

function activeSaves(): number {
  return store.saves().filter((s) => app.windows.some((w) => w.nights.includes(s.night))).length;
}

function renderBanner() {
  banner.innerHTML = app.isStale()
    ? `<p class="stale" role="status">${navigator.onLine ? 'Couldn’t refresh' : 'You’re offline'} — showing events as of ${esc(dayLabel(app.fetchedAt.slice(0, 10)).toLowerCase())} ${clock(app.fetchedAt)}. Times, prices and cancellations may have changed; check the source before you go.</p>`
    : '';
}

function route() {
  const hash = location.hash.replace(/^#\/?/, '');
  const [name, arg] = hash.split('/');
  const view = name || 'deck';
  const changedView = view !== current;
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
      document.title = 'Review board · Prague Tonight';
      break;
    default:
      renderDeck(app, main, rerender);
      document.title = 'Prague Tonight';
  }

  const n = activeSaves();
  document.querySelectorAll('.bottom a').forEach((a) => {
    const on = (a.classList.contains('nav-deck') && (view === 'deck' || view === 'all')) || (a.classList.contains('nav-night') && view === 'night');
    a.classList.toggle('on', on);
    if (on) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  document.querySelector('.nav-night .count')!.textContent = n ? String(n) : '';

  if (changedView) {
    window.scrollTo(0, 0);
    main.querySelector<HTMLElement>('h1[tabindex]')?.focus({ preventScroll: true });
  }
}

/** Re-render for fresh statuses without moving focus, scroll or selection. */
function refreshInPlace() {
  const before = main.innerHTML;
  const el = document.activeElement as HTMLElement | null;
  const attrs = ['href', 'data-i', 'data-act', 'data-win', 'aria-label', 'id'];
  const key = el && main.contains(el) ? attrs.map((a) => el.getAttribute(a) && `[${a}="${CSS.escape(el.getAttribute(a)!)}"]`).find(Boolean) : null;
  const y = window.scrollY;
  route();
  if (main.innerHTML === before) return;
  window.scrollTo(0, y);
  if (key) main.querySelector<HTMLElement>(key)?.focus({ preventScroll: true });
}

window.addEventListener('hashchange', route);
window.addEventListener('online', route);
window.addEventListener('offline', route);

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
  const nightRolled = app.tick() && app.windows[0].nights[0] !== document.body.dataset.night;
  document.body.dataset.night = app.windows[0].nights[0];
  if (app.busy || document.querySelector('.sheet-backdrop')) return;
  if (nightRolled) route();
  else if (current !== 'deck') refreshInPlace();
}, 30_000);
document.body.dataset.night = app.windows[0].nights[0];

route();
