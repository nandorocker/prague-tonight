import type { FamilyId, PragueEvent } from '../types';
import { hash } from '../core/rng';

export const FAMILIES: Exclude<FamilyId, 'plain'>[] = [
  'acid',
  'editorial',
  'swiss',
  'geo',
  'afterhours',
  'typewall',
  'quiet',
  'collage',
  'culture',
  'geometric',
];

// Keep these persisted IDs: browser-local snapshots and overrides need no migration.
export const FAMILY_NAME: Record<FamilyId, string> = {
  acid: '80s Hair Metal',
  editorial: 'Luxury Fashion Ad',
  swiss: 'Brutalist Art-School',
  geo: '90s Pop',
  afterhours: 'Y2K Digital',
  typewall: 'Indie Xerox Flyer',
  quiet: 'Adult Contemporary Soft Glam',
  collage: 'Street Poster Collage',
  culture: 'Indie Editorial / Culture Paper',
  geometric: 'Geometric Graphic System',
  plain: 'Plain (fallback)',
};

export const STYLE_CLASSES = ['nostalgia', 'editorial', 'experimental'] as const;
export type StyleClass = (typeof STYLE_CLASSES)[number];
export const STYLE_CLASS_NAME: Record<StyleClass, string> = {
  nostalgia: 'Loud nostalgia',
  editorial: 'Tasteful editorial',
  experimental: 'Urban experimentation',
};
export const FAMILY_CLASS: Record<Exclude<FamilyId, 'plain'>, StyleClass> = {
  acid: 'nostalgia', geo: 'nostalgia', afterhours: 'nostalgia', quiet: 'nostalgia',
  culture: 'editorial', swiss: 'editorial', editorial: 'editorial',
  typewall: 'experimental', collage: 'experimental', geometric: 'experimental',
};
export const FAMILY_DESCRIPTION: Record<Exclude<FamilyId, 'plain'>, string> = {
  acid: 'Chrome italic lettering, violet stage light and angular lightning.',
  typewall: 'Monochrome photocopy grain, torn cutouts and handmade registration.',
  geo: 'Candy gloss, bubble lettering and playful flowers and stars.',
  quiet: 'Hazy sage horizons and warm, flowing italic serif typography.',
  swiss: 'Severe black-and-white grids with a small signal-red accent.',
  editorial: 'Reserved ivory space, tall serif lettering and framed abstraction.',
  afterhours: 'Icy metallic browser frames, pixel stars and retro tech typography.',
  collage: 'Bright torn papers, tape corners and bold pasted word stacks.',
  culture: 'Warm arts-paper grids, confident serif headlines and oversized print motifs.',
  geometric: 'Interlocking modernist arcs and bars in burnt orange, teal and cream.',
};

export function posterTitle(e: PragueEvent): string {
  return e.displayTitle ?? e.title;
}

export function eligibleFamilies(e: PragueEvent): FamilyId[] {
  return FAMILIES.filter((f) => fits(e, f));
}

/** Stable seeded preference order of the eligible families for one event. */
function preference(e: PragueEvent, families: FamilyId[]): FamilyId[] {
  return [...families].sort((a, b) => hash(`${e.id}:${a}`) - hash(`${e.id}:${b}`));
}

/** Set by render.ts to avoid a circular import: can this family fit? */
let fits: (e: PragueEvent, f: FamilyId) => boolean = () => true;
export function setFitCheck(fn: typeof fits) {
  fits = fn;
}

/**
 * Assign families in deck order. Avoid repeating a family within two cards
 * and favor the least-used families, alternating style class when feasible.
 * Runs on the unfiltered deck so a poster never changes with filters.
 */
export function assignFamilies(
  deck: PragueEvent[],
  overrides: Record<string, FamilyId> = {},
): Map<string, FamilyId> {
  const out = new Map<string, FamilyId>();
  const counts = new Map<FamilyId, number>();
  const recent: FamilyId[] = [];
  for (const e of deck) {
    let fam = overrides[e.id];
    if (!fam || !fits(e, fam)) {
      const pool = preference(e, eligibleFamilies(e));
      const fresh = pool.filter((f) => !recent.includes(f));
      const last = recent[recent.length - 1];
      const notLast = pool.filter((f) => f !== last);
      const candidates = fresh.length ? fresh : notLast.length ? notLast : pool;
      const least = Math.min(...candidates.map((f) => counts.get(f) ?? 0));
      const balanced = candidates.filter((f) => (counts.get(f) ?? 0) === least);
      const lastClass = last && last !== 'plain' ? FAMILY_CLASS[last] : undefined;
      fam = balanced.find((f) => f !== 'plain' && FAMILY_CLASS[f] !== lastClass) ?? balanced[0] ?? 'plain';
    }
    out.set(e.id, fam);
    counts.set(fam, (counts.get(fam) ?? 0) + 1);
    recent.push(fam);
    if (recent.length > 2) recent.shift();
  }
  return out;
}

/** Family for an event shown outside the deck (All events, details). */
export function familyFor(e: PragueEvent): FamilyId {
  return preference(e, eligibleFamilies(e))[0] ?? 'plain';
}
