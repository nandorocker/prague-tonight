import type { Category, FamilyId, PragueEvent } from '../types';
import { hash } from '../core/rng';
import { clock } from '../core/time';

export const FAMILIES: Exclude<FamilyId, 'plain'>[] = [
  'acid',
  'editorial',
  'swiss',
  'geo',
  'afterhours',
  'typewall',
  'quiet',
  'collage',
];

export const FAMILY_NAME: Record<FamilyId, string> = {
  acid: 'Acid Flyer',
  editorial: 'Editorial',
  swiss: 'Swiss Grid',
  geo: 'Geometric',
  afterhours: 'After Hours',
  typewall: 'Type Wall',
  quiet: 'Quiet Signal',
  collage: 'Street Collage',
  plain: 'Plain (fallback)',
};

/** Which families suit a category. A suggestion, never a hard mapping. */
const FIT: Record<Category, FamilyId[]> = {
  music: ['acid', 'swiss', 'editorial', 'quiet', 'afterhours', 'typewall', 'geo'],
  nightlife: ['acid', 'afterhours', 'typewall', 'collage', 'swiss'],
  film: ['swiss', 'editorial', 'quiet', 'geo', 'afterhours'],
  talk: ['editorial', 'swiss', 'quiet', 'typewall'],
  art: ['editorial', 'swiss', 'geo', 'collage', 'quiet'],
  performance: ['typewall', 'editorial', 'collage', 'quiet', 'acid'],
  comedy: ['collage', 'geo', 'typewall', 'acid'],
  workshop: ['geo', 'swiss', 'collage', 'editorial'],
  community: ['geo', 'collage', 'editorial', 'typewall'],
};

export function posterTitle(e: PragueEvent): string {
  return e.displayTitle ?? e.title;
}

function isLate(e: PragueEvent): boolean {
  if (!e.start) return false;
  const h = Number(clock(e.start).slice(0, 2));
  return h >= 21 || h < 5;
}

export function eligibleFamilies(e: PragueEvent): FamilyId[] {
  const title = posterTitle(e);
  const longestWord = Math.max(...title.split(/\s+/).map((w) => w.length));
  return FIT[e.category].filter((f) => {
    if (f === 'afterhours' && !isLate(e)) return false;
    // Giant stacked type needs short words and short titles.
    if ((f === 'typewall' || f === 'acid') && (title.length > 34 || longestWord > 12)) return false;
    return true;
  });
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
 * and cap how often any one family appears; relax rules rather than fail.
 * Runs on the unfiltered deck so a poster never changes with filters.
 */
export function assignFamilies(
  deck: PragueEvent[],
  overrides: Record<string, FamilyId> = {},
): Map<string, FamilyId> {
  const out = new Map<string, FamilyId>();
  const counts = new Map<FamilyId, number>();
  const cap = Math.ceil(deck.length / FAMILIES.length) + 1;
  const recent: FamilyId[] = [];
  for (const e of deck) {
    let fam = overrides[e.id];
    if (!fam) {
      const prefs = preference(e, eligibleFamilies(e));
      const pool = [
        ...prefs,
        ...preference(e, FAMILIES).filter((f) => !prefs.includes(f) && f !== 'afterhours' && f !== 'typewall' && f !== 'acid'),
      ].filter((f) => fits(e, f));
      fam =
        pool.find((f) => !recent.includes(f) && (counts.get(f) ?? 0) < cap) ??
        pool.find((f) => recent[recent.length - 1] !== f) ??
        pool[0] ??
        'plain';
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
  return preference(e, eligibleFamilies(e)).find((f) => fits(e, f)) ?? 'plain';
}
