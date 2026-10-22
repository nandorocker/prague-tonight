import { describe, expect, it } from 'vitest';
import { isNightOver, nightOf, toPragueWall, windowFor } from '../src/core/time';

describe('city-night clock', () => {
  it('treats early morning as the previous night', () => {
    expect(nightOf('2026-10-24T02:30')).toBe('2026-10-23');
    expect(nightOf('2026-10-24T05:00')).toBe('2026-10-24');
  });

  it('builds Tonight, 3-day and 7-day ranges starting tonight', () => {
    const t = windowFor('2026-10-22T18:45', 1);
    expect(t.nights).toEqual(['2026-10-22']);
    expect(t.label).toBe('Tonight');
    expect(t.dateLabel).toBe('THU 22 OCT');
    const three = windowFor('2026-10-22T18:45', 3);
    expect(three.nights).toEqual(['2026-10-22', '2026-10-23', '2026-10-24']);
    expect(three.dateLabel).toBe('THU 22 – SAT 24 OCT');
    expect(windowFor('2026-10-29T18:45', 7).dateLabel).toBe('THU 29 OCT – WED 4 NOV');
  });

  it('is still Friday night at 02:00 Saturday', () => {
    expect(windowFor('2026-10-24T02:00', 1).nights).toEqual(['2026-10-23']);
    expect(windowFor('2026-10-24T02:00', 3).nights[0]).toBe('2026-10-23');
  });

  it('ends a night at the 05:00 cutoff', () => {
    expect(isNightOver('2026-10-25', '2026-10-26T04:59')).toBe(false);
    expect(isNightOver('2026-10-25', '2026-10-26T05:00')).toBe(true);
  });

  it('converts instants to Prague wall time across DST', () => {
    expect(toPragueWall(new Date('2026-10-22T16:45:00Z'))).toBe('2026-10-22T18:45');
    expect(toPragueWall(new Date('2026-12-01T16:45:00Z'))).toBe('2026-12-01T17:45');
  });
});
