import type { App } from '../app';
import type { PragueEvent } from '../types';
import { stillDeckable } from '../core/curate';
import { applyFilters, filterCount } from '../core/filters';
import { esc } from '../core/format';
import { store } from '../core/store';
import { renderPoster, star } from '../posters/render';
import { fitDom } from '../posters/fit';
import { icon, toast } from './common';
import { attachSwipe, flyOut, type Direction } from './swipe';
import { openFilters } from './filters';

export function windowSwitch(app: App, onChange: () => void): HTMLElement {
  const el = document.createElement('div');
  el.className = 'windows';
  el.setAttribute('role', 'group');
  el.setAttribute('aria-label', 'Time window');
  el.innerHTML = app.windows
    .map(
      (w) => `<button type="button" class="win ${w.id === app.win ? 'on' : ''}" aria-pressed="${w.id === app.win}" data-win="${w.id}">
        <span class="win-label">${esc(w.label)}</span><span class="win-date">${esc(w.dateLabel)}</span></button>`,
    )
    .join('');
  el.querySelectorAll<HTMLButtonElement>('[data-win]').forEach((b) =>
    b.addEventListener('click', () => {
      app.win = b.dataset.win as App['win'];
      onChange();
    }),
  );
  return el;
}

export function renderDeck(app: App, root: HTMLElement, rerender: () => void) {
  const cur = app.curation();
  const key = app.windowKey();
  const decisions = store.decisions(key);
  const live = cur.deck.filter((e) => stillDeckable(e, app.now));
  const { items: deck, hiddenUnknownPrice } = applyFilters(live, app.filters);
  const savedIds = new Set(store.saves().map((s) => s.id));
  const remaining = deck.filter((e) => !decisions[e.id] && !savedIds.has(e.id));
  const nFilters = filterCount(app.filters);
  const canUndo = app.undo.some((u) => u.windowKey === key);

  root.innerHTML = '';
  root.append(windowSwitch(app, rerender));

  const bar = document.createElement('div');
  bar.className = 'deck-bar';
  const pos = deck.length - remaining.length + 1;
  bar.innerHTML = `
    <span class="progress" aria-live="polite">${remaining.length ? `<b>${String(pos).padStart(2, '0')}</b> / ${String(deck.length).padStart(2, '0')}` : `${deck.length} seen`}</span>
    <span class="grow"></span>
    <button type="button" class="chip" data-act="undo" ${canUndo ? '' : 'disabled'} aria-label="Undo last swipe">${icon.undo}<span>Undo</span></button>
    <button type="button" class="chip ${nFilters ? 'chip-on' : ''}" data-act="filters">${icon.sliders}<span>Filters${nFilters ? ` · ${nFilters}` : ''}</span></button>
    <a class="chip" href="#/all">${icon.list}<span>All ${cur.index.length}</span></a>`;
  root.append(bar);
  bar.querySelector('[data-act=filters]')!.addEventListener('click', () => openFilters(app, cur.index, rerender));
  bar.querySelector('[data-act=undo]')!.addEventListener('click', () => undo(app, rerender));

  if (!deck.length) {
    root.append(emptyState(app, live.length > 0, hiddenUnknownPrice, rerender));
    return;
  }
  if (!remaining.length) {
    root.append(endOfDeck(app, decisions, rerender));
    return;
  }

  // The frame takes whatever height is left; the stack keeps 5:7 inside it.
  const frame = document.createElement('div');
  frame.className = 'stack-frame';
  const stack = document.createElement('div');
  stack.className = 'stack';
  frame.append(stack);
  const [top, next] = remaining;
  if (next) {
    const n = document.createElement('div');
    n.className = 'card next';
    n.setAttribute('aria-hidden', 'true');
    n.innerHTML = renderPoster(next, cur.family.get(next.id)!).html;
    stack.append(n);
  }
  const card = document.createElement('div');
  card.className = 'card top';
  card.tabIndex = 0;
  card.setAttribute('role', 'group');
  card.setAttribute('aria-roledescription', 'poster');
  card.setAttribute('aria-label', `${top.title}. Swipe right or press → to save, ← to pass, Enter for details.`);
  card.innerHTML = `${renderPoster(top, cur.family.get(top.id)!).html}
    <div class="stamp stamp-save" aria-hidden="true">SAVE ${star()}</div>
    <div class="stamp stamp-pass" aria-hidden="true">PASS</div>`;
  stack.append(card);
  root.append(frame);

  let committed = false;
  const commit = (dir: Direction) => {
    if (committed) return;
    committed = true;
    refocusCard = document.activeElement === card;
    flyOut(card, dir, () => decide(app, top, dir === 'right' ? 'save' : 'pass', rerender));
  };
  attachSwipe(card, {
    onCommit: (dir) => commit(dir),
    onTap: () => openDetails(app, top),
    onDragState: (d) => (app.busy = d),
  });

  if (!store.hintSeen()) {
    const hint = document.createElement('p');
    hint.className = 'hint';
    hint.innerHTML = `<span>← Pass</span><span>Tap for details</span><span>Save →</span>`;
    root.append(hint);
  }

  const controls = document.createElement('div');
  controls.className = 'controls';
  controls.innerHTML = `
    <button type="button" class="ctl ctl-pass" aria-label="Pass" title="Pass (←)">${icon.x}<span>Pass</span></button>
    <button type="button" class="ctl ctl-info" aria-label="Details" title="Details (Enter)">${icon.info}<span>Details</span></button>
    <button type="button" class="ctl ctl-save" aria-label="Save to My Night" title="Save (→)">${icon.heart}<span>Save</span></button>`;
  root.append(controls);
  controls.querySelector('.ctl-pass')!.addEventListener('click', () => commit('left'));
  controls.querySelector('.ctl-save')!.addEventListener('click', () => commit('right'));
  controls.querySelector('.ctl-info')!.addEventListener('click', () => openDetails(app, top));

  if (refocusCard) {
    refocusCard = false;
    card.focus({ preventScroll: true });
  }

  deckKeys = (ev: KeyboardEvent) => {
    if (ev.repeat) return;
    if (ev.key === 'ArrowLeft') commit('left');
    else if (ev.key === 'ArrowRight') commit('right');
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

function decide(app: App, e: PragueEvent, action: 'save' | 'pass', rerender: () => void) {
  const key = app.windowKey();
  store.decide(key, e.id, action);
  store.markHintSeen();
  if (action === 'save') {
    store.save(e, app.familyOf(e), app.now);
    toast(`Saved to My Night`);
    document.querySelector('.nav-night')?.classList.add('pulse');
    setTimeout(() => document.querySelector('.nav-night')?.classList.remove('pulse'), 600);
  }
  app.undo.push({ windowKey: key, id: e.id, action });
  rerender();
}

function undo(app: App, rerender: () => void) {
  const key = app.windowKey();
  const idx = app.undo.map((u) => u.windowKey).lastIndexOf(key);
  if (idx < 0) return;
  const [u] = app.undo.splice(idx, 1);
  store.decide(key, u.id, null);
  if (u.action === 'save') store.unsave(u.id);
  toast(u.action === 'save' ? 'Save undone' : 'Pass undone');
  rerender();
}

function emptyState(app: App, filteredOut: boolean, hiddenUnknownPrice: number, rerender: () => void): HTMLElement {
  const el = document.createElement('div');
  el.className = 'empty';
  if (filteredOut) {
    el.innerHTML = `<h2 class="display">No posters match.</h2>
      <p>Nothing in the ${esc(app.window.label.toLowerCase())} deck fits these filters.${hiddenUnknownPrice ? ` ${hiddenUnknownPrice} event${hiddenUnknownPrice > 1 ? 's are' : ' is'} hidden only because the price isn’t confirmed.` : ''}</p>
      <div class="row"><button type="button" class="btn" data-act="reset">Clear filters</button><a class="btn btn-ghost" href="#/all">Browse all events</a></div>`;
    el.querySelector('[data-act=reset]')!.addEventListener('click', () => {
      app.filters = { price: 'any', includeUnknownPrice: false, moods: [], district: '' };
      store.setFilters(app.filters);
      rerender();
    });
  } else {
    el.innerHTML = `<h2 class="display">Nothing listed yet.</h2>
      <p>We don’t have confirmed events for ${esc(app.window.dateLabel)} yet. This is missing data, not a quiet city.</p>
      <div class="row"><a class="btn" href="#/all">Check all events</a></div>`;
  }
  return el;
}

function endOfDeck(app: App, decisions: Record<string, 'save' | 'pass'>, rerender: () => void): HTMLElement {
  const passes = Object.values(decisions).filter((d) => d === 'pass').length;
  const other = app.windows.find((w) => w.id !== app.win)!;
  const savedHere = store.saves().filter((s) => app.window.nights.includes(s.night)).length;
  const el = document.createElement('div');
  el.className = 'end';
  el.innerHTML = `
    <div class="end-sun" aria-hidden="true">${star('#191919', '38%')}</div>
    <h2 class="display">You’ve seen<br>the deck.</h2>
    <p>${savedHere ? `${savedHere} saved for ${esc(app.window.label.toLowerCase())}. Your plan is in My Night.` : 'Nothing saved yet. The full list has more than the deck.'}</p>
    <a class="btn btn-wide" href="#/night">View My Night ${icon.out}</a>
    <div class="row links">
      <a href="#/all">Browse all ${app.curation().index.length}</a>
      ${passes ? `<button type="button" class="link" data-act="review">Review ${passes} pass${passes > 1 ? 'es' : ''}</button>` : ''}
      <button type="button" class="link" data-act="switch">Switch to ${esc(other.label.toLowerCase())}</button>
    </div>`;
  el.querySelector('[data-act=review]')?.addEventListener('click', () => {
    store.clearPasses(app.windowKey());
    app.undo = app.undo.filter((u) => !(u.windowKey === app.windowKey() && u.action === 'pass'));
    rerender();
  });
  el.querySelector('[data-act=switch]')!.addEventListener('click', () => {
    app.win = other.id;
    rerender();
  });
  return el;
}
