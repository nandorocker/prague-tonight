import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseFeed, safeHttpUrl } from '../src/core/feed';
import { App } from '../src/app';
import { store } from '../src/core/store';
import { statusOf } from '../src/ui/common';
import { rowsFor } from '../src/ui/night';
import { diversify, hasStarted, stillDeckable } from '../src/core/curate';
import { applyFilters } from '../src/core/filters';
import type { PragueEvent } from '../src/types';
vi.hoisted(() => { vi.stubGlobal('location', { search: '' }); });

const e: PragueEvent = { id: 'hermes:goout:123', title: 'Original title', start: '2026-10-23T21:00', night: '2026-10-23', dateAmbiguous: false, category: 'other', canceled: false, sourceAlive: true, confidence: .8, oneOff: false, local: false, updatedAt: '2026-10-23T12:00', sources: [{ id: '123', name: 'Source', kind: 'aggregator', url: 'https://example.org/event' }], venue: { id: 'venue', name: 'Venue', district: 'Praha 1' } };
const feed = { schemaVersion: 1, collectedAt: '2026-10-23T10:00:00Z', events: [e] };
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-23T16:45:00Z'));
  vi.stubGlobal('navigator', { onLine: true });
  vi.stubGlobal('localStorage', {});
  store.clearAll();
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('live feed boundary', () => {
  it('accepts normalized IDs without re-identifying title/time', () => {
    expect(parseFeed({ ...feed, collectedAt: '2026-10-23T10:00:00.123456+00:00' }).collectedAt).toBe('2026-10-23T10:00:00.123456+00:00');
    expect(parseFeed(feed).events[0].id).toBe(e.id);
    expect(parseFeed({ ...feed, events: [{ ...e, title: 'Changed', start: '2026-10-24T22:00' }] }).events[0].id).toBe(e.id);
  });
  it.each(['javascript:alert(1)', 'https://user:pass@example.org', '//example.org', 'https://example.org/\nfoo'])('rejects unsafe link %s', (url) => {
    expect(safeHttpUrl(url)).toBe(false);
    expect(() => parseFeed({ ...feed, events: [{ ...e, sources: [{ ...e.sources[0], url }] }] })).toThrow();
  });
  it.each([{ schemaVersion: 2 }, { collectedAt: 'yesterday' }, { events: [e, e] }, { events: [{ ...e, canceled: 'false' }] }, { events: [{ ...e, confidence: Infinity }] }, { events: [{ ...e, category: 'invented' }] }, { events: [{ ...e, start: '2026-02-30T20:00' }] }, { events: [{ ...e, sources: [] }] }])('rejects malformed snapshot %j', (change) => {
    expect(() => parseFeed({ ...feed, ...change })).toThrow();
  });
  it('never falls back to fixtures on initial failure; throttles attempts', async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error('offline'));
    vi.stubGlobal('fetch', fetcher);
    const app = new App();
    expect(app.loading).toBe(true);
    await app.refresh();
    await app.refresh();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(app.events).toEqual([]);
    expect(app.collectedAt).toBeNull();
    expect(app.error).toBeTruthy();
    expect(app.loading).toBe(false);
  });
  it('retains last good events and collection time after failure and load()', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => feed }).mockRejectedValue(new Error('offline'));
    vi.stubGlobal('fetch', fetcher);
    const app = new App();
    await app.refresh();
    const events = app.events;
    expect(app.isStale()).toBe(false);
    vi.advanceTimersByTime(15 * 60_000);
    await app.refresh();
    app.load();
    expect(app.events).toBe(events);
    expect(app.collectedAt).toBe(feed.collectedAt);
    expect(app.isStale()).toBe(true);
  });
  it('distinguishes snapshot absence from explicit removal', () => {
    expect(statusOf(undefined, undefined, '2026-10-23T18:45')).toEqual([{ kind: 'unavailable', text: 'Not in latest feed — check the original listing' }]);
    expect(statusOf({ ...e, sourceAlive: false }, undefined, '2026-10-23T18:45')[0].kind).toBe('removed');
  });
  it('shows a failed server refresh even when the last good feed is returned', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ...feed, refreshFailed: true }) }));
    const app = new App();
    await app.refresh();
    expect(app.events[0].id).toBe(e.id);
    expect(app.collectedAt).toBe(feed.collectedAt);
    expect(app.error).toBeTruthy();
    expect(app.isStale()).toBe(true);
    expect(() => parseFeed({ ...feed, refreshFailed: 'false' })).toThrow();
  });
  it('treats a daily snapshot as fresh until thirty hours old', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => feed }));
    const app = new App();
    await app.refresh();
    vi.setSystemTime(new Date('2026-10-24T15:59:00Z'));
    expect(app.isStale()).toBe(false);
    vi.setSystemTime(new Date('2026-10-24T16:01:00Z'));
    expect(app.isStale()).toBe(true);
  });
  it('uses current event night for saved filtering without deleting the save', () => {
    const app = new App();
    store.save(e, 'plain', app.now);
    app.byId.set(e.id, { ...e, night: '2026-10-24', start: '2026-10-24T21:00' });
    expect(rowsFor(app, 'tonight')).toHaveLength(0);
    expect(rowsFor(app, 'upcoming')[0].night).toBe('2026-10-24');
    expect(store.saves()[0].night).toBe('2026-10-23');
  });
  it('persists reschedules through validated refresh, absence, and a new app', async () => {
    const moved = { ...e, night: '2026-10-24', start: '2026-10-24T22:00' };
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ...feed, events: [moved] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ...feed, events: [] }) }));
    store.save(e, 'plain', '2026-10-23T18:00');
    const app = new App();
    await app.refresh();
    vi.advanceTimersByTime(15 * 60_000);
    await app.refresh();
    const reloaded = new App();
    expect(rowsFor(reloaded, 'upcoming')[0]).toMatchObject({ night: moved.night, start: moved.start });
    expect(store.saves()[0].snap.start).toBe(e.start);
  });
  it('does not cap unknown categories or assign a mood', () => {
    const events = Array.from({ length: 12 }, (_, i) => ({ ...e, id: `hermes:s:${i}`, venue: { ...e.venue!, id: `v${i}` } }));
    expect(diversify(events, '2026-10-23T18:45', 12, 1)).toHaveLength(12);
    expect(applyFilters(events, { price: 'any', includeUnknownPrice: false, moods: ['social'], district: '' }).items).toEqual([]);
  });
  it('preserves the second DST occurrence for countdown and eligibility', () => {
    const second = { ...e, start: '2026-10-25T02:30', startInstant: '2026-10-25T01:30:00Z', night: '2026-10-24' };
    const now = Date.parse('2026-10-25T00:45:00Z');
    expect(parseFeed({ ...feed, events: [second] }).events[0].startInstant).toBe(second.startInstant);
    expect(hasStarted(second, '2026-10-25T02:45', now)).toBe(false);
    expect(statusOf(second, undefined, '2026-10-25T02:45', now)).toEqual([{ kind: 'soon', text: 'Starts in 45 min' }]);
    expect(stillDeckable(second, '2026-10-25T02:45', now)).toBe(true);
    expect(hasStarted(second, '2026-10-25T02:45', Date.parse('2026-10-25T01:45:00Z'))).toBe(true);
    expect(() => parseFeed({ ...feed, events: [{ ...second, startInstant: '2026-10-25T02:30:00Z' }] })).toThrow();
  });
  it('isolates live storage and reset from demo keys', () => {
    const storage: Record<string, string | Function> = { 'pt:span': '7', 'pt:saves': '[]', getItem(k: string) { return storage[k] ?? null; }, setItem(k: string, v: string) { storage[k] = v; }, removeItem(k: string) { delete storage[k]; } };
    vi.stubGlobal('localStorage', storage);
    expect(store.span()).toBe(1);
    store.setSpan(3);
    expect(storage['pt:span']).toBe('7');
    expect(storage['pt:live:span']).toBe('3');
    store.clearAll();
    expect(storage['pt:span']).toBe('7');
    expect(storage['pt:live:span']).toBeUndefined();
  });
});
