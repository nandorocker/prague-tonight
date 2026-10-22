import type { PragueEvent, SourceKind, SourceRecord, SourceRef } from '../types';
import { fold } from './format';
import { nightOf } from './time';

const KIND_RANK: Record<SourceKind, number> = { organizer: 0, venue: 1, aggregator: 2 };

function tokens(title: string): Set<string> {
  return new Set(fold(title).split(' ').filter((w) => w.length > 1));
}

/** Titles from different feeds describe the same event. */
export function sameTitle(a: string, b: string): boolean {
  const fa = fold(a);
  const fb = fold(b);
  // Titles in scripts that fold to nothing only match exactly.
  if (!fa || !fb) return a.trim() === b.trim();
  if (fa === fb || fa.includes(fb) || fb.includes(fa)) return true;
  const ta = tokens(a);
  const tb = tokens(b);
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / (ta.size + tb.size - inter) >= 0.75;
}

function slug(s: string): string {
  return fold(s).replace(/ /g, '-').slice(0, 32).replace(/-+$/, '');
}

function rankRecords(a: SourceRecord, b: SourceRecord): number {
  return (
    Number(b.sourceAlive) - Number(a.sourceAlive) ||
    KIND_RANK[a.sourceKind] - KIND_RANK[b.sourceKind] ||
    b.confidence - a.confidence
  );
}

/** Group records that describe one event: same venue, same start, similar title. */
function cluster(records: SourceRecord[]): SourceRecord[][] {
  const byKey = new Map<string, SourceRecord[][]>();
  for (const r of records) {
    const key = `${r.venue?.id ?? '?'}|${r.start ?? `~${r.listedDate}`}`;
    const groups = byKey.get(key) ?? [];
    const g = groups.find((grp) => sameTitle(grp[0].title, r.title));
    if (g) g.push(r);
    else groups.push([r]);
    byKey.set(key, groups);
  }
  return [...byKey.values()].flat();
}

function merge(group: SourceRecord[]): PragueEvent {
  const recs = [...group].sort(rankRecords);
  const best = recs[0];
  const firstParty = recs.filter((r) => r.sourceKind !== 'aggregator');
  const night = best.start ? nightOf(best.start) : best.listedDate;
  const sources: SourceRef[] = recs
    .filter((r) => r.sourceAlive)
    .map((r) => ({ id: r.sourceId, name: r.sourceName, kind: r.sourceKind, url: r.url }));
  return {
    id: `${slug(best.title) || 'event'}-${best.venue?.id ?? 'tba'}-${night}${best.start ? `-${best.start.slice(11).replace(':', '')}` : ''}`,
    title: best.title,
    displayTitle: recs.find((r) => r.displayTitle)?.displayTitle,
    start: best.start,
    end: best.end,
    night,
    dateAmbiguous: recs.some((r) => r.dateAmbiguous),
    venue: best.venue,
    // Prices only count when a first-party source validated them.
    price: firstParty.find((r) => r.price)?.price,
    category: best.category,
    genre: best.genre,
    language: recs.find((r) => r.language?.verified)?.language?.value,
    description: recs.find((r) => r.description)?.description,
    // First-party status wins. With only aggregators, a reported
    // cancellation still hides the event: wrongly promising it is worse.
    canceled: (firstParty.length ? firstParty : recs).some((r) => r.status === 'canceled'),
    sourceAlive: sources.length > 0,
    confidence: Math.max(...recs.map((r) => r.confidence)),
    oneOff: best.oneOff,
    local: best.local,
    updatedAt: recs.map((r) => r.updatedAt).sort().at(-1)!,
    sources: sources.length
      ? sources
      : [{ id: best.sourceId, name: best.sourceName, kind: best.sourceKind, url: best.url }],
  };
}

const WALL = /^\d{4}-\d\d-\d\dT\d\d:\d\d$/;
const DAY = /^\d{4}-\d\d-\d\d$/;

function safeUrl(u: string): boolean {
  try {
    return ['http:', 'https:'].includes(new URL(u).protocol);
  } catch {
    return false;
  }
}

/** Drop records that can't be trusted structurally before anything else. */
export function wellFormed(r: SourceRecord): boolean {
  return (
    !!r.title.trim() &&
    safeUrl(r.url) &&
    DAY.test(r.listedDate) &&
    (!r.start || WALL.test(r.start)) &&
    (!r.end || WALL.test(r.end))
  );
}

/** Raw source records → one event per real-world event. */
export function normalize(records: SourceRecord[]): PragueEvent[] {
  return cluster(records.filter(wellFormed)).map(merge);
}
