import type { App } from '../app';
import type { PragueEvent, WindowDef } from '../types';
import { esc, priceText } from '../core/format';
import { store, type SavedItem } from '../core/store';
import { clock, dayLabel, isNightOver, wallMinutes } from '../core/time';
import { posterTitle } from '../posters/assign';
import { familyColor } from '../posters/render';
import { badges, icon, inkOn, statusOf, toast } from './common';
import { windowSwitch } from './deck';
import { PRAGUE_MAP, project } from './map';

interface Row {
  saved: SavedItem;
  e?: PragueEvent;
  start?: string;
}

function rowsFor(app: App, w: WindowDef): Row[] {
  return store
    .saves()
    .filter((s) => w.nights.includes(s.night) && !isNightOver(s.night, app.now))
    .map((saved) => {
      const e = app.byId.get(saved.id);
      return { saved, e, start: e?.start ?? saved.snap.start };
    })
    .sort(
      (a, b) =>
        a.saved.night.localeCompare(b.saved.night) ||
        (a.start ? 0 : 1) - (b.start ? 0 : 1) ||
        (a.start && b.start ? wallMinutes(a.start) - wallMinutes(b.start) : 0),
    );
}

export function renderNight(app: App, root: HTMLElement, mode: 'list' | 'map', rerender: () => void) {
  const w = app.window;
  const rows = rowsFor(app, w);
  const counts = app.windows.map((x) => rowsFor(app, x).length);
  root.innerHTML = `
    <div class="page-head">
      <h1 class="display" tabindex="-1">My Night</h1>
      <p class="sub">${rows.length ? `${rows.length} saved` : 'Nothing saved'} · ${esc(w.dateLabel)}</p>
    </div>`;
  const sw = windowSwitch(app, rerender);
  sw.querySelectorAll<HTMLElement>('.win').forEach((b, i) => {
    b.querySelector('.win-date')!.insertAdjacentHTML('beforeend', counts[i] ? ` · ${icon.heartFill}${counts[i]}` : '');
  });
  root.append(sw);

  const tabs = document.createElement('div');
  tabs.className = 'tabs';
  tabs.innerHTML = `<a href="#/night" class="tab ${mode === 'list' ? 'on' : ''}" ${mode === 'list' ? 'aria-current="page"' : ''}>${icon.list} List</a>
    <a href="#/night/map" class="tab ${mode === 'map' ? 'on' : ''}" ${mode === 'map' ? 'aria-current="page"' : ''}>${icon.pin} Map</a>`;
  root.append(tabs);

  if (!rows.length) {
    root.insertAdjacentHTML(
      'beforeend',
      `<div class="empty"><h2 class="display">Nothing saved yet.</h2><p>Swipe right on a poster (or press Save) and it lands here, sorted by start time.</p><a class="btn" href="#/">Go to the deck</a></div>`,
    );
    return;
  }

  if (mode === 'map') {
    root.append(mapView(app, rows));
    return;
  }

  const list = document.createElement('div');
  list.className = 'night-list';
  let lastNight = '';
  for (const r of rows) {
    if (w.nights.length > 1 && r.saved.night !== lastNight) {
      lastNight = r.saved.night;
      list.insertAdjacentHTML('beforeend', `<h2 class="group">${esc(dayLabel(lastNight))}</h2>`);
    }
    list.append(rowEl(app, r, rerender));
  }
  root.append(list);
  root.insertAdjacentHTML(
    'beforeend',
    `<p class="note">Saved on this device only — no account needed. Saves leave this list after the night ends at 05:00.</p>`,
  );
}

function rowEl(app: App, r: Row, rerender: () => void): HTMLElement {
  const { e, saved } = r;
  const st = statusOf(e, saved, app.now);
  const color = e ? familyColor(e, saved.snap.family) : '#CFC7B2';
  const dead = st.some((s) => s.kind === 'ended' || s.kind === 'canceled' || s.kind === 'removed');
  const el = document.createElement('div');
  el.className = `night-row ${dead ? 'is-dead' : ''}`;
  const title = e ? posterTitle(e) : saved.snap.title;
  el.innerHTML = `
    <a class="nr-main" href="#/event/${encodeURIComponent(saved.id)}">
      <span class="nr-time" style="background:${color};color:${inkOn(color)}">${r.start ? clock(r.start) : '—'}</span>
      <span class="nr-body">
        <span class="nr-title">${esc(title)}</span>
        <span class="nr-meta">${esc(e?.venue?.district ?? saved.snap.place)} · ${esc(e ? priceText(e.price) : saved.snap.price)}${e?.venue?.name ? ` · ${esc(e.venue.name)}` : ''}</span>
        ${st.length ? `<span class="badges">${badges(st)}</span>` : ''}
      </span>
      <span class="nr-go" aria-hidden="true">${icon.out}</span>
    </a>
    <button type="button" class="nr-remove" aria-label="Remove ${esc(title)} from My Night">${icon.x}</button>`;
  el.querySelector('.nr-main')!.addEventListener('click', () => app.inAppNavs++);
  el.querySelector('.nr-remove')!.addEventListener('click', () => {
    const item = app.unsave(saved.id);
    toast('Removed from My Night', { label: 'Undo', run: () => (item && app.restore(item), rerender()) });
    rerender();
  });
  return el;
}

