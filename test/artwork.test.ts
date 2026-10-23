import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ARTWORK_ASSETS } from '../src/posters/assets';
import { assignArtwork, artworkAsset, artworkMap, artworkMode, fallbackArtwork, normalizeArtwork } from '../src/posters/artwork';
import { FAMILIES } from '../src/posters/assign';
import { renderPoster } from '../src/posters/render';
import { isOriginalFamily } from '../src/posters/originals';
import { buildFixtures } from '../src/data/fixtures';
import { normalize } from '../src/core/normalize';
import { esc } from '../src/core/format';
import { snapshot, store } from '../src/core/store';

vi.hoisted(() => { vi.stubGlobal('location', { search: '?demo=1&now=2026-10-22T18:45' }); });
const { App } = await import('../src/app');
const e = normalize(buildFixtures('2026-10-22')).find((x) => x.displayTitle === 'Draw with Strangers')!;
const deck = (n: number) => Array.from({ length: n }, (_, i) => ({ ...e, id: `imagery-${i}` }));
const active = (html: string) => html.split('<template')[0];
const stripIds = (html: string) => html.replace(/id="[^"]+"/g, 'id="UID"').replace(/url\(#[^)]+\)/g, 'url(#UID)');
const headline = (html: string) => [...active(html).matchAll(/<span class="ln(?: [^"]*)?">(.*?)<\/span>/g)].map((m) => m[1]).join(' ');
let storage: Map<string, string>;
beforeEach(() => {
  storage = new Map();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  });
});

