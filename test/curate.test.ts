import { describe, expect, it } from 'vitest';
import { buildFixtures } from '../src/data/fixtures';
import { normalize } from '../src/core/normalize';
import { curate, deckMax, DECK_MIN, isEnded } from '../src/core/curate';
import { applyFilters } from '../src/core/filters';
import { DEFAULT_FILTERS } from '../src/core/store';
import { windowFor } from '../src/core/time';
import type { Span } from '../src/types';

const SPANS: Span[] = [1, 3, 7];

const THU = '2026-10-22T18:45';
const FRI = '2026-10-23T18:45';
const events = normalize(buildFixtures('2026-10-22'));

describe('normalization', () => {
  it('merges duplicates across sources and keeps first-party attribution', () => {
    const jazz = events.filter((e) => e.night === '2026-10-22' && /intimate jazz/i.test(e.title));
    expect(jazz).toHaveLength(1);
    expect(jazz[0].title).toBe('Intimate Jazz');
    expect(jazz[0].sources[0].kind).not.toBe('aggregator');
    expect(jazz[0].sources).toHaveLength(2);
    expect(jazz[0].price).toEqual({ kind: 'paid', min: 250 });
  });

  it('never shows an unverified language', () => {
    const zine = events.find((e) => e.title === 'Zine Making Workshop');
    expect(zine?.language).toBeUndefined();
  });
});

describe('curation', () => {
  for (const now of [THU, FRI, '2026-10-24T14:00', '2026-10-26T19:00', '2026-10-27T19:00']) {
    it(`builds a varied deck for every range (${now})`, () => {
      const evs = normalize(buildFixtures(now.slice(0, 10)));
      for (const span of SPANS) {
        const w = windowFor(now, span);
        const c = curate(evs, w, now);
        expect(c.deck.length).toBeGreaterThanOrEqual(DECK_MIN);
        expect(c.deck.length).toBeLessThanOrEqual(deckMax(span));
        expect(c.deck.every((e) => w.nights.includes(e.night!))).toBe(true);
        // A recurring show takes one slot, not one per night.
        const series = c.deck.map((e) => `${e.venue?.id}|${e.title.toLowerCase()}`);
        expect(new Set(series).size).toBe(series.length);
        const ids = new Set(c.deck.map((e) => e.id));
        expect(ids.size).toBe(c.deck.length);
        // Every deck card is listed in All events.
        for (const e of c.deck) expect(c.index).toContain(e);
        // No family three times in a row.
        const fams = c.deck.map((e) => c.family.get(e.id));
        for (let i = 2; i < fams.length; i++) expect(fams[i] === fams[i - 1] && fams[i] === fams[i - 2]).toBe(false);
        // Category never dominates.
        const cats = new Map<string, number>();
        for (const e of c.deck) cats.set(e.category, (cats.get(e.category) ?? 0) + 1);
        expect(Math.max(...cats.values())).toBeLessThanOrEqual(Math.ceil(c.deck.length * 0.25) + 1);
      }
    });
  }

  it('keeps canceled, dead-source and low-confidence events out of the deck', () => {
    const c = curate(events, windowFor(THU, 1), THU);
    const titles = c.deck.map((e) => e.title);
    expect(titles).not.toContain('Rooftop Jazz');
    expect(titles).not.toContain('Ghost Listing Concert');
    expect(c.index.map((e) => e.title)).not.toContain('Rooftop Jazz');
  });

  it('lists ambiguous-hours events in All events but not the deck', () => {
    const c = curate(events, windowFor(THU, 1), THU);
    expect(c.index.some((e) => e.title === 'Concrete Utopias')).toBe(true);
    expect(c.deck.some((e) => e.title === 'Concrete Utopias')).toBe(false);
  });

  it('does not let 20 DJ listings flood the weekend deck', () => {
    const c = curate(events, windowFor(FRI, 3), FRI);
    const djs = c.deck.filter((e) => e.title.startsWith('DJ Night'));
    expect(djs.length).toBeLessThanOrEqual(6);
    // 20 a night on Friday and Saturday.
    expect(c.index.filter((e) => e.title.startsWith('DJ Night')).length).toBe(40);
  });

  it('keeps a 23:30–03:30 club night relevant after midnight', () => {
    const at = '2026-10-24T01:30';
    const c = curate(events, windowFor(at, 1), at);
    const club = c.index.find((e) => e.title === 'Static Bloom');
    expect(club).toBeDefined();
    expect(isEnded(club!, at)).toBe(false);
    expect(isEnded(club!, '2026-10-24T03:31')).toBe(true);
  });

  it('is stable across runs', () => {
    const a = curate(events, windowFor(THU, 1), THU);
    const b = curate(normalize(buildFixtures('2026-10-22')), windowFor(THU, 1), THU);
    expect(a.deck.map((e) => e.id)).toEqual(b.deck.map((e) => e.id));
    expect([...a.family]).toEqual([...b.family]);
  });
});

describe('filters', () => {
  it('reports events hidden only because the price is unknown', () => {
    const c = curate(events, windowFor(FRI, 1), FRI);
    const r = applyFilters(c.index, { ...DEFAULT_FILTERS, price: 'free' });
    expect(r.items.every((e) => e.price?.kind === 'free')).toBe(true);
    expect(r.hiddenUnknownPrice).toBeGreaterThan(0);
    const r2 = applyFilters(c.index, { ...DEFAULT_FILTERS, price: 'free', includeUnknownPrice: true });
    expect(r2.items.length).toBe(r.items.length + r.hiddenUnknownPrice);
  });
});
