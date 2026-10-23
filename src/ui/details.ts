import type { App } from '../app';
import { CATEGORY_LABEL, esc, priceText } from '../core/format';
import { store } from '../core/store';
import { clock, dayLabel, weekdayShort } from '../core/time';
import { fitDom } from '../posters/fit';
import { renderPoster, star } from '../posters/render';
import { badges, icon, statusOf, toast } from './common';
import { artworkAsset } from '../posters/artwork';

function back(app: App) {
  if (app.inAppNavs > 0) {
    app.inAppNavs--;
    history.back();
  } else location.hash = '#/';
}

export function renderDetails(app: App, root: HTMLElement, id: string, rerender: () => void) {
  const e = app.byId.get(id);
  const saved = store.saves().find((s) => s.id === id);
  root.innerHTML = '';

  const head = document.createElement('div');
  head.className = 'subhead';
  head.innerHTML = `<button type="button" class="back" aria-label="Back">${icon.back}<span>Event details</span></button>`;
  head.querySelector('button')!.addEventListener('click', () => back(app));
  root.append(head);

  if (!e && !saved) {
    root.insertAdjacentHTML('beforeend', `<div class="empty"><h2 class="display">Event not found.</h2><p>Not in latest feed — check the original listing.</p><a class="btn" href="#/">Back to the deck</a></div>`);
    return;
  }

  const status = statusOf(e, saved, app.now, app.nowInstant);
  const sec = document.createElement('article');
  sec.className = 'details';

  if (!e) {
    // Absence from this snapshot does not prove removal; retain the save.
    const s = saved!.snap;
    sec.innerHTML = `
      <div class="badges">${badges(status)}</div>
      <h1 class="ev-title" tabindex="-1">${esc(s.title)}</h1>
      <dl class="facts">
        <div><dt>When</dt><dd>${s.start ? `${esc(dayLabel(s.start.slice(0, 10)))} · ${clock(s.start)}` : 'Time TBC'} <small>(as saved)</small></dd></div>
        <div><dt>Where</dt><dd>${esc(s.venue ?? s.place)}</dd></div>
        <div><dt>Price</dt><dd>${esc(s.price)} <small>(as saved)</small></dd></div>
      </dl>
      <a class="btn btn-wide" href="${esc(s.sourceUrl)}" target="_blank" rel="noopener">Open original listing ${icon.out}</a>
      <button type="button" class="btn btn-ghost btn-wide" data-act="unsave">Remove from My Night</button>`;
    sec.querySelector('[data-act=unsave]')!.addEventListener('click', () => {
      app.unsave(id);
      back(app);
    });
    root.append(sec);
    return;
  }

  const fam = app.familyOf(e);
  const poster = renderPoster(e, fam, app.artworkOf(e));
  const art = artworkAsset(poster.artwork);
  const isSaved = !!saved;
  const startDay = e.start?.slice(0, 10);
  const crosses = e.start && startDay !== e.night;
  const when = e.start
    ? `${esc(dayLabel(e.night!))}${crosses ? ` (after midnight, ${weekdayShort(startDay!)})` : ''} · ${clock(e.start)}${e.end ? `–${clock(e.end)}` : ''}`
    : e.dateAmbiguous
      ? 'Listed for this date, but opening hours for tonight aren’t confirmed. Check the source.'
      : 'Time TBC';
  const [primary, ...others] = e.sources;
  const mapsQuery = e.venue?.address && e.venue.lat ? `https://www.openstreetmap.org/?mlat=${e.venue.lat}&mlon=${e.venue.lon}#map=17/${e.venue.lat}/${e.venue.lon}` : null;

  sec.innerHTML = `
    <div class="det-poster ${e.canceled ? 'is-canceled' : ''}">${poster.html}${e.canceled ? '<div class="cancel-band">CANCELED</div>' : ''}</div>
    <p class="note artwork-credit">${art ? `Illustrative artwork, not event photography: ${esc(art.label)}. ${esc(art.attribution)} · ${esc(art.rights)}${art.sourceUrl ? ` · <a href="${esc(art.sourceUrl)}" target="_blank" rel="noopener">Artwork source</a>` : ''}.` : 'Image-free poster design. Poster artwork is illustrative, not event photography.'}</p>
    ${status.length ? `<div class="badges">${badges(status)}</div>` : ''}
    <h1 class="ev-title" tabindex="-1">${esc(e.title)}</h1>
    ${e.blurb ? `<p class="lead">${esc(e.blurb)}</p>` : ''}
    <dl class="facts">
      <div><dt>When</dt><dd>${when}${!e.end && e.start ? '<small>End time not published</small>' : ''}</dd></div>
      <div><dt>Where</dt><dd>${e.venue ? `${e.venue.district ? `<b>${esc(e.venue.district)}</b> · ` : ''}${esc(e.venue.name)}${e.venue.address ? `<small>${esc(e.venue.address)}${mapsQuery ? ` · <a href="${mapsQuery}" target="_blank" rel="noopener">Map ${icon.out}</a>` : ''}</small>` : ''}` : 'Location TBC'}</dd></div>
      <div><dt>Price</dt><dd>${esc(priceText(e.price))}${e.price ? '' : '<small>Not published or not yet confirmed — the source will say.</small>'}</dd></div>
      <div><dt>Type</dt><dd>${esc(CATEGORY_LABEL[e.category])}${e.genre ? ` · ${esc(e.genre)}` : ''}</dd></div>
      ${e.language ? `<div><dt>Language</dt><dd>${esc(e.language)}</dd></div>` : ''}
    </dl>
    ${e.description ? `<p class="desc">${esc(e.description)}</p>` : ''}
    ${e.displayTitle && e.displayTitle !== e.title ? `<p class="note">Poster headline “${esc(e.displayTitle)}” is our short version of the official title above.</p>` : ''}
    <a class="btn btn-wide" href="${esc(primary.url)}" target="_blank" rel="noopener">Open original event ${icon.out}</a>
    <div class="save-row">
      <button type="button" class="btn ${isSaved ? 'btn-ghost' : 'btn-save'}" data-act="save" aria-pressed="${isSaved}">${isSaved ? `${icon.heartFill} Saved — remove` : `${icon.heart} Save to My Night`}</button>
      <button type="button" class="btn btn-fav ${saved?.fav ? 'on' : ''}" data-act="fav" aria-pressed="${!!saved?.fav}" aria-label="Favorite">${star('currentColor', '1.1em')}</button>
    </div>
    <p class="source">Source: <a href="${esc(primary.url)}" target="_blank" rel="noopener">${esc(primary.name)}</a>${others.length ? ` · also listed by ${others.map((o) => `<a href="${esc(o.url)}" target="_blank" rel="noopener">${esc(o.name)}</a>`).join(', ')}` : ''} · ${app.demo ? 'updated' : 'collected'} ${esc(dayLabel(e.updatedAt.slice(0, 10)).toLowerCase())} ${clock(e.updatedAt)}</p>`;

  sec.querySelector('[data-act=save]')!.addEventListener('click', () => {
    if (isSaved) {
      const item = app.unsave(id);
      toast('Removed from My Night', { label: 'Undo', run: () => (item && app.restore(item), rerender()) });
    } else {
      if (e.canceled) return toast('This event was canceled');
      app.save(e);
      toast('Saved to My Night');
    }
    rerender();
  });
  sec.querySelector('[data-act=fav]')!.addEventListener('click', () => {
    if (e.canceled) return toast('This event was canceled');
    if (!saved) {
      app.save(e, true);
      toast('Saved as a favorite');
    } else store.setFav(id, !saved.fav);
    rerender();
  });

  root.append(sec);
  void document.fonts.ready.then(() => fitDom(sec));
}
