import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { App } from '../src/app';
import type { PragueEvent } from '../src/types';

const event: PragueEvent = { id: 'hermes:source:123', title: 'Saved event', night: '2026-10-23', start: '2026-10-23T21:00', category: 'other', canceled: false, sourceAlive: true, confidence: .8, oneOff: false, local: false, updatedAt: '2026-10-23T12:00', sources: [{ id: '123', name: 'Source', kind: 'aggregator', url: 'https://example.org/event' }] };
let storage: Map<string, string>;
let setItem: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal('location', { search: '' });
  storage = new Map();
  setItem = vi.fn((key: string, value: string) => storage.set(key, value));
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem,
    removeItem: (key: string) => storage.delete(key),
  });
});
afterEach(() => vi.unstubAllGlobals());

const appWithoutFeed = () => ({ byId: new Map(), tonight: '2026-10-24', now: '2026-10-24T18:00' }) as App;

it('retains an observed reschedule through absence and a fresh module read without changing as-saved data', async () => {
  const { store } = await import('../src/core/store');
  store.save(event, 'plain', '2026-10-23T18:00');
  const original = store.saves()[0];
  const moved = { ...event, night: '2026-10-25', start: '2026-10-25T22:00' };
  store.observeEvents([moved]);
  const writes = setItem.mock.calls.length;
  store.observeEvents([moved]);
  store.observeEvents([]);
  store.observeEvents([{ ...event, id: 'not-saved' }, { ...event, night: undefined }]);
  expect(setItem).toHaveBeenCalledTimes(writes);
  vi.resetModules();
  const { store: reloaded } = await import('../src/core/store');
  const { rowsFor } = await import('../src/ui/night');
  expect(reloaded.saves()[0]).toEqual({ ...original, lastObserved: { night: moved.night, start: moved.start } });
  expect(rowsFor(appWithoutFeed(), 'upcoming')[0]).toMatchObject({ night: moved.night, start: moved.start });
  expect(rowsFor(appWithoutFeed(), 'tonight')).toEqual([]);
});

it('replaces observed time precision with date-only rather than resurrecting the saved time', async () => {
  const { store } = await import('../src/core/store');
  store.save(event, 'plain', '2026-10-23T18:00');
  const moved = { ...event, night: '2026-10-25', start: '2026-10-25T22:00' };
  store.observeEvents([moved]);
  store.observeEvents([{ ...moved, start: undefined }]);
  store.observeEvents([]);
  vi.resetModules();
  const { store: reloaded } = await import('../src/core/store');
  const { rowsFor } = await import('../src/ui/night');
  expect(reloaded.saves()[0].lastObserved).toEqual({ night: moved.night });
  expect(reloaded.saves()[0].snap.start).toBe(event.start);
  expect(rowsFor(appWithoutFeed(), 'upcoming')[0].start).toBeUndefined();
  const current = { ...moved, night: '2026-10-26', start: undefined };
  const app = appWithoutFeed();
  app.byId.set(event.id, current);
  expect(rowsFor(app, 'upcoming')[0]).toMatchObject({ night: current.night, start: undefined });
});

it('keeps legacy saves on their original schedule until observed', async () => {
  const { store } = await import('../src/core/store');
  const { rowsFor } = await import('../src/ui/night');
  store.save(event, 'plain', '2026-10-23T18:00');
  const app = { ...appWithoutFeed(), tonight: '2026-10-23', now: '2026-10-23T18:00' } as App;
  expect(rowsFor(app, 'upcoming')[0]).toMatchObject({ night: event.night, start: event.start });
});