describe('independent decorative artwork', () => {
  it('keeps demo writes and reset separate from live storage', () => {
    const local: Record<string, unknown> = { 'pt:live:span': '7' };
    vi.stubGlobal('localStorage', Object.assign(local, {
      getItem: (key: string) => local[key] ?? null,
      setItem: (key: string, value: string) => { local[key] = value; },
      removeItem: (key: string) => { delete local[key]; },
    }));
    store.setSpan(3);
    expect(local['pt:span']).toBe('3');
    expect(local['pt:live:span']).toBe('7');
    store.clearAll();
    expect(local['pt:span']).toBeUndefined();
    expect(local['pt:live:span']).toBe('7');
  });
  it.each([20, 30])('balances a %i-card initial sequence and keeps photographic / face runs rare', (n) => {
    const tokens = [...assignArtwork(deck(n), new Map()).values()];
    const counts = { none: 0, found: 0, cartoon: 0, collage: 0 };
    for (const token of tokens) counts[artworkMode(token)]++;
    for (const [mode, target] of Object.entries({ none: .55, found: .2, cartoon: .15, collage: .1 })) {
      expect(Math.abs(counts[mode as keyof typeof counts] - n * target)).toBeLessThanOrEqual(1);
    }
    expect(tokens.filter((t) => artworkAsset(t)?.faceDominant).length).toBeLessThanOrEqual(n * .1);
    for (let i = 2; i < n; i++) {
      expect(tokens.slice(i - 2, i + 1).every((t) => artworkAsset(t)?.photographic)).toBe(false);
      expect(tokens.slice(i - 2, i + 1).every((t) => artworkAsset(t)?.faceDominant)).toBe(false);
    }
  });

  it('uses only stable IDs, not category, time, title or family', () => {
    const input = deck(30);
    const changed = input.map((x) => ({ ...x, category: 'talk' as const, start: '2026-10-23T03:45', title: 'Different', family: 'acid' }));
    expect(assignArtwork(changed, new Map())).toEqual(assignArtwork(input, new Map()));
    expect(fallbackArtwork(e.id)).toBe(fallbackArtwork(e.id));
    expect(new Set(input.map((x) => fallbackArtwork(x.id))).size).toBeGreaterThan(1);
  });

  it('freezes existing choices including none, even if a reordered / filtered deck makes a run', () => {
    const input = deck(30);
    const known = assignArtwork(input, new Map());
    const filtered = input.filter((_, i) => i % 3).reverse();
    const result = assignArtwork(filtered, known);
    for (const x of filtered) expect(result.get(x.id)).toBe(known.get(x.id));
    expect([...known.values()]).toContain('none');
    const photo = ARTWORK_ASSETS.find((a) => a.photographic);
    if (photo) {
      const fixed = new Map(input.slice(0, 3).map((x) => [x.id, photo.id]));
      expect(assignArtwork(input.slice(0, 3), fixed)).toEqual(fixed);
    }
  });

  it('validates raw containers and unknown / malformed tokens without rerolling', () => {
    for (const bad of [null, [], 4, 'text']) expect(artworkMap(bad).size).toBe(0);
    const choices = artworkMap({ a: 'missing-asset', b: null, c: {}, d: 'none', e: ARTWORK_ASSETS[0].id });
    expect([...choices.values()]).toEqual(['none', 'none', 'none', 'none', ARTWORK_ASSETS[0].id]);
    expect(assignArtwork([{ id: 'a' }], choices).get('a')).toBe('none');
    expect(normalizeArtwork('<img onerror=bad>')).toBe('none');
    storage.set('pt:artwork', '{broken');
    expect(store.artwork().size).toBe(0);
    storage.set('pt:artwork', JSON.stringify({ [e.id]: 'deleted-asset' }));
    expect(new App().artworkOf(e)).toBe('none');
  });

  it('initializes only the active unfiltered deck; keeps caches through range, filters and reloads', () => {
    const app = new App();
    expect(store.artwork().size).toBe(0);
    app.curation(7); // Settings counts must not freeze preview spans.
    expect(store.artwork().size).toBe(0);
    const current = app.curation();
    const known = store.artwork();
    expect(known.size).toBe(current.deck.length);
    const first = current.deck[0];
    const token = app.artworkOf(first);
    app.filters.price = 'free';
    app.recurate(true);
    expect(app.artworkOf(first)).toBe(token);
    app.setSpan(3);
    app.curation();
    expect(new App().artworkOf(first)).toBe(token);
    for (const [id, value] of known) expect(store.artwork().get(id)).toBe(value);
  });

  it('freezes deterministic off-deck details but does not prune absent event IDs', () => {
    const app = new App();
    const off = { ...e, id: 'off-deck-different-source' };
    const token = app.artworkOf(off);
    expect(token).toBe(fallbackArtwork(off.id));
    expect(store.artwork().get(off.id)).toBe(token);
    app.load();
    expect(new App().artworkOf(off)).toBe(token);
  });

  it('new saves, unsave/undo and restore preserve artwork; legacy saves remain image-free', () => {
    const app = new App();
    const token = ARTWORK_ASSETS[0].id;
    store.setArtwork(new Map([[e.id, token]]));
    app.save(e);
    expect(store.saves()[0].snap.artwork).toBe(token);
    const removed = app.unsave(e.id)!;
    app.restore(removed);
    expect(app.artworkOf(e)).toBe(token);
    expect(store.saves()[0].snap.artwork).toBe(token);
    const legacy = snapshot(e, 'acid');
    delete legacy.artwork;
    storage.set('pt:saves', JSON.stringify([{ id: e.id, night: e.night, savedAt: app.now, snap: legacy }]));
    expect(app.artworkOf(e)).toBe('none');
    expect(store.artwork().get(e.id)).toBe('none');
    app.unsave(e.id);
    expect(app.artworkOf(e)).toBe('none');
    storage.set('pt:saves', JSON.stringify([{ id: e.id, night: e.night, savedAt: app.now, snap: { ...legacy, artwork: 'missing' } }]));
    expect(app.artworkOf(e)).toBe('none');
  });

  it.each([
    { name: 'legacy save without a cache', artwork: undefined, cached: undefined, expected: 'none' },
    { name: 'legacy save with a conflicting cache', artwork: undefined, cached: 'archive-horses', expected: 'none' },
    { name: 'illustrated save with a conflicting cache', artwork: 'confused-pigeon', cached: 'archive-horses', expected: 'confused-pigeon' },
    { name: 'unknown saved artwork', artwork: 'retired-asset', cached: 'archive-horses', expected: 'none' },
  ])('preserves $name when removed before visiting deck or details', ({ artwork, cached, expected }) => {
    const snap = { ...snapshot(e, 'acid'), artwork };
    storage.set('pt:saves', JSON.stringify([{ id: e.id, night: e.night, savedAt: e.start, snap }]));
    if (cached) store.setArtwork(new Map([[e.id, cached]]));
    const app = new App();
    expect(store.artwork().size).toBe(cached ? 1 : 0);
    const removed = app.unsave(e.id)!;
    expect(store.saves()).toHaveLength(0);
    expect(store.artwork().get(e.id)).toBe(expected);
    expect(new App().artworkOf(e)).toBe(expected);
    app.restore(removed);
    expect(app.artworkOf(e)).toBe(expected);
  });

  it('works best-effort when localStorage is unavailable', () => {
    vi.stubGlobal('localStorage', { getItem() { throw Error('blocked'); }, setItem() { throw Error('blocked'); }, removeItem() { throw Error('blocked'); } });
    store.clearAll();
    const app = new App();
    const token = app.artworkOf(e);
    expect(new App().artworkOf(e)).toBe(token);
    store.clearAll();
    expect(store.artwork().size).toBe(0);
  });

  it('all ten families preserve full titles, facts and source blurbs in both variants', () => {
    const token = ARTWORK_ASSETS[0].id;
    for (const f of FAMILIES.filter((f) => !isOriginalFamily(f))) {
      const plain = renderPoster(e, f);
      const illustrated = renderPoster(e, f, token);
      const html = active(illustrated.html);
      expect(illustrated.family).toBe(f);
      expect(illustrated.artwork).toBe(token);
      expect(headline(html).toLocaleLowerCase('cs-CZ')).toBe(esc(e.displayTitle!).toLocaleLowerCase('cs-CZ'));
      expect(html.slice(html.indexOf('<p class="p-blurb'))).toBe(plain.html.slice(plain.html.indexOf('<p class="p-blurb')));
      expect(html.match(/aria-label="[^"]+"/)?.[0]).toBe(plain.html.match(/aria-label="[^"]+"/)?.[0]);
      const fallback = illustrated.html.split('<template class="artwork-fallback">')[1].replace('</template>', '');
      expect(fallback).not.toContain('<img');
      expect(stripIds(fallback)).toBe(stripIds(plain.html));
    }
  });

  it('all eight Originals ignore imagery without losing their composition or facts', () => {
    const originals = FAMILIES.filter(isOriginalFamily);
    expect(originals).toHaveLength(8);
    for (const f of originals) {
      const plain = renderPoster(e, f);
      const illustrated = renderPoster(e, f, ARTWORK_ASSETS[0].id);
      expect(illustrated.family).toBe(f);
      expect(illustrated.artwork).toBe('none');
      expect(stripIds(illustrated.html)).toBe(stripIds(plain.html));
      expect(illustrated.html).not.toMatch(/<img|<template|p-subject|has-artwork/);
      expect(headline(illustrated.html).toLocaleLowerCase('cs-CZ')).toBe(esc(e.displayTitle!).toLocaleLowerCase('cs-CZ'));
      store.save(e, f, '2026-10-22T18:45');
      expect(store.saves()[0].snap.family).toBe(f);
      const removed = store.unsave(e.id)!;
      store.restore(removed);
      expect(store.saves()[0].snap.family).toBe(f);
      store.clearSaves();
    }
  });

  it('bad tokens and plain family are fully image-free; a long title drops the subject rather than words', () => {
    for (const f of FAMILIES) {
      expect(stripIds(renderPoster(e, f, 'bad-token').html)).toBe(stripIds(renderPoster(e, f).html));
    }
    expect(renderPoster(e, 'plain', ARTWORK_ASSETS[0].id).artwork).toBe('none');
    const long = { ...e, displayTitle: 'Wide words preserve every single part of this unusually long event headline today' };
    const result = renderPoster(long, 'collage', ARTWORK_ASSETS[0].id);
    expect(result.artwork).toBe('none');
    expect(result.html).not.toContain('<img');
    expect(headline(result.html).toLowerCase()).toBe(long.displayTitle.toLowerCase());
  });
});
