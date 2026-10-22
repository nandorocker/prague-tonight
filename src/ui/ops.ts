/**
 * A lightweight internal review board: candidate counts, the deck in swipe
 * order, pin / remove / restyle, exclusion reasons, a style lab, and a
 * simulated source refresh for testing changed and canceled saves.
 */
import type { App } from '../app';
import type { FamilyId } from '../types';
import { esc } from '../core/format';
import { store } from '../core/store';
import { clock, fromWallMinutes, wallMinutes } from '../core/time';
import { FAMILIES, FAMILY_NAME } from '../posters/assign';
import { fitDom } from '../posters/fit';
import { renderPoster } from '../posters/render';
import { clip, toast } from './common';
import { windowSwitch } from './deck';

let labEventId: string | null = null;

export function renderOps(app: App, root: HTMLElement, rerender: () => void) {
  const cur = app.curation();
  const o = store.overrides();
  const rev = store.revision();
  const reasons = new Map<string, number>();
  for (const x of cur.excluded) reasons.set(x.reason, (reasons.get(x.reason) ?? 0) + 1);

  root.innerHTML = `
    <div class="page-head"><h1 class="display" tabindex="-1">Review board</h1>
    <p class="sub">Internal · prototype content operations · fictional data</p></div>`;
  root.append(windowSwitch(app, rerender));

  const counts = app.windows
    .map((w) => {
      const c = app.curation(w.id);
      return `<div class="stat"><b>${c.deck.length}</b><span>${esc(w.label)} deck</span><small>${c.index.length} listed · ${c.excluded.filter((x) => !x.listed).length} blocked</small></div>`;
    })
    .join('');

  const sec = document.createElement('div');
  sec.className = 'ops';
  sec.innerHTML = `
    <div class="stats">${counts}</div>

    <h2 class="group">Simulate a source refresh</h2>
    <p class="note">Cancels your earliest saved event and moves the next one 30 minutes later (or the first deck cards, if nothing is saved), so changed and canceled states can be checked in My Night.</p>
    <div class="row">
      <button type="button" class="btn" data-act="rev">Run refresh</button>
      ${rev ? `<button type="button" class="btn btn-ghost" data-act="unrev">Undo refresh (${rev.canceled.length} canceled, ${rev.shifted.length} moved)</button>` : ''}
    </div>

    <h2 class="group">Deck lineup · swipe order</h2>
    <div class="lineup">${cur.deck
      .map((e, i) => {
        const fam = cur.family.get(e.id)!;
        return `<figure class="mini" data-id="${esc(e.id)}">
          <div class="mini-poster">${renderPoster(e, fam).html}</div>
          <figcaption><b>${String(i + 1).padStart(2, '0')}</b> ${esc(FAMILY_NAME[fam])}${o.pinned.includes(e.id) ? ' · pinned' : ''}<br><small>${esc(e.category)} · ${e.start ? clock(e.start) : ''} · ${esc(e.venue?.district ?? '')}</small></figcaption>
          <div class="mini-actions">
            <button type="button" data-op="pin">${o.pinned.includes(e.id) ? 'Unpin' : 'Pin'}</button>
            <button type="button" data-op="remove">Remove</button>
            <button type="button" data-op="restyle">Restyle</button>
          </div></figure>`;
      })
      .join('')}</div>

    <h2 class="group">Kept out of the deck</h2>
    <p class="note">${[...reasons].map(([r, n]) => `${esc(r)}: <b>${n}</b>`).join(' · ')}</p>
    <table class="excl"><thead><tr><th>Event</th><th>Reason</th><th>In All events</th><th></th></tr></thead><tbody>
      ${cur.excluded
        .map(
          (x) => `<tr><td>${esc(x.event.title)}<small>${x.event.start ? clock(x.event.start) : '—'} · ${esc(x.event.sources[0]?.name ?? '')}</small></td><td>${esc(x.reason)}</td><td>${x.listed ? 'yes' : 'no'}</td>
          <td>${o.removed.includes(x.event.id) ? `<button type="button" class="link" data-restore="${esc(x.event.id)}">Restore</button>` : ''}</td></tr>`,
        )
        .join('')}
    </tbody></table>

    <h2 class="group">Style lab · one fixture, every family</h2>
    <select class="select" id="lab-pick">${cur.index
      .map((e) => `<option value="${esc(e.id)}" ${e.id === (labEventId ?? cur.deck[0]?.id) ? 'selected' : ''}>${esc(e.title.slice(0, 70))}</option>`)
      .join('')}</select>
    <div class="lab"></div>
    <div class="row"><button type="button" class="btn btn-ghost" data-act="reset-all">Reset editor overrides</button>
    <button type="button" class="btn btn-ghost" data-act="reset-me">Clear my saves &amp; swipes</button></div>`;
  root.append(sec);

  const drawLab = () => {
    const id = (sec.querySelector<HTMLSelectElement>('#lab-pick')!.value || cur.deck[0]?.id) ?? '';
    labEventId = id;
    const e = app.byId.get(id);
    if (!e) return;
    const lab = sec.querySelector<HTMLElement>('.lab')!;
    lab.innerHTML = ([...FAMILIES, 'plain'] as FamilyId[])
      .map((f) => {
        const r = renderPoster(e, f);
        return `<figure class="mini"><div class="mini-poster">${r.html}</div><figcaption>${esc(FAMILY_NAME[f])}${r.family !== f ? ' → fell back to plain' : ''}</figcaption></figure>`;
      })
      .join('');
    void document.fonts.ready.then(() => fitDom(lab));
  };
  sec.querySelector('#lab-pick')!.addEventListener('change', drawLab);
  drawLab();
  void document.fonts.ready.then(() => fitDom(sec));

  const update = (fn: (ov: typeof o) => void) => {
    const ov = store.overrides();
    fn(ov);
    store.setOverrides(ov);
    app.recurate();
    rerender();
  };
  sec.querySelectorAll<HTMLElement>('.mini[data-id]').forEach((fig) => {
    const id = fig.dataset.id!;
    fig.querySelector('[data-op=pin]')!.addEventListener('click', () =>
      update((ov) => {
        ov.pinned = ov.pinned.includes(id) ? ov.pinned.filter((x) => x !== id) : [...ov.pinned, id];
      }),
    );
    fig.querySelector('[data-op=remove]')!.addEventListener('click', () =>
      update((ov) => {
        ov.removed = [...ov.removed, id];
        ov.pinned = ov.pinned.filter((x) => x !== id);
      }),
    );
    fig.querySelector('[data-op=restyle]')!.addEventListener('click', () =>
      update((ov) => {
        const now = cur.family.get(id)!;
        ov.family[id] = FAMILIES[(FAMILIES.indexOf(now as (typeof FAMILIES)[number]) + 1) % FAMILIES.length];
      }),
    );
  });
  sec.querySelectorAll<HTMLElement>('[data-restore]').forEach((b) =>
    b.addEventListener('click', () => update((ov) => (ov.removed = ov.removed.filter((x) => x !== b.dataset.restore)))),
  );
  sec.querySelector('[data-act=reset-all]')!.addEventListener('click', () => update((ov) => Object.assign(ov, { pinned: [], removed: [], family: {} })));
  sec.querySelector('[data-act=reset-me]')!.addEventListener('click', () => {
    for (const k of Object.keys(localStorage)) if (k.startsWith('pt:') && k !== 'pt:overrides') localStorage.removeItem(k);
    app.undo = [];
    app.recurate(true);
    toast('Cleared saves, swipes and simulated refreshes');
    rerender();
  });

  sec.querySelector('[data-act=rev]')!.addEventListener('click', () => {
    const upcoming = store
      .saves()
      .map((s) => app.byId.get(s.id))
      .filter((e) => e && e.start && !e.canceled && wallMinutes(e.start) > wallMinutes(app.now))
      .sort((a, b) => wallMinutes(a!.start!) - wallMinutes(b!.start!));
    const pool = upcoming.length ? upcoming : cur.deck;
    const [a, b] = pool;
    if (!a) return toast('Nothing to change');
    const prev = store.revision() ?? { canceled: [], shifted: [], at: app.now };
    store.setRevision({
      canceled: [...prev.canceled, a.id],
      shifted: b ? [...prev.shifted, { id: b.id, minutes: 30 }] : prev.shifted,
      at: fromWallMinutes(wallMinutes(app.now)),
    });
    app.recurate(true);
    toast(`Refreshed: “${clip(a.title)}” canceled${b ? `, “${clip(b.title)}” moved +30 min` : ''}`);
    rerender();
  });
  sec.querySelector('[data-act=unrev]')?.addEventListener('click', () => {
    store.setRevision(null);
    app.recurate(true);
    rerender();
  });
}
