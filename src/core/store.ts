/**
 * Device-local persistence. No account in V1: saves live in this browser only.
 */
import type { DateKey, FamilyId, Mood, PragueEvent, WallTime } from '../types';
import type { Overrides } from './curate';
import { placeText, priceText } from './format';

export interface SavedSnapshot {
  title: string;
  start?: WallTime;
  end?: WallTime;
  place: string;
  venue?: string;
  price: string;
  sourceUrl: string;
  sourceName: string;
  family: FamilyId;
}

export interface SavedItem {
  id: string;
  night: DateKey;
  savedAt: WallTime;
  /** What the visitor saw when saving; used to flag later changes. */
  snap: SavedSnapshot;
}

export interface Filters {
  price: 'any' | 'free' | 'under300';
  includeUnknownPrice: boolean;
  moods: Mood[];
  district: string;
}

export const DEFAULT_FILTERS: Filters = { price: 'any', includeUnknownPrice: false, moods: [], district: '' };

export interface Revision {
  canceled: string[];
  shifted: { id: string; minutes: number }[];
  at: WallTime;
}

const mem = new Map<string, string>();
const ls = {
  get(k: string): string | null {
    try {
      return localStorage.getItem(k);
    } catch {
      return mem.get(k) ?? null;
    }
  },
  set(k: string, v: string) {
    try {
      localStorage.setItem(k, v);
    } catch {
      mem.set(k, v);
    }
  },
  del(k: string) {
    try {
      localStorage.removeItem(k);
    } catch {
      mem.delete(k);
    }
  },
};

function read<T>(k: string, fallback: T): T {
  const raw = ls.get(k);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

const write = (k: string, v: unknown) => ls.set(k, JSON.stringify(v));

export function snapshot(e: PragueEvent, family: FamilyId): SavedSnapshot {
  return {
    title: e.title,
    start: e.start,
    end: e.end,
    place: placeText(e),
    venue: e.venue?.name,
    price: priceText(e.price),
    sourceUrl: e.sources[0].url,
    sourceName: e.sources[0].name,
    family,
  };
}

export const store = {
  saves(): SavedItem[] {
    return read<SavedItem[]>('pt:saves', []);
  },
  isSaved(id: string): boolean {
    return this.saves().some((s) => s.id === id);
  },
  save(e: PragueEvent, family: FamilyId, now: WallTime) {
    if (!e.night || this.isSaved(e.id)) return;
    write('pt:saves', [...this.saves(), { id: e.id, night: e.night, savedAt: now, snap: snapshot(e, family) }]);
  },
  unsave(id: string): SavedItem | undefined {
    const all = this.saves();
    const item = all.find((s) => s.id === id);
    write('pt:saves', all.filter((s) => s.id !== id));
    return item;
  },
  restore(item: SavedItem) {
    if (!this.isSaved(item.id)) write('pt:saves', [...this.saves(), item]);
  },

  /** Swipe decisions per time window; a pass never hides an event elsewhere. */
  decisions(windowKey: string): Record<string, 'save' | 'pass'> {
    return read(`pt:deck:${windowKey}`, {});
  },
  decide(windowKey: string, id: string, d: 'save' | 'pass' | null) {
    const all = this.decisions(windowKey);
    if (d) all[id] = d;
    else delete all[id];
    write(`pt:deck:${windowKey}`, all);
  },
  clearPasses(windowKey: string) {
    const all = this.decisions(windowKey);
    for (const k of Object.keys(all)) if (all[k] === 'pass') delete all[k];
    write(`pt:deck:${windowKey}`, all);
  },

  filters(): Filters {
    return { ...DEFAULT_FILTERS, ...read<Partial<Filters>>('pt:filters', {}) };
  },
  setFilters(f: Filters) {
    write('pt:filters', f);
  },

  hintSeen(): boolean {
    return ls.get('pt:hint') === '1';
  },
  markHintSeen() {
    ls.set('pt:hint', '1');
  },

  overrides(): Overrides {
    return { pinned: [], removed: [], family: {}, ...read<Partial<Overrides>>('pt:overrides', {}) };
  },
  setOverrides(o: Overrides) {
    write('pt:overrides', o);
  },

  revision(): Revision | null {
    return read<Revision | null>('pt:rev', null);
  },
  setRevision(r: Revision | null) {
    if (r) write('pt:rev', r);
    else ls.del('pt:rev');
  },
};
