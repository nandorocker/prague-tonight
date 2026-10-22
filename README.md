# Prague Tonight

A phone-first deck of procedurally designed event posters. Swipe through tonight's options, save the ones that click, and turn them into a plan in My Night.

First-version prototype built from the creative handoff (product brief, wireframes, poster style system, curation blueprint). All events, venues, prices and links are fictional.

```bash
pnpm install
pnpm dev          # http://127.0.0.1:5173
pnpm test         # vitest: time windows, curation, dedupe, posters
pnpm build        # typecheck + production build
```

## What's in it

- **Deck**: one full-size poster at a time, nothing else on screen. Swipe right (or ♥) to save, left (or ✕) to pass, up (or ★) to save as a favorite. Each swipe slams a big word on the card (GROOVY, NAH, OBSESSED…). Undo sits left of ✕. Tap the card for details. Keys: ← → ↑, Enter, U.
- **Poster info band**: every poster has the same facts in the same place at the bottom: date and time, venue and price, a two-to-three-line blurb. The art above is free; the band takes each family's colours and type.
- **Settings** (the pill top right): a Tonight / 3 days / 7 days slider, kind of event, price, area, plus "Start over" (bring back passed cards) and All events as a list. A night runs until 05:00.
- **Event details**: title, blurb, time, venue, price, language, description, original listing, save and favorite.
- **My Night**: Tonight or Upcoming, as a list or a schematic map. Favorites are starred. Live status: starts soon, on now, ended, canceled, changed since you saved. Saves live in this browser (localStorage).
- **All events**: the full eligible list behind the deck, with the same settings.
- **Tools** (hold the wordmark for a second, or open `#/ops`): resets (passes, My Night, everything), a clock you can pin to any moment, simulated cancellations and time changes, the deck in swipe order with per-card style / pin / remove, why events were left out, and a poster lab showing one event in every style.

The viewport is locked: the page never scrolls or rubber-bands. Only content areas (lists, details, sheets) scroll inside the fixed shell.

## How it's built

Vite + vanilla TypeScript, no UI framework. Self-hosted Fira Sans, Fira Sans Extra Condensed and Instrument Serif, all with Czech diacritics. No network or AI calls at runtime.

- `src/data/fixtures.ts`: fictional source feed laid onto the real current dates, with a short blurb for every event. It includes the ugly cases from the QA list: a 120-character title, missing prices, cross-source duplicates, a cancellation, a 23:30–03:30 club night, missing coordinates, a dead source link, and 20 near-identical DJ listings.
- `src/core/normalize.ts`: dedupe across sources and choose the best attribution. Only first-party sources can set a price, and non-http links are rejected.
- `src/core/curate.ts`: eligibility (for the list and for the deck), human-readable scoring, a greedy diversity pass with category and venue caps, and a deck of 20–35 cards when there are enough events.
- `src/posters/`: eight design grammars (Acid Flyer, Editorial, Swiss Grid, Geometric, After Hours, Type Wall, Quiet Signal, Street Collage) plus a plain fallback.
  - Each poster is seeded from the event and its family, so it stays stable across refreshes.
  - Titles are fitted, never clipped. A title that can't fit gets a different family or the fallback.
- `src/core/time.ts`: Prague wall-clock handling, the night cutoff, the window rules, and DST-correct countdowns.

## Testing hooks

- `?now=2026-10-23T23:30` pins the Prague clock (it still ticks). The Tools screen sets this for you.
- `?stale=1` shows the warning for data that failed to refresh (also a Tools checkbox).
- `node tools/screenshot.mjs --url '…' --steps '<js>;;SHOT:shots/a.png;;<js>'` drives headless Chrome at phone size.

## Not built yet (per the brief's "explore after launch")

Shareable My Night link, timeline view, calendar export, taste-aware ranking, accounts. The schematic map is a stand-in for a real map treatment.
