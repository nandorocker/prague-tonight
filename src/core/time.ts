import type { DateKey, Span, WallTime, WindowDef } from '../types';

/** The city night runs until this hour the following morning (Prague time). */
export const NIGHT_CUTOFF_HOUR = 5;

const WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

const pragueFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Prague',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** Convert an instant to Prague wall-clock time. */
export function toPragueWall(d: Date): WallTime {
  const p = Object.fromEntries(pragueFmt.formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

/** Minutes since epoch, treating the wall time as if it were UTC. Only for comparisons. */
export function wallMinutes(t: WallTime): number {
  const [d, hm] = t.split('T');
  const [y, m, day] = d.split('-').map(Number);
  const [h, mi] = (hm ?? '00:00').split(':').map(Number);
  return Date.UTC(y, m - 1, day, h, mi) / 60000;
}

/**
 * Real minutes since epoch for a Prague wall time, honoring DST. In the
 * repeated autumn hour the first (summer-time) occurrence is used.
 */
export function instantMinutes(t: WallTime): number {
  const wall = wallMinutes(t);
  let guess = wall - 60;
  for (let i = 0; i < 3; i++) {
    const seen = wallMinutes(toPragueWall(new Date(guess * 60000)));
    if (seen === wall) break;
    guess += wall - seen;
  }
  // Prefer the earlier instant if the wall time occurs twice.
  const earlier = guess - 60;
  return wallMinutes(toPragueWall(new Date(earlier * 60000))) === wall ? earlier : guess;
}

/** Real minutes from a to b, across DST changes. */
export function minutesBetween(a: WallTime, b: WallTime): number {
  return instantMinutes(b) - instantMinutes(a);
}

export function fromWallMinutes(min: number): WallTime {
  return new Date(min * 60000).toISOString().slice(0, 16);
}

export function addDays(date: DateKey, n: number): DateKey {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** 0 = Sunday … 6 = Saturday. */
export function weekday(date: DateKey): number {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** The night a wall time belongs to: 02:00 Saturday is still Friday night. */
export function nightOf(t: WallTime): DateKey {
  return fromWallMinutes(wallMinutes(t) - NIGHT_CUTOFF_HOUR * 60).slice(0, 10);
}

/** Wall time at which a night is over. */
export function nightEnd(night: DateKey): WallTime {
  return `${addDays(night, 1)}T0${NIGHT_CUTOFF_HOUR}:00`;
}

export function isNightOver(night: DateKey, now: WallTime): boolean {
  return wallMinutes(now) >= wallMinutes(nightEnd(night));
}

export function dayLabel(date: DateKey): string {
  const [, m, d] = date.split('-').map(Number);
  return `${WEEKDAYS[weekday(date)]} ${d} ${MONTHS[m - 1]}`;
}

export function weekdayShort(date: DateKey): string {
  return WEEKDAYS[weekday(date)];
}

export function shortDate(date: DateKey): string {
  const [, m, d] = date.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]}`;
}

export function numericDate(date: DateKey): string {
  const [, m, d] = date.split('-');
  return `${d}.${m}`;
}

export function clock(t: WallTime): string {
  return t.slice(11, 16);
}

export const SPANS: Span[] = [1, 3, 7];

export const SPAN_LABEL: Record<Span, string> = { 1: 'Tonight', 3: 'Next 3 days', 7: 'Next 7 days' };

/** Nights from tonight onward. A night runs until 05:00 the next morning. */
export function windowFor(now: WallTime, span: Span): WindowDef {
  const tonight = nightOf(now);
  const nights = Array.from({ length: span }, (_, i) => addDays(tonight, i));
  const last = nights[nights.length - 1];
  return {
    span,
    label: SPAN_LABEL[span],
    dateLabel:
      span === 1
        ? dayLabel(tonight)
        : tonight.slice(5, 7) === last.slice(5, 7)
          ? `${weekdayShort(tonight)} ${Number(tonight.slice(8))} – ${dayLabel(last)}`
          : `${dayLabel(tonight)} – ${dayLabel(last)}`,
    nights,
  };
}
