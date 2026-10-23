/**
 * Device-local persistence. No account in V1: saves live in this browser only.
 */
import type { DateKey, FamilyId, Mood, PragueEvent, Span, WallTime } from '../types';
import type { Overrides } from './curate';
import { placeText, priceText } from './format';
import { artworkMap, normalizeArtwork } from '../posters/artwork';
import type { ArtworkToken } from '../posters/assets';

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
  artwork?: ArtworkToken;
}

export interface SavedItem {
  id: string;
  night: DateKey;
  savedAt: WallTime;
  /** Super-liked: saved and marked as a favorite. */
  fav?: boolean;
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

export function snapshot(e: PragueEvent, family: FamilyId, artwork: ArtworkToken = 'none'): SavedSnapshot {
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
    artwork: normalizeArtwork(artwork),
  };
}

export const store = {
  artwork(): Map<string, ArtworkToken> {
    return artworkMap(read<unknown>('pt:artwork', {}));
  },
  setArtwork(choices: ReadonlyMap<string, ArtworkToken>) {
    write('pt:artwork', Object.fromEntries(choices));
  },
  saves(): SavedItem[] {
    return read<SavedItem[]>('pt:saves', []);
  },
  isSaved(id: string): boolean {
    return this.saves().some((s) => s.id === id);
  },
  save(e: PragueEvent, family: FamilyId, now: WallTime, fav = false, artwork: ArtworkToken = 'none') {
    if (!e.night) return;
    const all = this.saves();
    const existing = all.find((s) => s.id === e.id);
    if (existing) {
      if (fav && !existing.fav) this.setFav(e.id, true);
      return;
    }
    write('pt:saves', [...all, { id: e.id, night: e.night, savedAt: now, fav: fav || undefined, snap: snapshot(e, family, artwork) }]);
  },
  setFav(id: string, fav: boolean) {
    write(
      'pt:saves',
      this.saves().map((s) => (s.id === id ? { ...s, fav: fav || undefined } : s)),
    );
  },
  unsave(id: string): SavedItem | undefined {
    const all = this.saves();
    const item = all.find((s) => s.id === id);
    // A direct My Night visit may never have initialized the artwork cache.
    if (item) {
      const choices = this.artwork();
      const token = normalizeArtwork(item.snap.artwork);
      if (choices.get(id) !== token) { choices.set(id, token); this.setArtwork(choices); }
    }
    write('pt:saves', all.filter((s) => s.id !== id));
    return item;
  },
  restore(item: SavedItem) {
    if (!this.isSaved(item.id)) write('pt:saves', [...this.saves(), item]);
  },

  /** Swipe decisions by event id. Event ids include the night, so one map serves every range. */
  decisions(): Record<string, 'save' | 'pass'> {
    return read('pt:deck', {});
  },
  decide(id: string, d: 'save' | 'pass' | null) {
    const all = this.decisions();
    if (d) all[id] = d;
    else delete all[id];
    write('pt:deck', all);
  },
  /** Forget passes, for the given ids or for every event. */
  clearPasses(ids?: string[]) {
    const all = this.decisions();
    for (const k of ids ?? Object.keys(all)) if (all[k] === 'pass') delete all[k];
    write('pt:deck', all);
  },

  span(): Span {
    const v = Number(ls.get('pt:span'));
    return v === 3 || v === 7 ? v : 1;
  },
  setSpan(s: Span) {
    ls.set('pt:span', String(s));
  },

  filters(): Filters {
    return { ...DEFAULT_FILTERS, ...read<Partial<Filters>>('pt:filters', {}) };
  },
  setFilters(f: Filters) {
    write('pt:filters', f);
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

  clearSaves() {
    ls.del('pt:saves');
    // Saved cards were decided as saves; forget those too so they can return.
    write('pt:deck', Object.fromEntries(Object.entries(this.decisions()).filter(([, d]) => d !== 'save')));
  },
  /** Back to first launch: every pt: key, including editor overrides. */
  clearAll() {
    try {
      for (const k of Object.keys(localStorage)) if (k.startsWith('pt:')) localStorage.removeItem(k);
    } catch {
      /* storage unavailable */
    }
    mem.clear();
  },
};
