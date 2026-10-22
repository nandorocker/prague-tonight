import type { App, Swipe } from '../app';
import type { PragueEvent } from '../types';
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

export function renderDeck(app: App, root: HTMLElement, rerender: () => void) {
  const cur = app.curation();
  const decisions = store.decisions();
  const live = cur.deck.filter((e) => stillDeckable(e, app.now));
  const { items: deck, hiddenUnknownPrice } = applyFilters(live, app.filters);
  const savedIds = new Set(store.saves().map((s) => s.id));
  const remaining = deck.filter((e) => !decisions[e.id] && !savedIds.has(e.id));
  const [top, next] = remaining;

  root.innerHTML = '';
  const frame = document.createElement('div');
  frame.className = 'stack-frame';
  root.append(frame);

  const controls = document.createElement('div');
  controls.className = 'controls';
  controls.innerHTML = `
    <button type="button" class="ctl ctl-undo" aria-label="Undo" title="Undo (U)" ${app.undo.length ? '' : 'disabled'}>${icon.undo}</button>
    <button type="button" class="ctl ctl-pass" aria-label="Pass" title="Pass (←)" ${top ? '' : 'disabled'}>${icon.x}</button>
    <button type="button" class="ctl ctl-save" aria-label="Save to My Night" title="Save (→)" ${top ? '' : 'disabled'}>${icon.heartFill}</button>
    <button type="button" class="ctl ctl-super" aria-label="Favorite" title="Favorite (↑)" ${top ? '' : 'disabled'}>${star('currentColor', '1em')}</button>`;
  root.append(controls);
  controls.querySelector('.ctl-undo')!.addEventListener('click', () => undo(app, rerender));

  if (!top) {
    frame.append(deck.length ? endOfDeck(app, decisions, rerender) : emptyState(app, live.length > 0, hiddenUnknownPrice, rerender));
    deckKeys = (ev) => {
      if (ev.key.toLowerCase() === 'u' || ev.key === 'Backspace') {
        ev.preventDefault();
        undo(app, rerender);
      }
    };
    return;
  }

  // The frame takes whatever height is left; the stack keeps 5:7 inside it.
  const stack = document.createElement('div');
  stack.className = 'stack';
  frame.append(stack);
  if (next) {
    const n = document.createElement('div');
    n.className = 'card next';
    n.setAttribute('aria-hidden', 'true');
    n.innerHTML = renderPoster(next, cur.family.get(next.id)!).html;
    stack.append(n);
  }
  const card = document.createElement('div');
  card.className = 'card top';
  if (returning?.id === top.id) card.classList.add(`return-${returning.from}`);
  returning = null;
  card.tabIndex = 0;
  card.setAttribute('role', 'group');
  card.setAttribute('aria-roledescription', 'poster');
  card.setAttribute('aria-label', `${top.title}. Tap for details. Right arrow saves, left passes, up marks a favorite.`);
  card.innerHTML = `${renderPoster(top, cur.family.get(top.id)!).html}
    <div class="stamp stamp-save" aria-hidden="true"><span>${esc(word(top.id, 'right'))}</span></div>
    <div class="stamp stamp-pass" aria-hidden="true"><span>${esc(word(top.id, 'left'))}</span></div>
    <div class="stamp stamp-super" aria-hidden="true"><span>${star('currentColor', '0.8em')} ${esc(word(top.id, 'up'))}</span></div>`;
  stack.append(card);

  let committed = false;
  const commit = (dir: Direction, fromButton = false) => {
    if (committed) return;
    committed = true;
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
  attachSwipe(card, {
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

  void document.fonts.ready.then(() => fitDom(stack));
}

/** Keep keyboard focus on the deck card across swipes. */
let refocusCard = false;

/** Active keyboard handler for the deck; main.ts routes keys here. */
export let deckKeys: ((ev: KeyboardEvent) => void) | null = null;
export function clearDeckKeys() {
  deckKeys = null;
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
