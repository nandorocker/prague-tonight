import { App } from './app';
import { filterCount } from './core/filters';
import { esc } from './core/format';
import { store } from './core/store';
import { clock, dayLabel } from './core/time';
import { renderAll } from './ui/all';
import { clearDeckKeys, deckKeys, renderDeck } from './ui/deck';
import { renderDetails } from './ui/details';
import { renderNight, resetNightScope, upcomingCount } from './ui/night';
import { renderOps } from './ui/ops';
import { openSettings } from './ui/settings';
import { artworkAsset } from './posters/artwork';
import { fitDom, replaceArtworkWithFallback } from './posters/fit';

// Capture even cached failures. The inert sibling holds the complete image-free
// composition, not a hole where an unavailable subject used to be.
document.addEventListener('error', (ev) => {
  const img = ev.target;
  if (!(img instanceof HTMLImageElement)) return;
  const asset = artworkAsset(img.dataset.artwork);
  if (!asset || !asset.src.startsWith('/artwork/') || img.getAttribute('src') !== asset.src) return;
  const poster = img.closest<HTMLElement>('.poster');
  const plain = poster && replaceArtworkWithFallback(poster, 'load');
  if (plain?.parentElement) fitDom(plain.parentElement);
}, true);

const app = new App();
const main = document.getElementById('main')!;
const banner = document.getElementById('banner')!;
const settingsBtn = document.querySelector<HTMLButtonElement>('.settings-btn')!;
let current = '';

function renderBanner() {
  if (!app.demo) {
    const state = app.loading ? 'Loading live events…' : app.error ?? (app.isStale() ? 'Feed may be stale — check the original listing.' : '');
    banner.innerHTML = state ? `<p class="${app.isStale() ? 'stale' : 'feed-note'}" role="status">${esc(state)}</p>` : '';
    return;
  }
  banner.innerHTML = app.isStale()
    ? `<p class="stale" role="status">${navigator.onLine ? 'Couldn’t refresh' : 'You’re offline'} — showing events as of ${esc(dayLabel(app.fetchedAt.slice(0, 10)).toLowerCase())} ${clock(app.fetchedAt)}. Check the listing before you go.</p>`
    : '';
}

function route() {
  const hash = location.hash.replace(/^#\/?/, '');
  const [name, arg] = hash.split('/');
  const view = ['night', 'all', 'event', 'ops'].includes(name) ? name : 'deck';
  let eventId = '';
  if (view === 'event') {
    try { eventId = decodeURIComponent(arg ?? ''); } catch { /* Malformed route: no matching event. */ }
  }
  const changedView = view !== current;
  if (changedView && view === 'night' && current !== 'event') resetNightScope();
  current = view;
  clearDeckKeys();
  main.className = `view-${view}`;
  document.body.dataset.view = view;
  renderBanner();

  const rerender = () => route();
  if (!app.demo && !app.collectedAt && (view === 'deck' || view === 'all' || (view === 'event' && !store.isSaved(eventId)))) {
    main.innerHTML = `<div class="empty" role="status"><h1 class="display">${app.loading ? 'Loading live events…' : 'Live events unavailable'}</h1><p>${app.loading ? 'Fetching the latest source snapshot.' : 'No snapshot has loaded. Please try again later.'}</p></div>`;
    return;
  }
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
      renderDetails(app, main, eventId, rerender);
      document.title = `${app.byId.get(eventId)?.title ?? 'Event'} · Prague Tonight`;
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
let pendingRefresh = false;
const interactionOpen = () => app.busy || !!document.querySelector('.sheet-backdrop, dialog[open]');
async function refreshFeed() {
  await app.refresh();
  if (interactionOpen()) pendingRefresh = true;
  else { pendingRefresh = false; refreshInPlace(); }
}
window.addEventListener('online', () => void refreshFeed());
window.addEventListener('offline', () => {
  if (interactionOpen()) pendingRefresh = true;
  else refreshInPlace();
});

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
    if (app.demo) location.hash = '#/ops';
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
  if (interactionOpen()) return;
  if (pendingRefresh) { pendingRefresh = false; refreshInPlace(); return; }
  if (nightRolled) route();
  else if (current !== 'deck' && current !== 'ops') refreshInPlace();
}, 30_000);
document.body.dataset.night = app.tonight;

route();
if (!app.demo) {
  void refreshFeed();
  setInterval(() => void refreshFeed(), 15 * 60_000);
}

// Reveal once the first view is laid out and its fonts are in: no unstyled
// frame, no fallback-face flash. The cap keeps a slow font from blocking.
requestAnimationFrame(() => {
  const reveal = () => document.documentElement.classList.remove('booting');
  void Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 1500))]).then(reveal, reveal);
});
