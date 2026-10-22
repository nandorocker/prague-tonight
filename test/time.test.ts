import { describe, expect, it } from 'vitest';
import { isNightOver, nightOf, toPragueWall, windowsFor } from '../src/core/time';

describe('city-night clock', () => {
  it('treats early morning as the previous night', () => {
    expect(nightOf('2026-10-24T02:30')).toBe('2026-10-23');
    expect(nightOf('2026-10-24T05:00')).toBe('2026-10-24');
  });

  it('offers Tonight + Tomorrow on a Thursday', () => {
    const [a, b] = windowsFor('2026-10-22T18:45');
    expect(a.nights).toEqual(['2026-10-22']);
    expect(b.label).toBe('Tomorrow');
    expect(b.nights).toEqual(['2026-10-23']);
    expect(a.dateLabel).toBe('THU 22 OCT');
  });

  it('offers Tonight + Weekend on Friday, without duplicating Friday', () => {
    const [a, b] = windowsFor('2026-10-23T20:00');
    expect(a.nights).toEqual(['2026-10-23']);
    expect(b.label).toBe('Weekend');
    expect(b.nights).toEqual(['2026-10-24', '2026-10-25']);
  });

  it('is still Friday night at 02:00 Saturday', () => {
    const [a, b] = windowsFor('2026-10-24T02:00');
    expect(a.nights).toEqual(['2026-10-23']);
    expect(b.label).toBe('Weekend');
  });

  it('offers Sunday on Saturday and Monday on Sunday', () => {
    expect(windowsFor('2026-10-24T12:00')[1].nights).toEqual(['2026-10-25']);
    expect(windowsFor('2026-10-25T12:00')[1].nights).toEqual(['2026-10-26']);
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
