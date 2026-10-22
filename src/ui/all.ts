import type { App } from '../app';
import { stillListable } from '../core/curate';
import { applyFilters, filterCount } from '../core/filters';
import { CATEGORY_LABEL, esc, MOOD_LABEL, placeText, priceText } from '../core/format';
import { DEFAULT_FILTERS, store } from '../core/store';
import { clock, dayLabel } from '../core/time';
import { icon } from './common';
import { openSettings } from './settings';

/** The dense, exhaustive index behind the curated deck. */
export function renderAll(app: App, root: HTMLElement, rerender: () => void) {
  const cur = app.curation();
  const index = cur.index.filter((e) => stillListable(e, app.now));
  const { items, hiddenUnknownPrice } = applyFilters(index, app.filters);
  const saved = new Set(store.saves().map((s) => s.id));
  const f = app.filters;
  const nf = filterCount(f);

  root.innerHTML = `
    <div class="page-head">
      <h1 class="display" tabindex="-1">All events</h1>
      <p class="sub">${esc(app.window.label)} · ${esc(app.window.dateLabel)} · ${items.length}${items.length !== index.length ? ` of ${index.length}` : ''}</p>
    </div>`;

  const bar = document.createElement('div');
  bar.className = 'filter-bar';
  const summary = [
    f.moods.length ? f.moods.map((m) => MOOD_LABEL[m]).join(' + ') : 'Any mood',
    f.price === 'any' ? 'Any price' : f.price === 'free' ? 'Free' : 'Under 300 Kč',
    f.district || 'Anywhere',
  ];
  if (!nf) summary.splice(0, 3, app.window.label, 'Everything');
  bar.innerHTML = `<button type="button" class="filter-summary ${nf ? 'chip-on' : ''}">${icon.sliders}<span>${summary.map(esc).join(' · ')}</span></button>
    ${nf ? '<button type="button" class="link" data-act="clear">Clear</button>' : ''}`;
  bar.querySelector('.filter-summary')!.addEventListener('click', () => openSettings(app, rerender));
  bar.querySelector('[data-act=clear]')?.addEventListener('click', () => {
    app.filters = structuredClone(DEFAULT_FILTERS);
    store.setFilters(app.filters);
    rerender();
  });
  root.append(bar);

  if (hiddenUnknownPrice) {
    root.insertAdjacentHTML('beforeend', `<p class="note warn">${hiddenUnknownPrice} event${hiddenUnknownPrice > 1 ? 's' : ''} hidden because the price isn’t confirmed. <button type="button" class="link" data-act="unknown">Show them</button></p>`);
    root.querySelector('[data-act=unknown]')!.addEventListener('click', () => {
      app.filters = { ...app.filters, includeUnknownPrice: true };
      store.setFilters(app.filters);
      rerender();
    });
  }

  if (!items.length) {
    root.insertAdjacentHTML(
      'beforeend',
      index.length
        ? `<div class="empty"><h2 class="display">No matches.</h2><p>There are ${index.length} events listed, but none fit these filters.</p></div>`
        : `<div class="empty"><h2 class="display">No events listed.</h2><p>We have no confirmed events for ${esc(app.window.dateLabel)} yet.</p></div>`,
    );
    return;
  }

  const list = document.createElement('ul');
  list.className = 'all-list';
  let lastNight = '';
  let ongoingHeader = false;
  for (const e of items) {
    if (!e.start && !ongoingHeader) {
      ongoingHeader = true;
      list.insertAdjacentHTML('beforeend', `<li class="group">Ongoing</li>`);
    } else if (e.start && app.window.nights.length > 1 && e.night !== lastNight) {
      lastNight = e.night!;
      list.insertAdjacentHTML('beforeend', `<li class="group">${esc(dayLabel(lastNight))}</li>`);
    }
    list.insertAdjacentHTML(
      'beforeend',
      `<li><a href="#/event/${encodeURIComponent(e.id)}" class="all-row">
        <span class="ar-time">${e.start ? clock(e.start) : '—'}</span>
        <span class="ar-body"><span class="ar-title">${esc(e.title)}</span>
        <span class="ar-meta">${esc(placeText(e))} · ${esc(priceText(e.price))} · ${esc(CATEGORY_LABEL[e.category])}${e.language ? ` · ${esc(e.language)}` : ''}</span></span>
        <span class="ar-flags">${saved.has(e.id) ? `<span class="saved-dot" title="Saved">${icon.heartFill}</span>` : ''}</span>
      </a></li>`,
    );
  }
  list.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => app.inAppNavs++));
  root.append(list);
}
