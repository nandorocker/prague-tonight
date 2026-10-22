/** Prague wall-clock date-time, always Europe/Prague: "YYYY-MM-DDTHH:mm". */
export type WallTime = string;
/** Prague calendar date: "YYYY-MM-DD". */
export type DateKey = string;

export type Category =
  | 'music'
  | 'nightlife'
  | 'film'
  | 'talk'
  | 'art'
  | 'performance'
  | 'comedy'
  | 'workshop'
  | 'community';

export type Mood = 'music' | 'culture' | 'nightlife' | 'social';

export type SourceKind = 'organizer' | 'venue' | 'aggregator';

export type Price = { kind: 'free' } | { kind: 'paid'; min: number; max?: number };

export interface Venue {
  id: string;
  name: string;
  district?: string;
  address?: string;
  /** Only present when the coordinates are trustworthy. */
  lat?: number;
  lon?: number;
}

/** One listing as it arrives from one source, before normalization. */
export interface SourceRecord {
  sourceId: string;
  sourceName: string;
  sourceKind: SourceKind;
  url: string;
  title: string;
  /** Editor-approved short title; must preserve meaning. */
  displayTitle?: string;
  start?: WallTime;
  end?: WallTime;
  /** Source gives a date range but no reliable time for a given night. */
  dateAmbiguous?: boolean;
  /** Calendar date the source lists the event under. */
  listedDate: DateKey;
  venue?: Venue;
  /** Undefined means unknown or unvalidated. Never guessed. */
  price?: Price;
  category: Category;
  genre?: string;
  language?: { value: string; verified: boolean };
  description?: string;
  /** Two or three lines on what the event is, for the poster's info band. */
  blurb?: string;
  status: 'scheduled' | 'canceled';
  /** Result of the last link validation. */
  sourceAlive: boolean;
  confidence: number;
  oneOff: boolean;
  local: boolean;
  updatedAt: WallTime;
}

export interface SourceRef {
  id: string;
  name: string;
  kind: SourceKind;
  url: string;
}

/** A normalized event identity, possibly merged from several sources. */
export interface PragueEvent {
  id: string;
  title: string;
  displayTitle?: string;
  start?: WallTime;
  end?: WallTime;
  /** Night the event belongs to (city-night clock). */
  night?: DateKey;
  dateAmbiguous: boolean;
  venue?: Venue;
  price?: Price;
  category: Category;
  genre?: string;
  language?: string;
  description?: string;
  blurb?: string;
  canceled: boolean;
  sourceAlive: boolean;
  confidence: number;
  oneOff: boolean;
  local: boolean;
  updatedAt: WallTime;
  /** Best attribution first. */
  sources: SourceRef[];
}

export type FamilyId =
  | 'acid'
  | 'editorial'
  | 'swiss'
  | 'geo'
  | 'afterhours'
  | 'typewall'
  | 'quiet'
  | 'collage'
  | 'plain';

/** How many nights ahead the deck looks, starting tonight. */
export type Span = 1 | 3 | 7;

export interface WindowDef {
  span: Span;
  label: string;
  dateLabel: string;
  nights: DateKey[];
}
