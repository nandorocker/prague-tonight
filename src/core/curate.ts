import type { FamilyId, PragueEvent, WallTime, WindowDef } from '../types';
import { assignFamilies, familyFor } from '../posters/assign';
import { fold } from './format';
import { hash } from './rng';
import { isNightOver, minutesBetween, wallMinutes } from './time';

export interface Overrides {
  pinned: string[];
  removed: string[];
  family: Record<string, FamilyId>;
}

export const NO_OVERRIDES: Overrides = { pinned: [], removed: [], family: {} };

export interface Exclusion {
  event: PragueEvent;
  reason: string;
  /** Still listed in All events, only kept out of the deck. */
  listed: boolean;
}

export interface Curation {
  window: WindowDef;
  /** Everything a visitor can browse in All events, in time order. */
  index: PragueEvent[];
  /** The swipe deck, in swipe order. */
  deck: PragueEvent[];
  family: Map<string, FamilyId>;
  excluded: Exclusion[];
}

export const DECK_MIN = 20;
export const DECK_MAX = 35;
const MIN_LIST_CONFIDENCE = 0.4;
const MIN_DECK_CONFIDENCE = 0.6;

/** An event is over: known end has passed, or the whole night has. */
export function isEnded(e: PragueEvent, now: WallTime): boolean {
  if (e.end) return minutesBetween(e.end, now) >= 0;
  return e.night ? isNightOver(e.night, now) : false;
}

export function hasStarted(e: PragueEvent, now: WallTime): boolean {
  return !!e.start && minutesBetween(e.start, now) >= 0;
}

/** Why an event cannot appear anywhere for this window, if it can't. */
function listBlocker(e: PragueEvent, now: WallTime): string | null {
  if (e.canceled) return 'Canceled by source';
  if (!e.sourceAlive) return 'Source page no longer exists';
  if (!e.sources[0]?.url) return 'No source link';
  if (e.confidence < MIN_LIST_CONFIDENCE) return 'Low source confidence';
  if (isEnded(e, now)) return 'Already finished';
  return null;
}

/** Why a listable event is not good enough for the deck, if it isn't. */
function deckBlocker(e: PragueEvent, now: WallTime): string | null {
  if (e.dateAmbiguous || !e.start) return 'Opening hours for this night not confirmed';
  if (e.confidence < MIN_DECK_CONFIDENCE) return 'Below deck confidence bar';
  if (!e.venue?.district) return 'Location not confirmed';
  // Long-running events (club nights) stay while there's real time left.
  if (startedTooLongAgo(e, now)) return 'Started over an hour ago';
  return null;
}

/** Long-running events (club nights) stay while there's real time left. */
function startedTooLongAgo(e: PragueEvent, now: WallTime): boolean {
  if (!e.start || minutesBetween(e.start, now) <= 60) return false;
  return !e.end || minutesBetween(now, e.end) < 90;
}

/**
 * Curations are computed once per load so the deck order stays stable; this
 * re-checks time-sensitive rules as the clock moves while the app is open.
 */
export function stillListable(e: PragueEvent, now: WallTime): boolean {
  return !e.canceled && !isEnded(e, now);
}

export function stillDeckable(e: PragueEvent, now: WallTime): boolean {
  return stillListable(e, now) && !startedTooLongAgo(e, now);
}

/** Human-readable signals, kept simple so they can be tuned by hand. */
export function score(e: PragueEvent, now: WallTime): number {
  let s = 0;
  const until = minutesBetween(now, e.start!) / 60;
  if (until < 0) s += 0.25;
  else if (until <= 24) s += 0.6 - Math.min(until, 8) * 0.03;
  else s += 0.45;
  const hour = Number(e.start!.slice(11, 13));
  if (hour >= 18 && hour <= 22) s += 0.1;
  if (e.oneOff) s += 0.15;
  if (e.local) s += 0.1;
  s += e.confidence * 0.3;
  if (e.price?.kind === 'free') s += 0.1;
  else if (e.price && e.price.min <= 200) s += 0.05;
  if (e.description) s += 0.05;
  // Small stable jitter so equal scores don't always tie the same way.
  s += (hash(`${e.id}:jitter`) % 1000) / 10000;
  return s;
}

/**
 * Greedy diversity pass: repeatedly take the best remaining candidate after
 * penalties for repeating the category, venue or district of recent picks.
 * Hard caps stop any one category or venue flooding the deck.
 */
