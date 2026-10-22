import type { App } from '../app';
import type { Mood, Span } from '../types';
import { stillDeckable } from '../core/curate';
import { applyFilters } from '../core/filters';
import { esc, MOOD_LABEL } from '../core/format';
import { DEFAULT_FILTERS, store, type Filters } from '../core/store';
import { SPANS, windowFor } from '../core/time';
import { startOver } from './deck';

const PRICES: [Filters['price'], string][] = [
  ['any', 'Any'],
  ['free', 'Free'],
  ['under300', 'Under 300 Kč'],
];

const SPAN_SHORT: Record<Span, string> = { 1: 'Tonight', 3: '3 days', 7: '7 days' };

let open = false;

/**
 * The one settings surface: how far ahead, what kind, price, area. Changes
 * apply when the sheet closes with the main button; Escape or a tap outside
 * discards them.
 */
export function openSettings(app: App, onApply: () => void) {
  if (open) return;
  open = true;
  const prevFocus = document.activeElement as HTMLElement | null;
  let span: Span = app.span;
  let f: Filters = structuredClone(app.filters);
  const districts = [
    ...new Set(app.curation(7).index.map((e) => e.venue?.district).filter(Boolean) as string[]),
  ].sort((a, b) => a.localeCompare(b, 'cs'));

  const overlay = document.createElement('div');
  overlay.className = 'sheet-backdrop';
  overlay.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="s-title" tabindex="-1">
    <div class="grip" aria-hidden="true"></div>
    <div class="sheet-body">
      <h2 id="s-title" class="sheet-title">Settings</h2>

      <fieldset class="when"><legend>When</legend>
        <input type="range" id="s-span" min="0" max="${SPANS.length - 1}" step="1" value="${SPANS.indexOf(span)}" aria-valuetext="">
        <div class="ticks">${SPANS.map((s, i) => `<button type="button" data-span="${i}">${SPAN_SHORT[s]}</button>`).join('')}</div>
        <p class="when-dates"></p>
      </fieldset>

      <fieldset><legend>What</legend><div class="opts">
        ${(Object.keys(MOOD_LABEL) as Mood[]).map((m) => `<button type="button" class="opt" data-mood="${m}">${MOOD_LABEL[m]}</button>`).join('')}
      </div></fieldset>

      <fieldset><legend>Price</legend><div class="opts">
        ${PRICES.map(([v, l]) => `<button type="button" class="opt" data-price="${v}">${l}</button>`).join('')}
      </div>
      <label class="check" hidden><input type="checkbox" data-unknown> Include events without a confirmed price</label>
      </fieldset>

      <fieldset><legend><label for="s-district">Where</label></legend>
        <select id="s-district" class="select">
          <option value="">Anywhere in Prague</option>
          ${districts.map((d) => `<option value="${esc(d)}">${esc(d)}</option>`).join('')}
        </select>
      </fieldset>

      <button type="button" class="btn btn-wide" data-act="apply"></button>
      <div class="sheet-links">
        <button type="button" class="link" data-act="again"></button>
        <button type="button" class="link" data-act="all">All events as a list</button>
        <button type="button" class="link" data-act="clear">Reset settings</button>
      </div>
    </div></div>`;
  document.body.append(overlay);
  const shell = document.getElementById('shell');
  shell?.setAttribute('inert', '');
  const body = overlay.querySelector<HTMLElement>('.sheet-body')!;
  const range = body.querySelector<HTMLInputElement>('#s-span')!;
  const district = body.querySelector<HTMLSelectElement>('#s-district')!;
  const unknown = body.querySelector<HTMLInputElement>('[data-unknown]')!;

  const close = (apply: boolean, then?: () => void) => {
    if (apply) {
      // Undo only makes sense within the deck it was made in.
      if (span !== app.span || JSON.stringify(f) !== JSON.stringify(app.filters)) app.undo = [];
      app.setSpan(span);
      app.filters = f;
      store.setFilters(f);
    }
    overlay.remove();
    shell?.removeAttribute('inert');
    document.removeEventListener('keydown', onKey);
    open = false;
    then?.();
    if (apply) onApply();
    prevFocus?.focus({ preventScroll: true });
  };
  const onKey = (ev: KeyboardEvent) => {
    if (ev.key === 'Escape') close(false);
  };
  document.addEventListener('keydown', onKey);
  overlay.addEventListener('click', (ev) => {
    if (ev.target === overlay) close(false);
  });

  /** Update in place so the slider keeps its drag. */
  const update = () => {
    const w = windowFor(app.now, span);
    range.value = String(SPANS.indexOf(span));
    range.style.setProperty('--fill', `${(SPANS.indexOf(span) / (SPANS.length - 1)) * 100}%`);
    range.setAttribute('aria-valuetext', `${w.label}, ${w.dateLabel}`);
    body.querySelectorAll<HTMLButtonElement>('[data-span]').forEach((b) => b.classList.toggle('on', SPANS[Number(b.dataset.span)] === span));
    body.querySelector('.when-dates')!.textContent = w.dateLabel;
    body.querySelectorAll<HTMLButtonElement>('[data-mood]').forEach((b) => {
      const on = f.moods.includes(b.dataset.mood as Mood);
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
    });
    body.querySelectorAll<HTMLButtonElement>('[data-price]').forEach((b) => {
      const on = f.price === b.dataset.price;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
    });
    unknown.closest('label')!.hidden = f.price === 'any';
    unknown.checked = f.includeUnknownPrice;
    district.value = f.district;

    const cur = app.curation(span);
    const decisions = store.decisions();
    const saved = new Set(store.saves().map((s) => s.id));
    const live = applyFilters(cur.deck.filter((e) => stillDeckable(e, app.now)), f).items;
    const fresh = live.filter((e) => !decisions[e.id] && !saved.has(e.id)).length;
    body.querySelector('[data-act=apply]')!.textContent = fresh ? `Show ${fresh} card${fresh === 1 ? '' : 's'}` : live.length ? 'Done' : 'No cards match';

    const passes = cur.deck.filter((e) => decisions[e.id] === 'pass').length;
    const again = body.querySelector<HTMLButtonElement>('[data-act=again]')!;
    again.hidden = !passes;
    again.textContent = `Start over (${passes} passed)`;
  };

  range.addEventListener('input', () => {
    span = SPANS[Number(range.value)];
    update();
  });
  body.querySelectorAll<HTMLButtonElement>('[data-span]').forEach((b) =>
    b.addEventListener('click', () => {
      span = SPANS[Number(b.dataset.span)];
      update();
    }),
  );
  body.querySelectorAll<HTMLButtonElement>('[data-mood]').forEach((b) =>
    b.addEventListener('click', () => {
      const m = b.dataset.mood as Mood;
      f.moods = f.moods.includes(m) ? f.moods.filter((x) => x !== m) : [...f.moods, m];
      update();
    }),
  );
  body.querySelectorAll<HTMLButtonElement>('[data-price]').forEach((b) =>
    b.addEventListener('click', () => {
      f.price = b.dataset.price as Filters['price'];
      update();
    }),
  );
  unknown.addEventListener('change', () => {
    f.includeUnknownPrice = unknown.checked;
    update();
  });
  district.addEventListener('change', () => {
    f.district = district.value;
    update();
  });
  body.querySelector('[data-act=apply]')!.addEventListener('click', () => close(true));
  body.querySelector('[data-act=clear]')!.addEventListener('click', () => {
    span = 1;
    f = structuredClone(DEFAULT_FILTERS);
    update();
  });
  body.querySelector('[data-act=again]')!.addEventListener('click', () =>
    close(true, () => {
      startOver(app);
      if (!location.hash.match(/^#?\/?$/)) location.hash = '#/';
    }),
  );
  body.querySelector('[data-act=all]')!.addEventListener('click', () =>
    close(true, () => {
      app.inAppNavs++;
      location.hash = '#/all';
    }),
  );

  update();
  overlay.querySelector<HTMLElement>('.sheet')!.focus({ preventScroll: true });
}
