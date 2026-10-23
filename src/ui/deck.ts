import type { App, Swipe } from '../app';
import type { FamilyId, PragueEvent } from '../types';
import type { ArtworkToken } from '../posters/assets';
import { stillDeckable } from '../core/curate';
import { applyFilters } from '../core/filters';
import { esc } from '../core/format';
import { hash } from '../core/rng';
import { store } from '../core/store';
import { SPANS } from '../core/time';
import { renderPoster, star } from '../posters/render';
import { fitDom } from '../posters/fit';
import { icon } from './common';
import { attachSwipe, flyOut, type Direction } from './swipe';
import { openSettings } from './settings';

/** Stamp words, picked per card so the same card always says the same thing. */
const WORDS: Record<Direction, string[]> = {
  right: ['GROOVY', 'GENIUS', 'AWESOME', 'YES PLEASE', 'OH YEAH', 'DIG IT', 'LET’S GO', 'SOLD', 'HECK YES', 'RAD'],
  left: ['NAH', 'NO WAY', 'BUZZ OFF', 'NOPE', 'MEH', 'HARD PASS', 'PFFT', 'NEXT', 'SNOOZE', 'NOT ME'],
  up: ['OBSESSED', 'MUST GO', 'SWOON', 'TOP PICK', 'BIG YES', 'IN LOVE', 'ICONIC'],
};

const word = (id: string, dir: Direction) => WORDS[dir][hash(`${id}:${dir}`) % WORDS[dir].length];

const ACTION: Record<Direction, Swipe> = { right: 'save', left: 'pass', up: 'super' };

/** The card that was just undone flies back in from where it left. */
let returning: { id: string; from: Direction } | null = null;

interface DeckCard {
  event: PragueEvent;
  family: FamilyId;
  artwork: ArtworkToken;
  element: HTMLElement;
}

interface DeckView {
  frame: HTMLElement;
  stack: HTMLElement;
  controls: HTMLElement;
  cards: Map<string, DeckCard>;
}

const deckViews = new WeakMap<HTMLElement, DeckView>();
let detachSwipe: (() => void) | null = null;

function deckView(root: HTMLElement): DeckView {
  const previous = deckViews.get(root);
  if (previous?.frame.parentElement === root) return previous;
  const frame = document.createElement('div');
  frame.className = 'stack-frame';
  const stack = document.createElement('div');
  stack.className = 'stack';
  const controls = document.createElement('div');
  controls.className = 'controls';
  root.replaceChildren(frame, controls);
  const view = { frame, stack, controls, cards: new Map<string, DeckCard>() };
  deckViews.set(root, view);
  return view;
}

function deckCard(view: DeckView, e: PragueEvent, family: FamilyId, artwork: ArtworkToken): HTMLElement {
  const previous = view.cards.get(e.id);
  if (previous?.event === e && previous.family === family && previous.artwork === artwork) return previous.element;
  previous?.element.remove();
  const card = document.createElement('div');
  card.className = 'card';
  card.dataset.eventId = e.id;
  card.setAttribute('role', 'group');
  card.setAttribute('aria-roledescription', 'poster');
  card.setAttribute('aria-label', `${e.title}. Tap for details. Right arrow saves, left passes, up marks a favorite.`);
  card.innerHTML = `${renderPoster(e, family, artwork).html}
    <div class="stamp stamp-save" aria-hidden="true"><span>${esc(word(e.id, 'right'))}</span></div>
    <div class="stamp stamp-pass" aria-hidden="true"><span>${esc(word(e.id, 'left'))}</span></div>
    <div class="stamp stamp-super" aria-hidden="true"><span>${star('currentColor', '0.8em')} ${esc(word(e.id, 'up'))}</span></div>`;
  view.cards.set(e.id, { event: e, family, artwork, element: card });
  view.stack.append(card);
  // Fit once, including the hidden look-ahead card, before it reaches the front.
  void document.fonts.ready.then(() => {
    if (card.isConnected) fitDom(card);
  });
  return card;
}

