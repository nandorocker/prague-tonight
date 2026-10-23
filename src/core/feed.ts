import type { PragueEvent } from '../types';
import { toPragueWall } from './time';

export interface Feed { schemaVersion: 1; collectedAt: string; events: PragueEvent[]; refreshFailed?: boolean }
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const text = (v: unknown): v is string => typeof v === 'string';
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const date = (v: unknown): v is string => text(v) && /^\d{4}-\d\d-\d\d$/.test(v) && !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v;
const wall = (v: unknown): v is string => text(v) && /^\d{4}-\d\d-\d\dT(?:[01]\d|2[0-3]):[0-5]\d$/.test(v) && date(v.slice(0, 10));
const instant = (v: unknown): v is string => text(v) && /^\d{4}-\d\d-\d\dT(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,6})?(?:Z|\+00:00)$/.test(v) && date(v.slice(0, 10)) && Number.isFinite(Date.parse(v));
export function safeHttpUrl(v: unknown): v is string {
  if (!text(v) || !/^https?:\/\//i.test(v) || /[\s\u0000-\u001f]/.test(v)) return false;
  try { const u = new URL(v); return ['http:', 'https:'].includes(u.protocol) && !!u.hostname && !u.username && !u.password; } catch { return false; }
}
const categories = ['music', 'nightlife', 'film', 'talk', 'art', 'performance', 'comedy', 'workshop', 'community', 'other'];
function event(v: unknown): v is PragueEvent {
  if (!object(v) || !text(v.id) || !/^hermes:[^:\s]+:.+$/.test(v.id) || !text(v.title) || !v.title.trim()) return false;
  if (!text(v.category) || !categories.includes(v.category) || !wall(v.updatedAt)) return false;
  if (!['dateAmbiguous', 'canceled', 'sourceAlive', 'oneOff', 'local'].every((k) => typeof v[k] === 'boolean')) return false;
  if (!finite(v.confidence) || v.confidence < 0 || v.confidence > 1) return false;
  if (['displayTitle', 'genre', 'language', 'description', 'blurb'].some((k) => v[k] !== undefined && !text(v[k]))) return false;
  if ((v.start !== undefined && !wall(v.start)) || (v.end !== undefined && !wall(v.end)) || (v.night !== undefined && !date(v.night))) return false;
  if (v.startInstant !== undefined && (!instant(v.startInstant) || toPragueWall(new Date(v.startInstant)) !== v.start)) return false;
  if (v.venue !== undefined) {
    const p = v.venue;
    if (!object(p) || !text(p.id) || !text(p.name) || ['district', 'address'].some((k) => p[k] !== undefined && !text(p[k]))) return false;
    if ((p.lat !== undefined && (!finite(p.lat) || Math.abs(p.lat) > 90)) || (p.lon !== undefined && (!finite(p.lon) || Math.abs(p.lon) > 180))) return false;
  }
  if (v.price !== undefined) {
    const p = v.price;
    if (!object(p) || (p.kind !== 'free' && p.kind !== 'paid')) return false;
    if (p.kind === 'paid' && (!finite(p.min) || p.min < 0 || (p.max !== undefined && (!finite(p.max) || p.max < p.min)))) return false;
  }
  return Array.isArray(v.sources) && v.sources.length > 0 && v.sources.every((s: unknown) => object(s) && text(s.id) && text(s.name) && ['organizer', 'venue', 'aggregator'].includes(String(s.kind)) && safeHttpUrl(s.url));
}
/** Reject the whole snapshot rather than quietly publishing a partial feed. */
export function parseFeed(value: unknown): Feed {
  if (!object(value) || value.schemaVersion !== 1 || !instant(value.collectedAt) || !Array.isArray(value.events) || !value.events.every(event)) throw new Error('Invalid event feed');
  if (new Set(value.events.map((e) => e.id)).size !== value.events.length) throw new Error('Duplicate event IDs');
  if (value.refreshFailed !== undefined && typeof value.refreshFailed !== 'boolean') throw new Error('Invalid feed refresh status');
  return { schemaVersion: 1, collectedAt: value.collectedAt, events: value.events, refreshFailed: value.refreshFailed as boolean | undefined };
}
