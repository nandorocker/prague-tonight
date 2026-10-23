/**
 * App state shared by every view. Deliberately small: the source of truth for
 * events is the loaded feed; the source of truth for the visitor is the store.
 */
import type { FamilyId, PragueEvent, Span, WallTime, WindowDef } from './types';
import { curate, type Curation } from './core/curate';
import { loadEvents } from './core/data';
import { store, type Filters, type SavedItem } from './core/store';
import { fromWallMinutes, nightOf, toPragueWall, wallMinutes, windowFor } from './core/time';
import { familyFor } from './posters/assign';
import { assignArtwork, fallbackArtwork, normalizeArtwork } from './posters/artwork';
import type { ArtworkToken } from './posters/assets';
import { demo } from './core/mode';
import { parseFeed } from './core/feed';

export type Swipe = 'save' | 'super' | 'pass';

interface UndoEntry {
  id: string;
  action: Swipe;
}

const params = new URLSearchParams(location.search);
/** ?now=2026-10-23T18:45 pins the clock to a Prague wall time. */
const fixedNow = demo ? params.get('now') : null;
const startedAt = Date.now();

function readNow(): WallTime {
  if (fixedNow && /^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(fixedNow)) {
    // Let a pinned clock keep running so status changes can be observed.
    return fromWallMinutes(wallMinutes(fixedNow) + Math.floor((Date.now() - startedAt) / 60000));
  }
  return toPragueWall(new Date());
}

export class App {
  readonly demo = demo;
  loading = !demo;
  error: string | null = null;
  collectedAt: string | null = null;
  private lastAttempt = -Infinity;
  private refreshing = false;
  nowInstant: number | undefined = demo ? undefined : Date.now();
  now: WallTime = readNow();
  span: Span = store.span();
  events: PragueEvent[] = [];
  byId = new Map<string, PragueEvent>();
  private curations = new Map<Span, Curation>();
  filters: Filters = store.filters();
  undo: UndoEntry[] = [];
  /** ?stale=1 simulates a failed refresh. */
  simulatedStale = demo && params.get('stale') === '1';
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
    if (demo) {
      if (!this.simulatedStale) this.fetchedAt = this.now;
      this.events = loadEvents(this.now, store.revision());
    }
    this.byId = new Map(this.events.map((e) => [e.id, e]));
    this.curations.clear();
  }

  /** Live snapshots are shared by the server; never regenerate fixtures on failure. */
  async refresh(): Promise<void> {
    if (demo || this.refreshing || Date.now() - this.lastAttempt < 15 * 60_000) return;
    this.lastAttempt = Date.now();
    this.refreshing = true;
    this.loading = !this.collectedAt;
    try {
      const response = await fetch('/api/events', { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10_000) });
      if (!response.ok) throw new Error('Feed unavailable');
      const feed = parseFeed(await response.json());
      store.observeEvents(feed.events);
      this.events = feed.events;
      this.collectedAt = feed.collectedAt;
      this.fetchedAt = toPragueWall(new Date(feed.collectedAt));
      this.error = feed.refreshFailed ? 'Couldn’t refresh — showing the last available snapshot' : null;
      this.load();
    } catch {
      this.error = 'Couldn’t refresh the live feed';
    } finally {
      this.loading = false;
      this.refreshing = false;
    }
  }

  /** Advance the clock; reload when the city night rolls over. */
  tick(): boolean {
    const before = this.now;
    this.nowInstant = demo ? undefined : Date.now();
    this.now = readNow();
    if (nightOf(before) !== nightOf(this.now)) {
      this.load();
      return true;
    }
    return before !== this.now;
  }

  get tonight(): string {
    return nightOf(this.now);
  }

  get window(): WindowDef {
    return windowFor(this.now, this.span);
  }

  setSpan(span: Span) {
    this.span = span;
    store.setSpan(span);
  }

  curation(span: Span = this.span): Curation {
    let c = this.curations.get(span);
    if (!c) {
      c = curate(this.events, windowFor(this.now, span), this.now, store.overrides(), this.nowInstant);
      this.curations.set(span, c);
    }
    if (span === this.span) this.freezeArtwork(c.deck);
    return c;
  }

  private freezeArtwork(deck: readonly PragueEvent[]) {
    const stored = store.artwork();
    const known = new Map(stored);
    // Saved snapshots win, including image-free saves from before the art library.
    for (const saved of store.saves()) known.set(saved.id, normalizeArtwork(saved.snap.artwork));
    const assigned = assignArtwork(deck, known);
    for (const [id, token] of assigned) known.set(id, token);
    const changed = known.size !== stored.size || [...known].some(([id, token]) => stored.get(id) !== token);
    if (changed) store.setArtwork(known);
  }

  artworkOf(e: PragueEvent): ArtworkToken {
    const saved = store.saves().find((s) => s.id === e.id);
    if (saved) {
      const token = normalizeArtwork(saved.snap.artwork);
      const known = store.artwork();
      if (known.get(e.id) !== token) { known.set(e.id, token); store.setArtwork(known); }
      return token;
    }
    this.curation();
    const known = store.artwork();
    if (!known.has(e.id)) {
      known.set(e.id, fallbackArtwork(e.id));
      store.setArtwork(known);
    }
    return known.get(e.id)!;
  }

  save(e: PragueEvent, fav = false) {
    store.save(e, this.familyOf(e), this.now, fav, this.artworkOf(e));
    store.decide(e.id, 'save');
  }

  /** Unsave everywhere: the deck forgets the swipe so the card can return. */
  unsave(id: string) {
    const item = store.unsave(id);
    store.decide(id, null);
    this.undo = this.undo.filter((u) => u.id !== id);
    return item;
  }

  restore(item: SavedItem) {
    this.undo = this.undo.filter((u) => u.id !== item.id);
    store.restore(item);
    store.decide(item.id, 'save');
  }

  /** Recompute decks after an editor override or a simulated refresh. */
  recurate(reloadData = false) {
    if (reloadData) this.load();
    else this.curations.clear();
  }

  familyOf(e: PragueEvent): FamilyId {
    const saved = store.saves().find((s) => s.id === e.id);
    if (saved) return saved.snap.family;
    return this.curation().family.get(e.id) ?? store.overrides().family[e.id] ?? familyFor(e);
  }

  isStale(): boolean {
    if (!demo) return !!this.error || !navigator.onLine || (!!this.collectedAt && Date.now() - Date.parse(this.collectedAt) > 30 * 60 * 60_000);
    return this.simulatedStale || !navigator.onLine || wallMinutes(this.now) - wallMinutes(this.fetchedAt) > 6 * 60;
  }
}