export function diversify(candidates: PragueEvent[], now: WallTime, size: number, nights: number): PragueEvent[] {
  const base = new Map(candidates.map((e) => [e.id, score(e, now)]));
  const catCap = Math.max(3, Math.ceil(size * 0.25));
  const venueCap = nights;
  const picked: PragueEvent[] = [];
  const cat = new Map<string, number>();
  const venue = new Map<string, number>();
  const district = new Map<string, number>();
  // A weekly show appears once per deck, whichever night scores best.
  const series = new Set<string>();
  const seriesOf = (e: PragueEvent) => `${e.venue!.id}|${fold(e.title)}`;
  const left = new Set(candidates);

  const value = (e: PragueEvent, strict: boolean): number => {
    if (strict && (cat.get(e.category) ?? 0) >= catCap) return -Infinity;
    if (strict && (venue.get(e.venue!.id) ?? 0) >= venueCap) return -Infinity;
    if (strict && series.has(seriesOf(e))) return -Infinity;
    let v = base.get(e.id)!;
    const last = picked.slice(-2);
    if (last.at(-1)?.category === e.category) v -= 0.3;
    else if (last.some((p) => p.category === e.category)) v -= 0.12;
    v -= (district.get(e.venue!.district!) ?? 0) * 0.04;
    v -= (cat.get(e.category) ?? 0) * 0.03;
    return v;
  };

  while (picked.length < size && left.size) {
    let best: PragueEvent | null = null;
    let bestV = -Infinity;
    for (const e of left) {
      const v = value(e, true);
      if (v > bestV) [best, bestV] = [e, v];
    }
    if (!best) break; // only capped candidates remain: stop rather than flood
    picked.push(best);
    left.delete(best);
    cat.set(best.category, (cat.get(best.category) ?? 0) + 1);
    venue.set(best.venue!.id, (venue.get(best.venue!.id) ?? 0) + 1);
    district.set(best.venue!.district!, (district.get(best.venue!.district!) ?? 0) + 1);
    series.add(seriesOf(best));
  }
  return picked;
}

/** Upper bound on the deck for a span: 35 for one night, more for longer ranges. */
export function deckMax(nights = 1): number {
  return Math.round(DECK_MAX * Math.sqrt(nights));
}

export function deckSize(eligible: number, nights = 1): number {
  return Math.min(eligible, deckMax(nights), Math.max(DECK_MIN, Math.round(eligible * 0.7)));
}

export function curate(
  events: PragueEvent[],
  window: WindowDef,
  now: WallTime,
  overrides: Overrides = NO_OVERRIDES,
): Curation {
  const inWindow = events.filter((e) => e.night && window.nights.includes(e.night));
  const excluded: Exclusion[] = [];
  const index: PragueEvent[] = [];
  const candidates: PragueEvent[] = [];
  const pinned: PragueEvent[] = [];

  for (const e of inWindow) {
    const block = listBlocker(e, now);
    if (block) {
      excluded.push({ event: e, reason: block, listed: false });
      continue;
    }
    index.push(e);
    if (overrides.removed.includes(e.id)) {
      excluded.push({ event: e, reason: 'Removed from deck by editor', listed: true });
      continue;
    }
    const deckBlock = deckBlocker(e, now);
    if (deckBlock) {
      excluded.push({ event: e, reason: deckBlock, listed: true });
      continue;
    }
    (overrides.pinned.includes(e.id) ? pinned : candidates).push(e);
  }

  const size = deckSize(candidates.length + pinned.length, window.nights.length);
  const picked = diversify(candidates, now, Math.max(0, size - pinned.length), window.nights.length);
  const deck = [...pinned, ...picked];
  const chosen = new Set(deck.map((e) => e.id));
  for (const e of candidates) {
    if (!chosen.has(e.id)) excluded.push({ event: e, reason: 'Not selected (diversity / deck size)', listed: true });
  }

  const family = assignFamilies(deck, overrides.family);
  for (const e of index) if (!family.has(e.id)) family.set(e.id, overrides.family[e.id] ?? familyFor(e));

  index.sort(
    (a, b) =>
      (a.start ? 0 : 1) - (b.start ? 0 : 1) ||
      (a.start && b.start ? wallMinutes(a.start) - wallMinutes(b.start) : 0) ||
      a.title.localeCompare(b.title),
  );
  return { window, index, deck, family, excluded };
}
