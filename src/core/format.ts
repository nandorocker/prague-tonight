import type { Category, Mood, PragueEvent, Price } from '../types';
import { clock } from './time';

export const CATEGORY_LABEL: Record<Category, string> = {
  music: 'Music',
  nightlife: 'Club night',
  film: 'Film',
  talk: 'Talk',
  art: 'Art',
  performance: 'Performance',
  comedy: 'Comedy',
  workshop: 'Workshop',
  community: 'Community',
};

export const MOOD_OF: Record<Category, Mood> = {
  music: 'music',
  nightlife: 'nightlife',
  film: 'culture',
  talk: 'culture',
  art: 'culture',
  performance: 'culture',
  comedy: 'social',
  workshop: 'social',
  community: 'social',
};

export const MOOD_LABEL: Record<Mood, string> = {
  music: 'Music',
  culture: 'Culture',
  nightlife: 'Nightlife',
  social: 'Social',
};

/** Honest price text: never "free" without evidence. */
export function priceText(p: Price | undefined): string {
  if (!p) return 'Check price';
  if (p.kind === 'free') return 'Free';
  return p.max && p.max !== p.min ? `${p.min}–${p.max} Kč` : `${p.min} Kč`;
}

/** Where, in as few words as is honest: district, else venue, else unknown. */
export function placeText(e: PragueEvent): string {
  return e.venue?.district ?? e.venue?.name ?? 'Location TBC';
}

export function timeText(e: PragueEvent): string {
  if (!e.start) return 'Time TBC';
  return e.end ? `${clock(e.start)}–${clock(e.end)}` : clock(e.start);
}

export function startText(e: PragueEvent): string {
  return e.start ? clock(e.start) : 'Time TBC';
}

export function upper(s: string): string {
  return s.toLocaleUpperCase('cs-CZ');
}

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export function esc(s: string | number | undefined): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
}

/** Lowercase, strip diacritics and punctuation, for matching only. */
export function fold(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