export function renderDeck(app: App, root: HTMLElement, rerender: () => void) {
  detachSwipe?.();
  detachSwipe = null;
  const cur = app.curation();
  const decisions = store.decisions();
  const live = cur.deck.filter((e) => stillDeckable(e, app.now));
  const { items: deck, hiddenUnknownPrice } = applyFilters(live, app.filters);
  const savedIds = new Set(store.saves().map((s) => s.id));
  const remaining = deck.filter((e) => !decisions[e.id] && !savedIds.has(e.id));
  const [top] = remaining;
  const view = deckView(root);
  const { frame, stack, controls } = view;
  controls.innerHTML = `
    <button type="button" class="ctl ctl-undo" aria-label="Undo" title="Undo (U)" ${app.undo.length ? '' : 'disabled'}>${icon.undo}</button>
    <button type="button" class="ctl ctl-pass" aria-label="Pass" title="Pass (←)" ${top ? '' : 'disabled'}>${icon.x}</button>
    <button type="button" class="ctl ctl-save" aria-label="Save to My Night" title="Save (→)" ${top ? '' : 'disabled'}>${icon.heartFill}</button>
    <button type="button" class="ctl ctl-super" aria-label="Favorite" title="Favorite (↑)" ${top ? '' : 'disabled'}>${star('currentColor', '1em')}</button>`;
  controls.querySelector('.ctl-undo')!.addEventListener('click', () => undo(app, rerender));

  if (!top) {
    stack.replaceChildren();
    view.cards.clear();
    frame.replaceChildren(deck.length ? endOfDeck(app, decisions, rerender) : emptyState(app, live.length > 0, hiddenUnknownPrice, rerender));
    deckKeys = (ev) => {
      if (ev.key.toLowerCase() === 'u' || ev.key === 'Backspace') {
        ev.preventDefault();
        undo(app, rerender);
      }
    };
    return;
  }

  if (stack.parentElement !== frame) frame.replaceChildren(stack);
  // Keep two visible cards and one fitted look-ahead. Promotion changes classes,
  // not DOM identity, so the browser can retain the existing poster's rendering.
  const upcoming = remaining.slice(0, 3);
  const ids = new Set(upcoming.map((e) => e.id));
  for (const [id, cached] of view.cards) {
    if (ids.has(id)) continue;
    cached.element.remove();
    view.cards.delete(id);
  }
  const cards = upcoming.map((e, i) => {
    const card = deckCard(view, e, cur.family.get(e.id)!, app.artworkOf(e));
    card.className = `card ${i === 0 ? 'top' : i === 1 ? 'next' : 'preload'}`;
    card.style.removeProperty('transition');
    card.style.removeProperty('transform');
    card.style.removeProperty('opacity');
    card.querySelectorAll<HTMLElement>('.stamp').forEach((stamp) => stamp.style.removeProperty('opacity'));
    card.tabIndex = i === 0 ? 0 : -1;
    card.inert = i !== 0;
    if (i === 0) card.removeAttribute('aria-hidden');
    else card.setAttribute('aria-hidden', 'true');
    return card;
  });
  const card = cards[0];
  if (returning?.id === top.id) card.classList.add(`return-${returning.from}`);
  returning = null;

  let committed = false;
  const commit = (dir: Direction, fromButton = false) => {
    if (committed) return;
    committed = true;
    detachSwipe?.();
    detachSwipe = null;
    app.busy = true;
    refocusCard = document.activeElement === card;
    controls.querySelectorAll('button').forEach((b) => (b.disabled = true));
    flyOut(
      card,
      dir,
      () => {
        app.busy = false;
        decide(app, top, ACTION[dir], dir, rerender);
      },
      fromButton,
    );
  };
  detachSwipe = attachSwipe(card, {
    onCommit: (dir) => commit(dir),
    onTap: () => committed || openDetails(app, top),
    onDragState: (d) => (app.busy = d),
  });
  controls.querySelector('.ctl-pass')!.addEventListener('click', () => commit('left', true));
  controls.querySelector('.ctl-super')!.addEventListener('click', () => commit('up', true));
  controls.querySelector('.ctl-save')!.addEventListener('click', () => commit('right', true));

  if (refocusCard) {
    refocusCard = false;
    card.focus({ preventScroll: true });
  }

  deckKeys = (ev: KeyboardEvent) => {
    if (ev.repeat || committed) return;
    if (ev.key === 'ArrowLeft') commit('left', true);
    else if (ev.key === 'ArrowRight') commit('right', true);
    else if (ev.key === 'ArrowUp') commit('up', true);
    else if (ev.key === 'Enter' && document.activeElement === card) openDetails(app, top);
    else if (ev.key.toLowerCase() === 'u' || ev.key === 'Backspace') undo(app, rerender);
    else return;
    ev.preventDefault();
  };
}

