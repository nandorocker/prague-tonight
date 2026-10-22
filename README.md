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

- **Deck**: one poster at a time. Swipe right or press Save to keep it; swipe left or press Pass to move on; tap for details. You can undo, use ← / → / Enter / U on a keyboard, and review your passes at the end of the deck.
- **Time switch**: Tonight + Tomorrow. On Friday it becomes Tonight + Weekend (Sat + Sun). A night runs until 05:00, so 02:00 Saturday still counts as Friday night.
- **Event details**: the official title, time, venue, price ("Check price" when it isn't confirmed), verified language, a short description from the source when it exists, and the original listing.
- **My Night**: saves for both windows, in time order, with live status: starts soon, on now, ended, canceled, time or price changed since you saved. The schematic map pins only events with verified coordinates. Saves live in this browser (localStorage) only.
- **All events**: the full eligible index behind the deck, with the same filters.
- **Filters**: price, mood and neighborhood. A price filter says how many events it hides because their price is unknown.
- **Review board** (`#/ops`, the PT mark in the header): candidate counts, the deck in swipe order, pin / remove / restyle, the reason each excluded event was left out, a style lab that renders one event in all eight families, and a simulated source refresh that cancels and moves saved events.

## How it's built

Vite + vanilla TypeScript, no UI framework. Self-hosted Fira Sans, Fira Sans Extra Condensed and Instrument Serif, all with Czech diacritics. No network or AI calls at runtime.

- `src/data/fixtures.ts`: fictional source feed laid onto the real current dates. It includes the ugly cases from the QA list: a 120-character title, missing prices, cross-source duplicates, a cancellation, a 23:30–03:30 club night, missing coordinates, a dead source link, and 20 near-identical DJ listings.
- `src/core/normalize.ts`: dedupe across sources and choose the best attribution. Only first-party sources can set a price, and non-http links are rejected.
- `src/core/curate.ts`: eligibility (for the list and for the deck), human-readable scoring, a greedy diversity pass with category and venue caps, and a deck of 20–35 cards when there are enough events.
- `src/posters/`: eight design grammars (Acid Flyer, Editorial, Swiss Grid, Geometric, After Hours, Type Wall, Quiet Signal, Street Collage) plus a plain fallback.
  - Each poster is seeded from the event and its family, so it stays stable across refreshes.
  - Titles are fitted, never clipped. A title that can't fit gets a different family or the fallback.
- `src/core/time.ts`: Prague wall-clock handling, the night cutoff, the window rules, and DST-correct countdowns.

## Testing hooks

- `?now=2026-10-23T23:30` pins the Prague clock (it still ticks). Use it to try Friday's weekend window or after-midnight behaviour.
- `?stale=1` shows the warning for data that failed to refresh.
- `node tools/screenshot.mjs --url '…' --steps '<js>;;SHOT:shots/a.png;;<js>'` drives headless Chrome at phone size.

## Not built yet (per the brief's "explore after launch")

Shareable My Night link, timeline view, calendar export, taste-aware ranking, accounts. The schematic map is a stand-in for a real map treatment.
