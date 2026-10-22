/**
 * Loads the event set. In the prototype this is the fixture feed laid onto
 * the current dates; a real feed would replace buildFixtures.
 */
import type { PragueEvent, WallTime } from '../types';
import { buildFixtures } from '../data/fixtures';
import { normalize } from './normalize';
import type { Revision } from './store';
import { fromWallMinutes, nightOf, wallMinutes } from './time';

/** Apply a simulated source refresh: cancellations and time changes. */
export function applyRevision(events: PragueEvent[], rev: Revision | null): PragueEvent[] {
  if (!rev) return events;
  return events.map((e) => {
    let out = e;
    if (rev.canceled.includes(e.id)) out = { ...out, canceled: true, updatedAt: rev.at };
    const shift = rev.shifted.find((s) => s.id === e.id);
    if (shift && out.start) {
      out = {
        ...out,
        start: fromWallMinutes(wallMinutes(out.start) + shift.minutes),
        end: out.end ? fromWallMinutes(wallMinutes(out.end) + shift.minutes) : undefined,
        updatedAt: rev.at,
      };
    }
    return out;
  });
}

export function loadEvents(now: WallTime, rev: Revision | null): PragueEvent[] {
  return applyRevision(normalize(buildFixtures(nightOf(now))), rev);
}
