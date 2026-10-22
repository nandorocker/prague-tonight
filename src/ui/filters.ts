import type { App } from '../app';
import type { Mood, PragueEvent } from '../types';
import { applyFilters } from '../core/filters';
import { esc, MOOD_LABEL } from '../core/format';
import { DEFAULT_FILTERS, store, type Filters } from '../core/store';

const PRICES: [Filters['price'], string][] = [
  ['any', 'Any'],
  ['free', 'Free'],
  ['under300', 'Under 300 Kč'],
];

/** A small bottom sheet: price, mood, neighborhood. Applies on close. */
export function openFilters(app: App, index: PragueEvent[], onApply: () => void, from: 'deck' | 'all' = 'deck') {
  const prevFocus = document.activeElement as HTMLElement | null;
  let f: Filters = structuredClone(app.filters);
  const districts = [...new Set(index.map((e) => e.venue?.district).filter(Boolean) as string[])].sort((a, b) =>
    a.localeCompare(b, 'cs'),
  );

  const overlay = document.createElement('div');
  overlay.className = 'sheet-backdrop';
  overlay.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="f-title"><div class="grip" aria-hidden="true"></div><div class="sheet-body"></div></div>`;
  document.body.append(overlay);
  const body = overlay.querySelector<HTMLElement>('.sheet-body')!;

  const close = (apply: boolean) => {
    if (apply) {
      app.filters = f;
      store.setFilters(f);
      onApply();
    }
    overlay.remove();
    document.removeEventListener('keydown', onKey);
    prevFocus?.focus();
  };
  const onKey = (ev: KeyboardEvent) => {
    if (ev.key === 'Escape') close(false);
  };
  document.addEventListener('keydown', onKey);
  overlay.addEventListener('click', (ev) => {
    if (ev.target === overlay) close(false);
  });

  const draw = () => {
    const focused = document.activeElement as HTMLElement | null;
    const focusKey = focused && body.contains(focused) ? ['price', 'mood', 'act'].map((k) => focused.dataset[k] && `[data-${k}="${focused.dataset[k]}"]`).find(Boolean) ?? (focused.id ? `#${focused.id}` : focused.hasAttribute('data-unknown') ? '[data-unknown]' : null) : null;
    const deck = applyFilters(app.curation().deck, f);
    const all = applyFilters(index, f);
    body.innerHTML = `
      <h2 id="f-title" class="display">Find your thing</h2>
      <fieldset><legend>Price</legend><div class="opts">
        ${PRICES.map(([v, l]) => `<button type="button" class="opt ${f.price === v ? 'on' : ''}" aria-pressed="${f.price === v}" data-price="${v}">${l}</button>`).join('')}
      </div>
      ${
        f.price !== 'any'
          ? `<label class="check"><input type="checkbox" data-unknown ${f.includeUnknownPrice ? 'checked' : ''}> Include events with unconfirmed price${all.hiddenUnknownPrice ? ` (${all.hiddenUnknownPrice} hidden)` : ''}</label>
             <p class="note">Some listings don’t publish a price. We don’t guess, so they’re hidden by a price filter unless you include them.</p>`
          : ''
      }
      </fieldset>
      <fieldset><legend>Mood</legend><div class="opts grid2">
        ${(Object.keys(MOOD_LABEL) as Mood[]).map((m) => `<button type="button" class="opt ${f.moods.includes(m) ? 'on accent' : ''}" aria-pressed="${f.moods.includes(m)}" data-mood="${m}">${MOOD_LABEL[m]}</button>`).join('')}
      </div></fieldset>
      <fieldset><legend><label for="f-district">Neighborhood</label></legend>
        <select id="f-district" class="select">
          <option value="">Anywhere in Prague</option>
          ${districts.map((d) => `<option value="${esc(d)}" ${f.district === d ? 'selected' : ''}>${esc(d)}</option>`).join('')}
        </select>
      </fieldset>
      <button type="button" class="btn btn-wide" data-act="apply">${
        from === 'deck'
          ? `Show ${deck.items.length} poster${deck.items.length === 1 ? '' : 's'} →`
          : `Show ${all.items.length} event${all.items.length === 1 ? '' : 's'} →`
      }</button>
      <p class="note center">${from === 'deck' ? `${all.items.length} of ${index.length} in All events` : `${deck.items.length} of ${app.curation().deck.length} posters in the deck`} · <button type="button" class="link" data-act="reset">Reset</button></p>`;

    body.querySelectorAll<HTMLButtonElement>('[data-price]').forEach((b) =>
      b.addEventListener('click', () => {
        f.price = b.dataset.price as Filters['price'];
        draw();
      }),
    );
    body.querySelectorAll<HTMLButtonElement>('[data-mood]').forEach((b) =>
      b.addEventListener('click', () => {
        const m = b.dataset.mood as Mood;
        f.moods = f.moods.includes(m) ? f.moods.filter((x) => x !== m) : [...f.moods, m];
        draw();
      }),
    );
    body.querySelector<HTMLInputElement>('[data-unknown]')?.addEventListener('change', (ev) => {
      f.includeUnknownPrice = (ev.target as HTMLInputElement).checked;
      draw();
    });
    body.querySelector<HTMLSelectElement>('#f-district')!.addEventListener('change', (ev) => {
      f.district = (ev.target as HTMLSelectElement).value;
      draw();
    });
    body.querySelector('[data-act=apply]')!.addEventListener('click', () => close(true));
    body.querySelector('[data-act=reset]')!.addEventListener('click', () => {
      f = structuredClone(DEFAULT_FILTERS);
      draw();
    });
    if (focusKey) body.querySelector<HTMLElement>(focusKey)?.focus();
  };
  draw();
  body.querySelector<HTMLElement>('button')?.focus();
}
