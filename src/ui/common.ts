import type { PragueEvent, WallTime } from '../types';
import type { SavedItem } from '../core/store';
import { hasStarted, isEnded } from '../core/curate';
import { esc, priceText } from '../core/format';
import { clock, minutesBetween } from '../core/time';

const svg = (d: string, extra = '') =>
  `<svg viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" ${extra}>${d}</svg>`;

export const icon = {
  x: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
  heart: svg('<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>'),
  heartFill: svg('<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" fill="currentColor"/>'),
  info: svg('<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.01"/>'),
  undo: svg('<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>'),
  back: svg('<path d="M15 5l-7 7 7 7"/>'),
  out: svg('<path d="M7 17L17 7M9 7h8v8"/>'),
  sliders: svg('<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>'),
  deck: svg('<rect x="6" y="3" width="12" height="17" rx="1.5"/><path d="M3 7v12a2 2 0 0 0 2 2h10"/>'),
  list: svg('<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>'),
  pin: svg('<path d="M12 21s-6-5.3-6-11a6 6 0 0 1 12 0c0 5.7-6 11-6 11z"/><circle cx="12" cy="10" r="2"/>'),
  trash: svg('<path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13"/>'),
};

export interface Status {
  kind: 'removed' | 'canceled' | 'ended' | 'on' | 'started' | 'soon' | 'changed';
  text: string;
}

/** Everything honest we can say about an event's state right now. */
export function statusOf(e: PragueEvent | undefined, saved: SavedItem | undefined, now: WallTime): Status[] {
  const out: Status[] = [];
  if (!e || !e.sourceAlive) {
    out.push({ kind: 'removed', text: 'Listing removed by source — check the original link' });
    return out;
  }
  if (e.canceled) out.push({ kind: 'canceled', text: 'Canceled' });
  if (saved && e.start && saved.snap.start && saved.snap.start !== e.start) {
    out.push({ kind: 'changed', text: `Time changed — was ${clock(saved.snap.start)}, now ${clock(e.start)}` });
  }
  if (saved && saved.snap.price !== priceText(e.price)) {
    out.push({ kind: 'changed', text: `Price updated — was ${saved.snap.price}` });
  }
  if (e.canceled) return out;
  if (isEnded(e, now)) out.push({ kind: 'ended', text: 'Ended' });
  else if (hasStarted(e, now)) {
    out.push(e.end ? { kind: 'on', text: `On now · until ${clock(e.end)}` } : { kind: 'started', text: `Started at ${clock(e.start!)}` });
  } else if (e.start) {
    const mins = minutesBetween(now, e.start);
    if (mins <= 90) out.push({ kind: 'soon', text: `Starts in ${mins} min` });
  }
  return out;
}

export function badges(list: Status[]): string {
  return list.map((s) => `<span class="badge b-${s.kind}">${esc(s.text)}</span>`).join('');
}

let toastTimer: number | undefined;

export function clip(s: string, n = 36): string {
  return s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s;
}

export function toast(message: string, action?: { label: string; run: () => void }) {
  const el = document.getElementById('toast')!;
  el.innerHTML = `<span>${esc(message)}</span>${action ? `<button type="button">${esc(action.label)}</button>` : ''}`;
  el.classList.add('show');
  if (action) {
    el.querySelector('button')!.onclick = () => {
      action.run();
      el.classList.remove('show');
    };
  }
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el.classList.remove('show'), action ? 4000 : 2200);
}

/** Readable text color on a given background. */
export function inkOn(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const l = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return l > 0.55 ? '#191919' : '#F4EEDD';
}
