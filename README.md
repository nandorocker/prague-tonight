# Prague Tonight

A nightly event deck with shifting poster identities. Swipe through tonight's options, save the ones that click, and turn them into a plan in My Night.

First-version prototype built from the creative handoff (product brief, wireframes, poster style system, curation blueprint). All events, venues, prices and links are fictional.

```bash
pnpm install
pnpm dev          # http://127.0.0.1:5173
pnpm test         # vitest: time windows, curation, dedupe, posters
pnpm build        # typecheck + production build
```

## What's in it

- **Deck**: one full-size poster at a time, nothing else on screen. Swipe right (or ♥) to save, left (or ✕) to pass, up (or ★) to save as a favorite. Each swipe slams a big word on the card (GROOVY, NAH, OBSESSED…). Undo sits left of ✕. Tap the card for details. Keys: ← → ↑, Enter, U.
- **Poster facts**: date and time, then venue and price, remain easy to find in the lower part of each card. Each family owns the typography, framing, color and composition of that area. A short source blurb is placed separately as part of the poster design.
- **Settings** (the pill top right): a Tonight / 3 days / 7 days slider, kind of event, price, area, plus "Start over" (bring back passed cards) and All events as a list. A night runs until 05:00.
- **Event details**: title, blurb, time, venue, price, language, description, original listing, save and favorite.
- **My Night**: Tonight or Upcoming, as a list or a schematic map. Favorites are starred. Live status: starts soon, on now, ended, canceled, changed since you saved. Saves live in this browser (localStorage).
- **All events**: the full eligible list behind the deck, with the same settings.
- **Tools** (hold the wordmark for a second, or open `#/ops`): resets (passes, My Night, everything), a clock you can pin to any moment, simulated cancellations and time changes, the deck in swipe order with per-card style / pin / remove, why events were left out, and a poster lab comparing one event across all ten families and three style classes.

The viewport is locked: the page never scrolls or rubber-bands. Only content areas (lists, details, sheets) scroll inside the fixed shell.

## How it's built

Vite + vanilla TypeScript, no UI framework. Self-hosted Fira Sans, Fira Sans Extra Condensed, Instrument Serif and Baloo 2, all with Czech diacritics. No network or AI calls at runtime.

- `src/data/fixtures.ts`: fictional source feed laid onto the real current dates, with a short blurb for every event. It includes the ugly cases from the QA list: a 120-character title, missing prices, cross-source duplicates, a cancellation, a 23:30–03:30 club night, missing coordinates, a dead source link, and 20 near-identical DJ listings.
- `src/core/normalize.ts`: dedupe across sources and choose the best attribution. Only first-party sources can set a price, and non-http links are rejected.
- `src/core/curate.ts`: eligibility (for the list and for the deck), human-readable scoring, a greedy diversity pass with category and venue caps, and a deck of 20–35 cards when there are enough events.
- `src/posters/`: three style classes containing ten poster families, plus a plain fallback. See the visual system below.
  - Each poster is seeded from the event identity and its family. Assignments stay stable for the same ordered deck, including when browsing with filters.
  - Titles are fitted rather than truncated. A title that can't fit gets a different family or the fallback.
- `src/core/time.ts`: Prague wall-clock handling, the night cutoff, the window rules, and DST-correct countdowns.

## Visual system: one product, many personas

The skin is cultural packaging, not an event classification. A classical concert can wear hair metal; a workshop can look like a fashion ad. Category and start time do not select the treatment.

| Style class | Poster family | Design characteristics |
| --- | --- | --- |
| Loud nostalgia | 80s Hair Metal | Chrome-like condensed type, lightning, dark stage colors, explosive diagonals |
| Loud nostalgia | 90s Pop | Rounded bubble type, candy colors, glossy shapes, playful magazine framing |
| Loud nostalgia | Y2K Digital | Metallic blue, pixel stars, retro interface framing, tech typography |
| Loud nostalgia | Adult Contemporary Soft Glam | Sage and dusty tones, hazy gradients, italic serif, a soft sculptural focal point |
| Tasteful editorial | Indie Editorial / Culture Paper | Confident newspaper headlines, a disciplined grid, one oversized print motif |
| Tasteful editorial | Brutalist Art-School | Severe oversized type, rigid black-and-white grids, cropped graphic forms |
| Tasteful editorial | Luxury Fashion Ad | Tall editorial serif, spare composition, framed abstract artwork, breathing room |
| Urban experimentation | Indie Xerox Flyer | Monochrome photocopy grain, torn paper, cutout type, misregistration |
| Urban experimentation | Street Poster Collage | Overlapping bright paper, tape, torn edges, stacked street-flyer lettering |
| Urban experimentation | Geometric Graphic System | Interlocking arcs and bars, a limited palette, shape-led modernist structure |

### Content and skin

The event record owns the title, date, time, venue, district, price, category and source. The skin owns typography, composition, palette, texture and decoration. It must never invent a genre, ticket status or other event claim.

Consistency means the same truthful facts and a predictable reading order, not a repeated footer. The entire card belongs to its family: date/time first, venue/price next in the lower information zone, with family-specific type, rules, tickets, stamps, capsules or panels. Backgrounds and graphic devices continue through that zone instead of stopping above a universal cream block. Dates describe the actual start day, including after midnight; unknown prices say “Check price.”

The source blurb (`blurb`, falling back to `description`) is a free compositional element: a liner note, taped scrap, magazine callout, grid cell or editorial column. Short visible excerpts are allowed; no copy is invented when the source has none. The full source text remains available through the card's accessible description and event details. Titles remain complete and fitted.

Tapping opens full details and the source link. Save, favorite, pass and undo follow the shared interaction layer from the main app. Saved and changed-event states belong to the app, not to decorative claims on the poster.

### Deck rhythm

- Assign on the complete curated deck before visitor filters or swipe decisions.
- Favor underused families, avoid the previous two families where possible, and alternate style classes when feasible. Aim for at least six families in the first twelve cards when titles allow it.
- Use seeded tie-breaking, not fresh randomness on every render. Recurating the deck or explicitly restyling can change assignments.
- Legibility wins over variety. Relax pacing when necessary; use a plain full-title fallback when none of the expressive families fits.
- Editor overrides are supported when the requested treatment fits. The Tools style picker disables treatments that cannot fit the current title and offers a plain fallback.
- The poster lab compares the same event across all three classes and ten families, including their information treatments and source blurbs.

Internal family IDs are retained from the first prototype so existing device-local saves and editor overrides still resolve. The public names above describe the new treatments.

## Testing hooks

- `?now=2026-10-23T23:30` pins the Prague clock (it still ticks). The Tools screen sets this for you.
- `?stale=1` shows the warning for data that failed to refresh (also a Tools checkbox).
- `node tools/screenshot.mjs --url '…' --steps '<js>;;SHOT:shots/a.png;;<js>'` drives headless Chrome at phone size.

## Not built yet (per the brief's "explore after launch")

Shareable My Night link, timeline view, calendar export, taste-aware ranking, accounts. The schematic map is a stand-in for a real map treatment.
