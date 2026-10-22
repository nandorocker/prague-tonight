/**
 * App state shared by every view. Deliberately small: the source of truth for
 * events is the loaded feed; the source of truth for the visitor is the store.
 */
import type { FamilyId, PragueEvent, WallTime, WindowDef } from './types';
import { curate, type Curation } from './core/curate';
import { loadEvents } from './core/data';
import { store, type Filters, type SavedItem } from './core/store';
import { fromWallMinutes, nightOf, toPragueWall, wallMinutes, windowsFor } from './core/time';
import { familyFor } from './posters/assign';

export type WindowId = WindowDef['id'];

interface UndoEntry {
  windowKey: string;
  id: string;
  action: 'save' | 'pass';
}

const params = new URLSearchParams(location.search);
/** ?now=2026-10-23T18:45 pins the clock to a Prague wall time, for testing. */
const fixedNow = params.get('now');
const startedAt = Date.now();

function readNow(): WallTime {
  if (fixedNow && /^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(fixedNow)) {
    // Let a pinned clock keep running so status changes can be observed.
    return fromWallMinutes(wallMinutes(fixedNow) + Math.floor((Date.now() - startedAt) / 60000));
  }
  return toPragueWall(new Date());
}

export class App {
  now: WallTime = readNow();
  windows!: [WindowDef, WindowDef];
  win: WindowId = 'tonight';
  events: PragueEvent[] = [];
  byId = new Map<string, PragueEvent>();
  private curations = new Map<WindowId, Curation>();
  filters: Filters = store.filters();
  undo: UndoEntry[] = [];
  /** ?stale=1 simulates a failed refresh. */
  simulatedStale = params.get('stale') === '1';
  /** When the feed was fetched. */
  fetchedAt: WallTime = this.now;
  /** Set to true while a card is being dragged so ticks don't re-render. */
  busy = false;
  inAppNavs = 0;

  constructor() {
    this.load();
    if (this.simulatedStale) this.fetchedAt = fromWallMinutes(wallMinutes(this.now) - 26 * 60);
  }

  load() {
    if (!this.simulatedStale) this.fetchedAt = this.now;
    this.windows = windowsFor(this.now);
    this.events = loadEvents(this.now, store.revision());
    this.byId = new Map(this.events.map((e) => [e.id, e]));
    this.curations.clear();
  }

  /** Advance the clock; reload when the city night rolls over. */
  tick(): boolean {
    const before = this.now;
    this.now = readNow();
    if (nightOf(before) !== nightOf(this.now)) {
      this.load();
      return true;
    }
    return before !== this.now;
  }

  get window(): WindowDef {
    return this.windows.find((w) => w.id === this.win)!;
  }

  curation(id: WindowId = this.win): Curation {
    let c = this.curations.get(id);
    if (!c) {
      c = curate(this.events, this.windows.find((w) => w.id === id)!, this.now, store.overrides());
      this.curations.set(id, c);
    }
    return c;
  }

  /** Unsave everywhere: the deck forgets the swipe so the card can return. */
  unsave(id: string) {
    const item = store.unsave(id);
    const w = item && this.windowOfNight(item.night);
    if (w) store.decide(this.windowKey(w), id, null);
    return item;
  }

  restore(item: SavedItem) {
    store.restore(item);
    const w = this.windowOfNight(item.night);
    if (w) store.decide(this.windowKey(w), item.id, 'save');
  }

  /** Recompute decks after an editor override or a simulated refresh. */
  recurate(reloadData = false) {
    if (reloadData) this.load();
    else this.curations.clear();
  }

  windowKey(id: WindowId = this.win): string {
    return this.windows.find((w) => w.id === id)!.nights.join('+');
  }

  familyOf(e: PragueEvent): FamilyId {
    for (const w of this.windows) {
      if (e.night && w.nights.includes(e.night)) {
        const f = this.curation(w.id).family.get(e.id);
        if (f) return f;
      }
    }
    return store.overrides().family[e.id] ?? familyFor(e);
  }

  windowOfNight(night: string): WindowId | null {
    return this.windows.find((w) => w.nights.includes(night))?.id ?? null;
  }

  isStale(): boolean {
    return this.simulatedStale || !navigator.onLine || wallMinutes(this.now) - wallMinutes(this.fetchedAt) > 6 * 60;
  }
}
