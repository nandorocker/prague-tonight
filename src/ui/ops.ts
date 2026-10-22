/**
 * Tools, opened by holding the wordmark (or #/ops). Plain utility styling on
 * purpose: session resets and the clock first, then the deck editor, then
 * reference material that's collapsed until needed.
 */
import type { App } from '../app';
import type { FamilyId, Span } from '../types';
import { esc } from '../core/format';
import { DEFAULT_FILTERS, store } from '../core/store';
import { clock, dayLabel, fromWallMinutes, SPAN_LABEL, SPANS, wallMinutes } from '../core/time';
import { eligibleFamilies, FAMILIES, FAMILY_CLASS, FAMILY_DESCRIPTION, FAMILY_NAME, STYLE_CLASSES, STYLE_CLASS_NAME } from '../posters/assign';
import { fitDom } from '../posters/fit';
import { renderPoster } from '../posters/render';
import { clip, toast } from './common';

let labEventId: string | null = null;
/** Which collapsible sections are open, kept across re-renders. */
const openSections = new Set<string>();

export function renderOps(app: App, root: HTMLElement, rerender: () => void) {
  const cur = app.curation();
  const o = store.overrides();
  const rev = store.revision();
  const decisions = store.decisions();
  const saves = store.saves();
  const passes = Object.values(decisions).filter((d) => d === 'pass').length;
  const params = new URLSearchParams(location.search);
  const pinnedClock = params.get('now');
  const reasons = new Map<string, typeof cur.excluded>();
  for (const x of cur.excluded) reasons.set(x.reason, [...(reasons.get(x.reason) ?? []), x]);

  const section = (id: string, title: string, meta: string, body: string) =>
    `<details class="ops-sec" data-sec="${id}" ${openSections.has(id) ? 'open' : ''}><summary><span>${title}</span><small>${meta}</small></summary><div class="ops-body">${body}</div></details>`;

  root.innerHTML = `
    <div class="ops">
      <div class="ops-top">
        <a href="#/" class="ops-back">← App</a>
        <h1 tabindex="-1">Tools</h1>
      </div>

      <section class="ops-card">
        <h2>Reset</h2>
        <div class="ops-btns">
          <button type="button" data-act="passes" ${passes ? '' : 'disabled'}>Bring back passed cards <b>${passes}</b></button>
          <button type="button" data-act="saves" ${saves.length ? '' : 'disabled'}>Clear My Night <b>${saves.length}</b></button>
          <button type="button" data-act="everything" class="danger">Reset everything</button>
        </div>
        <p class="ops-hint">“Reset everything” returns the app to a first visit: swipes, saves, settings, deck edits and test changes.</p>
      </section>

      <section class="ops-card">
        <h2>Clock</h2>
        <div class="ops-row">
          <input type="datetime-local" id="ops-now" value="${esc(app.now)}">
          <button type="button" data-act="clock">Set</button>
          ${pinnedClock ? '<button type="button" data-act="realtime">Real time</button>' : ''}
        </div>
        <div class="ops-row">
          ${presets(app)
            .map((p) => `<button type="button" class="chip-sm" data-now="${p.at}">${esc(p.label)}</button>`)
            .join('')}
        </div>
        <label class="ops-check"><input type="checkbox" id="ops-stale" ${params.get('stale') === '1' ? 'checked' : ''}> Show the “couldn’t refresh” banner</label>
        <p class="ops-hint">${pinnedClock ? `Pinned to ${esc(dayLabel(app.now.slice(0, 10)))} ${clock(app.now)} (the clock keeps running).` : 'Using the real Prague time.'}</p>
      </section>

      <section class="ops-card">
        <h2>Event changes</h2>
        <p class="ops-hint">Make a saved event change, to check how My Night reports it.</p>
        <div class="ops-btns">
          <button type="button" data-act="cancel">Cancel the next saved event</button>
          <button type="button" data-act="shift">Move the next saved event +30 min</button>
          ${rev ? `<button type="button" data-act="unrev">Undo changes <b>${rev.canceled.length + rev.shifted.length}</b></button>` : ''}
        </div>
      </section>

      <div class="ops-range" role="group" aria-label="Range">
        ${SPANS.map((s) => `<button type="button" data-span="${s}" class="${s === app.span ? 'on' : ''}">${SPAN_LABEL[s]}</button>`).join('')}
      </div>
      <p class="ops-stats"><b>${cur.deck.length}</b> cards · <b>${cur.index.length}</b> listed · <b>${cur.excluded.filter((x) => !x.listed).length}</b> blocked</p>

      ${section(
        'deck',
        'Deck',
        `${cur.deck.length} cards in swipe order`,
        `<ol class="ops-deck">${cur.deck
          .map((e, i) => {
            const fam = cur.family.get(e.id)!;
            const fitting = eligibleFamilies(e);
            const d = decisions[e.id];
            return `<li data-id="${esc(e.id)}">
              <span class="n">${i + 1}</span>
              <div class="thumb">${renderPoster(e, fam).html}</div>
              <div class="info"><b>${esc(e.displayTitle ?? e.title)}</b>
                <small>${e.start ? `${esc(dayLabel(e.night!))} ${clock(e.start)}` : ''} · ${esc(e.venue?.name ?? '')}${d ? ` · <em>${d === 'pass' ? 'passed' : 'saved'}</em>` : ''}</small>
                <div class="acts">
                  <select data-op="family" aria-label="Poster style">${([...FAMILIES, 'plain'] as FamilyId[]).map((f) => `<option value="${f}" ${f === fam ? 'selected' : ''} ${f !== 'plain' && !fitting.includes(f) ? 'disabled' : ''}>${esc(FAMILY_NAME[f])}</option>`).join('')}</select>
                  <button type="button" data-op="pin" class="${o.pinned.includes(e.id) ? 'on' : ''}">${o.pinned.includes(e.id) ? 'Pinned' : 'Pin'}</button>
                  <button type="button" data-op="remove">Remove</button>
                </div>
              </div></li>`;
          })
          .join('')}</ol>
        ${o.pinned.length || o.removed.length || Object.keys(o.family).length ? '<button type="button" class="ops-link" data-act="reset-edits">Undo all deck edits</button>' : ''}`,
      )}

      ${section(
        'out',
        'Left out',
        `${cur.excluded.length} events`,
        [...reasons]
          .sort((a, b) => b[1].length - a[1].length)
          .map(
            ([r, xs]) => `<details class="ops-reason"><summary>${esc(r)} <b>${xs.length}</b>${xs[0].listed ? '' : ' <span class="tag-sm">not listed</span>'}</summary><ul>${xs
              .map(
                (x) =>
                  `<li>${esc(clip(x.event.title, 54))} <small>${x.event.start ? clock(x.event.start) : '—'}</small>${o.removed.includes(x.event.id) ? ` <button type="button" class="ops-link" data-restore="${esc(x.event.id)}">Restore</button>` : ''}</li>`,
              )
              .join('')}</ul></details>`,
          )
          .join(''),
      )}

      ${section(
        'lab',
        'Poster lab',
        `${FAMILIES.length} personas · ${STYLE_CLASSES.length} classes`,
        `<p class="ops-hint">Same event, different treatments. Compare how each family handles the facts and source blurb.</p>
        <label class="lab-label" for="lab-pick">Event to preview</label>
        <select id="lab-pick">${cur.index
          .map((e) => `<option value="${esc(e.id)}" ${e.id === (labEventId ?? cur.deck[0]?.id) ? 'selected' : ''}>${esc(clip(e.title, 60))}</option>`)
          .join('')}</select><div class="ops-lab"></div>`,
      )}
    </div>`;

  root.querySelectorAll<HTMLDetailsElement>('details.ops-sec').forEach((d) =>
    d.addEventListener('toggle', () => {
      if (d.open) openSections.add(d.dataset.sec!);
      else openSections.delete(d.dataset.sec!);
      if (d.open) void document.fonts.ready.then(() => fitDom(d));
      if (d.open && d.dataset.sec === 'lab') drawLab();
    }),
  );

  const drawLab = () => {
    const pick = root.querySelector<HTMLSelectElement>('#lab-pick');
    const id = (pick?.value || cur.deck[0]?.id) ?? '';
    labEventId = id;
    const e = app.byId.get(id);
    const lab = root.querySelector<HTMLElement>('.ops-lab');
    if (!e || !lab) return;
    const preview = (f: FamilyId) => {
      const r = renderPoster(e, f);
      const description = f === 'plain' ? 'Full-title typography when an expressive treatment cannot fit.' : FAMILY_DESCRIPTION[f];
      return `<figure><div class="thumb">${r.html}</div><figcaption><b>${esc(FAMILY_NAME[f])}</b><small>${esc(description)}</small>${r.family !== f ? '<small>Showing plain fallback to keep the full title.</small>' : ''}</figcaption></figure>`;
    };
    lab.innerHTML = STYLE_CLASSES.map((styleClass) => `<section class="lab-class" aria-labelledby="lab-${styleClass}">
      <h3 id="lab-${styleClass}">${esc(STYLE_CLASS_NAME[styleClass])}</h3>
      <div class="lab-grid">${FAMILIES.filter((f) => FAMILY_CLASS[f] === styleClass).map(preview).join('')}</div>
    </section>`).join('') + `<details class="lab-fallback"><summary>Plain fallback</summary>${preview('plain')}</details>`;
    lab.querySelector('.lab-fallback')!.addEventListener('toggle', () => fitDom(lab));
    void document.fonts.ready.then(() => fitDom(lab));
  };
  root.querySelector('#lab-pick')!.addEventListener('change', drawLab);
  if (openSections.has('lab')) drawLab();
  void document.fonts.ready.then(() => root.querySelectorAll<HTMLDetailsElement>('details[open]').forEach((d) => fitDom(d)));

  const edit = (fn: (ov: typeof o) => void) => {
    const ov = store.overrides();
    fn(ov);
    store.setOverrides(ov);
    app.recurate();
    rerender();
  };
  root.querySelectorAll<HTMLElement>('.ops-deck li[data-id]').forEach((li) => {
    const id = li.dataset.id!;
    li.querySelector<HTMLSelectElement>('[data-op=family]')!.addEventListener('change', (ev) =>
      edit((ov) => (ov.family[id] = (ev.target as HTMLSelectElement).value as FamilyId)),
    );
    li.querySelector('[data-op=pin]')!.addEventListener('click', () =>
      edit((ov) => (ov.pinned = ov.pinned.includes(id) ? ov.pinned.filter((x) => x !== id) : [...ov.pinned, id])),
    );
    li.querySelector('[data-op=remove]')!.addEventListener('click', () =>
      edit((ov) => {
        ov.removed = [...ov.removed, id];
        ov.pinned = ov.pinned.filter((x) => x !== id);
      }),
    );
  });
  root.querySelectorAll<HTMLElement>('[data-restore]').forEach((b) =>
    b.addEventListener('click', () => edit((ov) => (ov.removed = ov.removed.filter((x) => x !== b.dataset.restore)))),
  );
  root.querySelector('[data-act=reset-edits]')?.addEventListener('click', () => edit((ov) => Object.assign(ov, { pinned: [], removed: [], family: {} })));

  root.querySelectorAll<HTMLButtonElement>('[data-span]').forEach((b) =>
    b.addEventListener('click', () => {
      app.setSpan(Number(b.dataset.span) as Span);
      app.undo = [];
      rerender();
    }),
  );

  root.querySelector('[data-act=passes]')!.addEventListener('click', () => {
    store.clearPasses();
    app.undo = app.undo.filter((u) => u.action !== 'pass');
    toast(`Brought back ${passes} card${passes === 1 ? '' : 's'}`);
    rerender();
  });
  root.querySelector('[data-act=saves]')!.addEventListener('click', () => {
    store.clearSaves();
    app.undo = app.undo.filter((u) => u.action === 'pass');
    toast('My Night cleared');
    rerender();
  });
  root.querySelector('[data-act=everything]')!.addEventListener('click', () => {
    if (!confirm('Reset everything back to a first visit?')) return;
    store.clearAll();
    app.undo = [];
    app.span = 1;
    app.filters = structuredClone(DEFAULT_FILTERS);
    app.recurate(true);
    toast('Everything reset');
    rerender();
  });

  const setParam = (k: string, v: string | null) => {
    const p = new URLSearchParams(location.search);
    if (v === null) p.delete(k);
    else p.set(k, v);
    const qs = p.toString();
    location.href = `${location.pathname}${qs ? `?${qs}` : ''}#/ops`;
  };
  root.querySelector('[data-act=clock]')!.addEventListener('click', () => {
    const v = root.querySelector<HTMLInputElement>('#ops-now')!.value;
    if (/^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(v)) setParam('now', v);
  });
  root.querySelector('[data-act=realtime]')?.addEventListener('click', () => setParam('now', null));
  root.querySelectorAll<HTMLButtonElement>('[data-now]').forEach((b) => b.addEventListener('click', () => setParam('now', b.dataset.now!)));
  root.querySelector('#ops-stale')!.addEventListener('change', (ev) => setParam('stale', (ev.target as HTMLInputElement).checked ? '1' : null));

  const nextSaved = (skip: string[]) =>
    store
      .saves()
      .map((s) => app.byId.get(s.id))
      .filter((e) => e && e.start && !e.canceled && !skip.includes(e.id) && wallMinutes(e.start) > wallMinutes(app.now))
      .sort((a, b) => wallMinutes(a!.start!) - wallMinutes(b!.start!))[0];
  const change = (kind: 'cancel' | 'shift') => {
    const prev = store.revision() ?? { canceled: [], shifted: [], at: app.now };
    const e = nextSaved(kind === 'cancel' ? prev.canceled : prev.shifted.map((s) => s.id));
    if (!e) return toast('Save an upcoming event first');
    store.setRevision({
      canceled: kind === 'cancel' ? [...prev.canceled, e.id] : prev.canceled,
      shifted: kind === 'shift' ? [...prev.shifted, { id: e.id, minutes: 30 }] : prev.shifted,
      at: fromWallMinutes(wallMinutes(app.now)),
    });
    app.recurate(true);
    toast(`“${clip(e.title)}” ${kind === 'cancel' ? 'canceled' : 'moved +30 min'}`);
    rerender();
  };
  root.querySelector('[data-act=cancel]')!.addEventListener('click', () => change('cancel'));
  root.querySelector('[data-act=shift]')!.addEventListener('click', () => change('shift'));
  root.querySelector('[data-act=unrev]')?.addEventListener('click', () => {
    store.setRevision(null);
    app.recurate(true);
    rerender();
  });
}

/** Handy moments to jump to: this Friday evening, after midnight, Sunday. */
function presets(app: App): { label: string; at: string }[] {
  const tonight = app.tonight;
  const [y, m, d] = tonight.split('-').map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  const day = (n: number) => fromWallMinutes(wallMinutes(`${tonight}T00:00`) + n * 1440).slice(0, 10);
  const fri = day((5 - wd + 7) % 7);
  const sun = day((7 - wd) % 7);
  return [
    { label: 'Tonight 19:00', at: `${tonight}T19:00` },
    { label: 'Tonight 23:30', at: `${tonight}T23:30` },
    { label: 'After midnight', at: `${day(1)}T01:30` },
    { label: 'Friday 18:45', at: `${fri}T18:45` },
    { label: 'Sunday 16:00', at: `${sun}T16:00` },
  ];
}
