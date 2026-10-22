import { describe, expect, it } from 'vitest';
import { buildFixtures } from '../src/data/fixtures';
import { normalize } from '../src/core/normalize';
import { esc, upper } from '../src/core/format';
import { assignFamilies, eligibleFamilies, familyFor, FAMILIES, FAMILY_CLASS, FAMILY_NAME, STYLE_CLASSES } from '../src/posters/assign';
import { familyColor, renderPoster } from '../src/posters/render';
import { balance, fitTitle } from '../src/posters/fit';
import type { FamilyId, PragueEvent } from '../src/types';

const events = normalize(buildFixtures('2026-10-22')).filter((e) => e.night === '2026-10-22');
const draw = events.find((e) => e.displayTitle === 'Draw with Strangers')!;
const ALL: FamilyId[] = [...FAMILIES, 'plain'];
const stripIds = (html: string) => html.replace(/id="[^"]+"/g, 'id="UID"').replace(/url\(#[^)]+\)/g, 'url(#UID)');
const band = (html: string) => html.slice(html.indexOf('<div class="p-band '), -6);
const artwork = (html: string) => stripIds(html.slice(html.indexOf('<div class="p-art"'), html.indexOf('<p class="p-blurb ') === -1 ? html.indexOf('<div class="p-band ') : html.indexOf('<p class="p-blurb ')));
const field = (html: string, cls: string) => html.match(new RegExp(`<(?:span|div) class="${cls}">(.*?)</(?:span|div)>`))?.[1];
const fields = (html: string) => Object.fromEntries(['b-date', 'b-time', 'b-venue', 'b-price', 'b-kind'].map((cls) => [cls, field(html, cls)]));
const titleText = (html: string) => [...html.matchAll(/<span class="ln">(.*?)<\/span>/g)].map((m) => m[1]).join(' ');
const deck = (count: number): PragueEvent[] => Array.from({ length: count }, (_, i) => ({ ...draw, id: `poster-${i}` }));

