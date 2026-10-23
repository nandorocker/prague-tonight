import type { PragueEvent } from '../types';
import { MOOD_OF } from './format';
import type { Filters } from './store';

export interface Filtered {
  items: PragueEvent[];
  /** Hidden only because their price is unknown, so the UI can say so. */
  hiddenUnknownPrice: number;
}

export function filterCount(f: Filters): number {
  return (f.price !== 'any' ? 1 : 0) + (f.moods.length ? 1 : 0) + (f.district ? 1 : 0);
}

export function applyFilters(list: PragueEvent[], f: Filters): Filtered {
  let hiddenUnknownPrice = 0;
  const items = list.filter((e) => {
    const mood = MOOD_OF[e.category];
    if (f.moods.length && (!mood || !f.moods.includes(mood))) return false;
    if (f.district && e.venue?.district !== f.district) return false;
    if (f.price !== 'any') {
      if (!e.price) {
        if (f.includeUnknownPrice) return true;
        hiddenUnknownPrice++;
        return false;
      }
      if (f.price === 'free' && e.price.kind !== 'free') return false;
      if (f.price === 'under300' && e.price.kind === 'paid' && e.price.min >= 300) return false;
    }
    return true;
  });
  return { items, hiddenUnknownPrice };
}