/** Remember the selected pin across the periodic status refresh. */
let mapSelected = 0;

function mapView(app: App, rows: Row[]): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'map-wrap';
  const pinned = rows.filter((r) => r.e?.venue?.lat !== undefined && r.e.venue.lon !== undefined);
  const unpinned = rows.filter((r) => !pinned.includes(r));
  const pins = pinned
    .map((r, i) => {
      const [x, y] = project(r.e!.venue!.lat!, r.e!.venue!.lon!);
      const dead = statusOf(r.e, r.saved, app.now).some((s) => ['ended', 'canceled', 'removed'].includes(s.kind));
      const color = dead ? '#B9B3A3' : familyColor(r.e!, r.saved.snap.family);
      return `<g class="pin" tabindex="0" role="button" data-i="${i}" aria-label="${i + 1}: ${esc(r.e!.title)}" transform="translate(${x.toFixed(1)} ${y.toFixed(1)})">
        <circle r="24" fill="${color}" stroke="#191919" stroke-width="2.5"/><text text-anchor="middle" dy="9" fill="${inkOn(color)}">${i + 1}</text></g>`;
    })
    .join('');
  wrap.innerHTML = `
    <div class="map" role="group" aria-label="Map of saved events">${PRAGUE_MAP(pins)}</div>
    <div class="map-card" aria-live="polite"></div>
    <ol class="map-legend">${pinned
      .map((r, i) => `<li><button type="button" data-i="${i}"><b>${i + 1}</b> ${r.start ? clock(r.start) : ''} · ${esc(posterTitle(r.e!))}</button></li>`)
      .join('')}</ol>
    ${
      unpinned.length
        ? `<div class="unmapped"><h2 class="group">Not on the map</h2><p class="note">These don’t have a verified location, so we don’t place a pin. Check the listing.</p>
          ${unpinned.map((r) => `<a href="#/event/${encodeURIComponent(r.saved.id)}">${r.start ? clock(r.start) : ''} · ${esc(r.e ? posterTitle(r.e) : r.saved.snap.title)} — ${esc(r.e?.venue?.name ?? r.saved.snap.place)} ${icon.out}</a>`).join('')}</div>`
        : ''
    }
    <p class="note">Schematic map. Pins only for saved events with verified coordinates.</p>`;

  const card = wrap.querySelector<HTMLElement>('.map-card')!;
  const select = (i: number) => {
    const r = pinned[i];
    wrap.querySelectorAll('.pin').forEach((p) => p.classList.toggle('on', p.getAttribute('data-i') === String(i)));
    mapSelected = i;
    const st = statusOf(r.e, r.saved, app.now);
    card.innerHTML = `<a href="#/event/${encodeURIComponent(r.saved.id)}"><b>${i + 1} · ${esc(posterTitle(r.e!))}</b>
      <span>${r.start ? clock(r.start) : ''} · ${esc(r.e!.venue!.district ?? '')} · ${esc(r.e!.venue!.name)} · Open detail ${icon.out}</span>
      ${st.length ? `<span class="badges">${badges(st)}</span>` : ''}</a>`;
  };
  wrap.querySelectorAll<HTMLElement>('[data-i]').forEach((p) => {
    const i = Number(p.dataset.i);
    p.addEventListener('click', () => select(i));
    p.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' || ev.key === ' ') {
        ev.preventDefault();
        select(i);
      }
    });
  });
  wrap.addEventListener('click', (ev) => {
    if ((ev.target as HTMLElement).closest('a[href^="#/event/"]')) app.inAppNavs++;
  });
  if (pinned.length) select(Math.min(mapSelected, pinned.length - 1));
  return wrap;
}
