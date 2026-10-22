import { describe, expect, it } from 'vitest';
import { buildFixtures } from '../src/data/fixtures';
import { normalize, sameTitle } from '../src/core/normalize';
import { curate, stillDeckable } from '../src/core/curate';
import { minutesBetween, windowsFor } from '../src/core/time';
import type { SourceRecord } from '../src/types';

const base = buildFixtures('2026-10-22');

describe('trust rules', () => {
  it('ignores prices that only an aggregator reports', () => {
    const evs = normalize(base);
    const dj = evs.find((e) => e.title.startsWith('DJ Night'))!;
    expect(dj.sources.every((s) => s.kind === 'aggregator')).toBe(true);
    expect(dj.price).toBeUndefined();
  });

  it('drops records with non-http links or malformed dates', () => {
    const good = base.find((r) => r.title === 'Small Sounds')!;
    const bad: SourceRecord[] = [
      { ...good, title: 'Evil link', url: 'javascript:alert(1)' },
      { ...good, title: 'Evil date', listedDate: '2026-10-2<img src=x>' as never },
    ];
    const titles = normalize(bad).map((e) => e.title);
    expect(titles).toEqual([]);
  });

  it('does not merge titles that fold to nothing, and keeps ids unique per venue', () => {
    expect(sameTitle('Вечер', 'Ночь')).toBe(false);
    const evs = normalize(base);
    expect(new Set(evs.map((e) => e.id)).size).toBe(evs.length);
  });
});

describe('time', () => {
  it('counts real minutes across the October DST change', () => {
    // Clocks go back at 03:00 CEST on 25 Oct 2026.
    expect(minutesBetween('2026-10-25T01:30', '2026-10-25T03:00')).toBe(150);
    expect(minutesBetween('2026-10-22T18:45', '2026-10-22T19:00')).toBe(15);
  });

  it('drops events from the deck as they go stale while the app stays open', () => {
    const evs = normalize(base);
    const c = curate(evs, windowsFor('2026-10-22T18:45')[0], '2026-10-22T18:45');
    const later = '2026-10-22T23:00';
    const harp = c.deck.find((e) => e.title === 'Harp & Tape Loops')!;
    expect(stillDeckable(harp, '2026-10-22T18:45')).toBe(true);
    expect(stillDeckable(harp, later)).toBe(false);
  });
});