/** Keep keyboard focus on the deck card across swipes. */
let refocusCard = false;

/** Active keyboard handler for the deck; main.ts routes keys here. */
export let deckKeys: ((ev: KeyboardEvent) => void) | null = null;
export function clearDeckKeys() {
  deckKeys = null;
  detachSwipe?.();
  detachSwipe = null;
}

function openDetails(app: App, e: PragueEvent) {
  app.inAppNavs++;
  location.hash = `#/event/${encodeURIComponent(e.id)}`;
}

function decide(app: App, e: PragueEvent, action: Swipe, dir: Direction, rerender: () => void) {
  if (action === 'pass') store.decide(e.id, 'pass');
  else {
    app.save(e, action === 'super');
    const nav = document.querySelector('.nav-night');
    nav?.classList.add('pulse');
    setTimeout(() => nav?.classList.remove('pulse'), 600);
  }
  app.undo.push({ id: e.id, action });
  undoDir.set(e.id, dir);
  rerender();
}

const undoDir = new Map<string, Direction>();

function undo(app: App, rerender: () => void) {
  const u = app.undo.pop();
  if (!u) return;
  if (u.action === 'pass') store.decide(u.id, null);
  else app.unsave(u.id);
  returning = { id: u.id, from: undoDir.get(u.id) ?? 'left' };
  rerender();
}

function emptyState(app: App, filteredOut: boolean, hiddenUnknownPrice: number, rerender: () => void): HTMLElement {
  const el = document.createElement('div');
  el.className = 'empty';
  const wider = SPANS.find((s) => s > app.span);
  if (filteredOut) {
    el.innerHTML = `<h2 class="display">No matches.</h2>
      <p>Nothing ${app.span === 1 ? 'tonight' : `in the ${esc(app.window.label.toLowerCase())}`} fits your settings.${hiddenUnknownPrice ? ` ${hiddenUnknownPrice} event${hiddenUnknownPrice > 1 ? 's have' : ' has'} no confirmed price yet.` : ''}</p>
      <div class="row"><button type="button" class="btn" data-act="settings">Change settings</button></div>`;
    el.querySelector('[data-act=settings]')!.addEventListener('click', () => openSettings(app, rerender));
  } else {
    el.innerHTML = `<h2 class="display">Nothing listed yet.</h2>
      <p>We don’t have confirmed events for ${esc(app.window.dateLabel)} yet.</p>
      <div class="row">${wider ? `<button type="button" class="btn" data-act="wider">Look further ahead</button>` : `<a class="btn" href="#/all">All events</a>`}</div>`;
    el.querySelector('[data-act=wider]')?.addEventListener('click', () => {
      app.setSpan(wider!);
      rerender();
    });
  }
  return el;
}

function endOfDeck(app: App, decisions: Record<string, 'save' | 'pass'>, rerender: () => void): HTMLElement {
  const passes = app.curation().deck.filter((e) => decisions[e.id] === 'pass').length;
  const saved = store.saves().filter((s) => app.window.nights.includes(s.night)).length;
  const wider = SPANS.find((s) => s > app.span);
  const el = document.createElement('div');
  el.className = 'end';
  el.innerHTML = `
    <div class="end-sun" aria-hidden="true">${star('#191919', '38%')}</div>
    <h2 class="display">That’s<br>everything.</h2>
    <p>${saved ? `${saved} saved for ${app.span === 1 ? 'tonight' : esc(app.window.label.toLowerCase())}.` : 'Nothing saved yet.'}</p>
    <a class="btn btn-wide" href="#/night">See My Night</a>
    <div class="row links">
      ${passes ? `<button type="button" class="link" data-act="again">Start over (${passes} passed)</button>` : ''}
      ${wider ? `<button type="button" class="link" data-act="wider">Look further ahead</button>` : ''}
      <a href="#/all">All events</a>
    </div>`;
  el.querySelector('[data-act=again]')?.addEventListener('click', () => {
    startOver(app);
    rerender();
  });
  el.querySelector('[data-act=wider]')?.addEventListener('click', () => {
    app.setSpan(wider!);
    rerender();
  });
  return el;
}

/** Bring back the passed cards in the current deck. Saves stay saved. */
export function startOver(app: App) {
  const ids = app.curation().deck.map((e) => e.id);
  store.clearPasses(ids);
  app.undo = app.undo.filter((u) => !(u.action === 'pass' && ids.includes(u.id)));
}