describe('poster engine', () => {
  it('renders ten distinct art grammars from the same normal fixture', () => {
    expect(FAMILIES).toHaveLength(10);
    const art = FAMILIES.map((f) => {
      const rendered = renderPoster(draw, f);
      expect(rendered.family).toBe(f);
      expect(rendered.html).toContain(`fam-${f}`);
      expect(familyColor(draw, f)).toMatch(/^#[0-9A-Fa-f]{6}$/);
      return artwork(rendered.html);
    });
    expect(new Set(art).size).toBe(10);
    expect(eligibleFamilies(draw)).toEqual(FAMILIES);
  });

  it('retains persisted IDs and groups all ten in the requested cultural classes', () => {
    expect(FAMILIES).toEqual(expect.arrayContaining(['acid', 'geo', 'afterhours', 'quiet', 'swiss', 'editorial', 'typewall', 'collage']));
    expect(STYLE_CLASSES).toEqual(['nostalgia', 'editorial', 'experimental']);
    expect(FAMILIES.filter((f) => FAMILY_CLASS[f] === 'nostalgia').sort()).toEqual(['acid', 'afterhours', 'geo', 'quiet']);
    expect(FAMILIES.filter((f) => FAMILY_CLASS[f] === 'editorial').sort()).toEqual(['culture', 'editorial', 'swiss']);
    expect(FAMILIES.filter((f) => FAMILY_CLASS[f] === 'experimental').sort()).toEqual(['collage', 'geometric', 'typewall']);
    expect(FAMILY_NAME.culture).toBe('Indie Editorial / Culture Paper');
  });

  it('keeps factual values and reading order across art-directed bands, not a shared footer', () => {
    const htmls = ALL.map((f) => renderPoster(draw, f).html);
    for (const [i, html] of htmls.entries()) {
      expect(html.match(/class="p-band /g)).toHaveLength(1);
      expect(html).toContain(`class="p-band band-${ALL[i]}"`);
      expect(html).not.toContain('p-spine');
      expect(html).toContain('viewBox="0 0 100 140"');
      expect(fields(html)).toEqual({
        'b-date': 'THU 22 OCT', 'b-time': '19:00',
        'b-venue': 'Komunitní dílna Kotel · Žižkov', 'b-price': 'Free', 'b-kind': 'Workshop',
      });
      expect(band(html).indexOf('b-when')).toBeLessThan(band(html).indexOf('b-where'));
      expect(band(html).indexOf('b-venue')).toBeLessThan(band(html).indexOf('b-price'));
    }
  });

  it('uses actual category even when genre is supplied, never decoration as a fact', () => {
    const e = { ...draw, category: 'talk' as const, genre: 'Arena spectacular' };
    for (const f of ALL) {
      const { html } = renderPoster(e, f);
      expect(field(html, 'b-kind')).toBe('Talk');
      expect(html).toContain('. Free. Talk.');
      expect(html).not.toContain('Arena spectacular');
      expect(artwork(html)).not.toContain('Talk');
    }
  });

  it('names the actual date and day for an after-midnight start', () => {
    const e = { ...draw, night: '2026-10-22', start: '2026-10-23T01:30' };
    for (const f of ALL) {
      const { html } = renderPoster(e, f);
      expect(field(html, 'b-time')).toBe('01:30');
      expect(field(html, 'b-date')).toBe('FRI 23 OCT');
      expect(band(html)).not.toContain('THU');
      expect(html).toContain('FRI 23 OCT, 01:30');
    }
  });

  it('uses honest unknown labels without inventing a date or free admission', () => {
    const e = { ...draw, price: undefined, start: undefined, night: undefined, venue: undefined };
    for (const f of ALL) {
      const { html } = renderPoster(e, f);
      expect(band(html)).toContain('Check price');
      expect(band(html)).toContain('Time TBC');
      expect(band(html)).toContain('Date TBC');
      expect(band(html)).toContain('Location TBC');
      expect(html).not.toMatch(/\bFree\b/i);
      expect(html).not.toContain('2000');
    }
  });

  it('preserves the full displayed title, original accessible title and escaped Czech facts', () => {
    const e = { ...draw, title: 'Příliš žluťoučký <kůň> & "hosté"', displayTitle: 'Žluťoučký <kůň> & hosté', venue: { id: 'test', name: '<Dům> & "Čaj"', district: 'Žižkov' } };
    for (const f of ALL) {
      const { html } = renderPoster(e, f);
      const visible = titleText(html);
      expect([esc(e.displayTitle), esc(upper(e.displayTitle))]).toContain(visible);
      expect(html).toContain(`aria-label="${esc(e.title)}.`);
      expect(band(html)).toContain('&lt;Dům&gt; &amp; &quot;Čaj&quot; · Žižkov');
      expect(html).not.toContain('<kůň>');
    }
  });

  it('preserves every word of the long fixture through fitting or plain fallback', () => {
    const long = events.find((e) => e.title.length > 110)!;
    const display = long.displayTitle ?? long.title;
    for (const f of ALL) {
      const { html } = renderPoster(long, f);
      expect(titleText(html).toLocaleLowerCase('cs-CZ')).toBe(esc(display).toLocaleLowerCase('cs-CZ'));
    }
  });

  it('renders supplied source blurbs separately and includes their full text in the accessible label', () => {
    expect(draw.blurb).toBeTruthy();
    const blurb = `${draw.blurb} ${'More source context. '.repeat(20)}`;
    for (const f of ALL) {
      const { html } = renderPoster({ ...draw, blurb, description: 'Do not substitute this.' }, f);
      expect(html).toContain(`<p class="p-blurb bl-${f}">${esc(blurb)}</p>`);
      expect(html).toContain(` ${esc(blurb)}"`);
      expect(html).not.toContain('Do not substitute this.');
      expect(artwork(html)).not.toContain(esc(blurb));
    }
  });

  it('uses description only as a fallback and invents no blurb when both are absent', () => {
    for (const f of ALL) {
      const fallback = renderPoster({ ...draw, blurb: undefined, description: 'Source description, not generated copy.' }, f).html;
      expect(fallback).toContain(`<p class="p-blurb bl-${f}">Source description, not generated copy.</p>`);
      expect(fallback).toContain(' Source description, not generated copy."');
      const missing = renderPoster({ ...draw, blurb: undefined, description: undefined }, f).html;
      expect(missing).not.toContain('class="p-blurb');
      expect(missing).not.toContain('Source description');
      expect(titleText(missing)).toBe(titleText(renderPoster(draw, f).html));
    }
  });

  it('escapes malicious source copy without losing the full original text', () => {
    const blurb = 'Živě <img src=x onerror="alert(1)"> & "hosté"';
    for (const f of ALL) {
      const { html } = renderPoster({ ...draw, blurb }, f);
      expect(html).toContain(`<p class="p-blurb bl-${f}">${esc(blurb)}</p>`);
      expect(html).toContain(` ${esc(blurb)}"`);
      expect(html).not.toContain('<img');
    }
  });

  it('is deterministic apart from unique SVG IDs', () => {
    for (const f of ALL) {
      expect(stripIds(renderPoster(draw, f).html)).toBe(stripIds(renderPoster(draw, f).html));
    }
    const input = deck(24);
    expect(assignFamilies(input)).toEqual(assignFamilies(input));
  });

  it('never lets category or start time influence eligibility, assignment, chips or art', () => {
    const changed = { ...draw, category: 'nightlife' as const, start: '2026-10-23T03:45', night: '2026-10-22' };
    expect(eligibleFamilies(changed)).toEqual(eligibleFamilies(draw));
    expect(familyFor(changed)).toBe(familyFor(draw));
    for (const f of ALL) {
      expect(artwork(renderPoster(changed, f).html)).toBe(artwork(renderPoster(draw, f).html));
      expect(familyColor(changed, f)).toBe(familyColor(draw, f));
    }
    const input = deck(24);
    const changedDeck = input.map((e) => ({ ...e, category: changed.category, start: changed.start }));
    expect(assignFamilies(changedDeck)).toEqual(assignFamilies(input));
  });

  it('balances ordinary fitting decks, avoids the last two, and alternates class when feasible', () => {
    const input = deck(30);
    const assigned = [...assignFamilies(input).values()];
    expect(new Set(assigned.slice(0, 12)).size).toBe(10);
    const counts = new Map<FamilyId, number>();
    for (let i = 0; i < assigned.length; i++) {
      const f = assigned[i] as Exclude<FamilyId, 'plain'>;
      expect(assigned.slice(Math.max(0, i - 2), i)).not.toContain(f);
      const fresh = FAMILIES.filter((candidate) => !assigned.slice(Math.max(0, i - 2), i).includes(candidate));
      const least = Math.min(...fresh.map((candidate) => counts.get(candidate) ?? 0));
      expect(counts.get(f) ?? 0).toBe(least);
      if (i) {
        const last = assigned[i - 1] as Exclude<FamilyId, 'plain'>;
        if (fresh.some((candidate) => (counts.get(candidate) ?? 0) === least && FAMILY_CLASS[candidate] !== FAMILY_CLASS[last])) {
          expect(FAMILY_CLASS[f]).not.toBe(FAMILY_CLASS[last]);
        }
      }
      counts.set(f, (counts.get(f) ?? 0) + 1);
    }
    expect([...counts.values()]).toEqual(Array(10).fill(3));
  });

  it('handles empty and short decks, honors fitting overrides deterministically', () => {
    expect(assignFamilies([]).size).toBe(0);
    const input = deck(2);
    const overrides = { [input[0].id]: 'culture' as const, [input[1].id]: 'plain' as const };
    expect([...assignFamilies(input, overrides).values()]).toEqual(['culture', 'plain']);
    expect(assignFamilies(input, overrides)).toEqual(assignFamilies(input, overrides));
    expect(assignFamilies([draw]).get(draw.id)).toBe(familyFor(draw));
  });

  it('truthfully falls back when no family fits, including an impossible override', () => {
    const impossible = { ...draw, id: 'impossible', displayTitle: 'Ž'.repeat(240) };
    expect(eligibleFamilies(impossible)).toEqual([]);
    expect(familyFor(impossible)).toBe('plain');
    const input = [impossible, { ...impossible, id: 'impossible-2' }];
    for (const f of FAMILIES) {
      const result = renderPoster(impossible, f);
      expect(result.family).toBe('plain');
      expect(result.html).toContain('fam-plain');
      expect(titleText(result.html)).toBe(impossible.displayTitle);
      expect(assignFamilies(input, { impossible: f }).get('impossible')).toBe(result.family);
    }
    expect([...assignFamilies(input).values()]).toEqual(['plain', 'plain']);
  });

  it('rejects an unrenderable override without discarding other fitting families', () => {
    const e = { ...draw, id: 'narrow-pool', displayTitle: 'W'.repeat(20) };
    const eligible = eligibleFamilies(e);
    expect(eligible.length).toBeGreaterThan(0);
    expect(eligible).not.toContain('acid');
    expect(renderPoster(e, 'acid').family).toBe('plain');
    const chosen = assignFamilies([e], { [e.id]: 'acid' }).get(e.id)!;
    expect(eligible).toContain(chosen);
    expect(renderPoster(e, chosen).family).toBe(chosen);
  });

  it('relaxes the two-card rule to alternate a two-family fitting pool', () => {
    const input = deck(6).map((e) => ({ ...e, displayTitle: 'W'.repeat(21) }));
    expect(eligibleFamilies(input[0]).sort()).toEqual(['culture', 'quiet']);
    const assigned = [...assignFamilies(input).values()];
    for (let i = 1; i < assigned.length; i++) expect(assigned[i]).not.toBe(assigned[i - 1]);
  });

  it('balances line breaks', () => {
    expect(balance(['DRAW', 'WITH', 'STRANGERS'], 2)).toEqual(['DRAW WITH', 'STRANGERS']);
    expect(fitTitle('BELOW GROUND', { w: 90, h: 50, charW: 0.5, lineH: 1, max: 30, min: 8, maxLines: 3 }).ok).toBe(true);
  });
});
