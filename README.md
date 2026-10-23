# Prague Tonight

A nightly event deck with shifting poster identities. Swipe through tonight's options, save the ones that click, and turn them into a plan in My Night.

Built from the creative handoff (product brief, wireframes, poster style system, curation blueprint). The default view loads real events collected by Hermes. The fictional prototype is still available with `?demo=1`, isolated from live saves.

```bash
pnpm install
pnpm dev          # http://127.0.0.1:5173
pnpm test         # vitest: time windows, curation, dedupe, posters
pnpm test:deck    # headless Chrome: card reuse, dragging, keyboard, undo
pnpm build        # typecheck + production build
```

## What's in it

- **Deck**: one full-size poster at a time, nothing else on screen. Swipe right (or ♥) to save, left (or ✕) to pass, up (or ★) to save as a favorite. Each swipe slams a big word on the card (GROOVY, NAH, OBSESSED…). Undo sits left of ✕. Tap the card for details. Keys: ← → ↑, Enter, U.
- **Poster facts**: date and time, then venue and price, remain easy to find in the lower part of each card. Each family owns the typography, framing, color and composition of that area. A short source blurb is placed separately as part of the poster design.
- **Settings** (the pill top right): a Tonight / 3 days / 7 days slider, kind of event, price, area, plus "Start over" (bring back passed cards) and All events as a list. A night runs until 05:00.
- **Event details**: title, blurb, time, venue, price, language, description, original listing, save and favorite.
- **My Night**: Tonight or Upcoming, as a list or a schematic map. Favorites are starred. Live status: starts soon, on now, ended, canceled, changed since you saved. Saves live in this browser (localStorage).
- **All events**: the full eligible list behind the deck, with the same settings.
- **Tools** (demo mode only; hold the wordmark for a second, or open `?demo=1#/ops`): resets (passes, My Night, everything), a clock you can pin to any moment, simulated cancellations and time changes, the deck in swipe order with per-card style / pin / remove, why events were left out, and a poster lab comparing one event across all 18 templates in four groups. The lab's imagery selector previews any library subject without changing the real deck.

The viewport is locked: the page never scrolls or rubber-bands. Only content areas (lists, details, sheets) scroll inside the fixed shell.

## How it's built

Vite + vanilla TypeScript, no UI framework. Self-hosted Fira Sans, Fira Sans Extra Condensed, Instrument Serif and Baloo 2, all with Czech diacritics. Live mode reads one cached same-origin feed; there are no runtime AI calls or visitor-triggered discovery calls.

- `src/data/fixtures.ts`: fictional source feed laid onto the real current dates, with a short blurb for every event. It includes the ugly cases from the QA list: a 120-character title, missing prices, cross-source duplicates, a cancellation, a 23:30–03:30 club night, missing coordinates, a dead source link, and 20 near-identical DJ listings.
- `src/core/normalize.ts`: dedupe across sources and choose the best attribution. Only first-party sources can set a price, and non-http links are rejected.
- `src/core/curate.ts`: eligibility (for the list and for the deck), human-readable scoring, a greedy diversity pass with category and venue caps, and a deck of 20–35 cards when there are enough events.
- `src/posters/`: four style groups containing 18 templates, plus a plain fallback. Ten expressive treatments sit alongside eight restored Originals. See the visual system below.
  - Each poster is seeded from the event identity and its family. Assignments stay stable for the same ordered deck, including when browsing with filters.
  - Titles are fitted rather than truncated. A title that can't fit gets a different family or the fallback.
- `src/core/time.ts`: Prague wall-clock handling, the night cutoff, the window rules, and DST-correct countdowns.

### Real-source integration

Live mode reuses Hermes's existing Prague calendar collection through a private
snapshot and a strict public-field adapter. [`tools/hermes/`](tools/hermes/README.md)
documents installation, safety boundaries and tests. The Vite development and
preview servers expose only the projected `/api/events` feed, with a shared
one-minute read cache and failure backoff. No raw profile data is served.

The app refreshes at most every 15 minutes and retains the source collection time internally for freshness checks.
Failed refreshes retain the last good in-memory feed; initial failure never
silently shows fictional events. Prices, uncertain end times and missing event
types remain unknown. Missing listings are not labeled canceled or removed.
Live IDs come from source identities, so title/time changes preserve saves.
Production static files alone do not supply `/api/events`: serve with the
configured server or provide an equivalent safe feed endpoint.

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
| Originals | Acid Flyer | Bright ink, concentric rings, hatching, diagonal blocks and alternating boxed type |
| Originals | Editorial | Cream paper, restrained serif headlines and a colored geometric print |
| Originals | Swiss Grid | Fine modular grid, condensed type, numbered columns and a strong accent block |
| Originals | Geometric | Large circles, angular shapes and cream-backed condensed lettering |
| Originals | After Hours | Dark navy, neon rings, waves or rays, a fine grid and glowing type |
| Originals | Type Wall | Oversized stacked words, alternating ink-and-cream strips and hatch texture |
| Originals | Quiet Signal | Sparse serif typography, generous space and a small geometric sign |
| Originals | Street Collage | Rotated colored sheets, halftone texture and alternating headline colors |

The **Originals** group restores the eight designs from the pre-redesign prototype (`1d08e59`). They participate in normal deck assignment and can be selected individually in Tools. Their original typography-and-geometry compositions stay image-free, including when an imagery preview is selected. They use the current truthful event fields, title fitting and swipe interactions.

### Content and skin

The event record owns the title, date, time, venue, district, price, category and source. The skin owns typography, composition, palette, texture and decoration. It must never invent a genre, ticket status or other event claim.

Event facts retain a predictable reading order: date/time first, venue/price next in the lower information zone, with family-specific type, rules, tickets, stamps, capsules or panels. The ten newer treatments continue their backgrounds and graphic devices through that zone; Originals retain their classic lower information band, with template-specific colors and type. Dates describe the actual start day, including after midnight; unknown prices say “Check price.”

The source blurb (`blurb`, falling back to `description`) is a free compositional element: a liner note, taped scrap, magazine callout, grid cell or editorial column. Short visible excerpts are allowed; no copy is invented when the source has none. The full source text remains available through the card's accessible description and event details. Titles remain complete and fitted.

Tapping opens full details and the source link. Save, favorite, pass and undo follow the shared interaction layer from the main app. Saved and changed-event states belong to the app, not to decorative claims on the poster.

### Deck rhythm

- Assign on the complete curated deck before visitor filters or swipe decisions.
- Favor underused families, avoid the previous two families where possible, and alternate style classes when feasible. Aim for at least six families in the first twelve cards when titles allow it.
- Use seeded tie-breaking, not fresh randomness on every render. Recurating the deck or explicitly restyling can change assignments.
- Legibility wins over variety. Relax pacing when necessary; use a plain full-title fallback when none of the expressive families fits.
- Editor overrides are supported when the requested treatment fits. The Tools style picker disables treatments that cannot fit the current title and offers a plain fallback.
- The poster lab compares the same event across all four groups and 18 templates, including their information treatments and source blurbs.

Existing family IDs are retained so device-local saves and editor overrides still resolve. Restored Originals use separate `original-*` IDs, allowing both generations of designs to coexist.

### Figurative imagery

Content, style, and subject are separate choices. A workshop can wear a metal poster with an old horse photograph; the same family can also stay entirely abstract. Subject selection never reads the event category, title, start time, or family.

The starter library has **15 reusable subjects**: four archival photographs, four illustrated objects, four cartoons, and three original paper-style collages. `src/posters/assets.ts` records provenance and visual properties; `public/artwork/README.md` records source images and rights advisories. All assets are served locally. There is no per-event image generation.

New choices aim for approximately **55% subject-free, 20% photographs/objects, 15% cartoons, and 10% collage**. The assignment pass works on the active unfiltered deck, favors underused subjects, and limits newly introduced face-dominant choices to 10%. It avoids adding a third consecutive photographic or face-dominant card. These are starting targets: image-free Originals, filtering, existing choices, and title-fitting or image-load fallbacks can change the visible mix.

The browser remembers an explicit asset ID or `none` for each event in `pt:artwork`. Once assigned, the subject stays fixed through refreshes, filters, range changes, and source updates; stability takes priority over rebalancing an existing sequence. New saves also record their artwork token, and older saves remain image-free. “Reset everything” clears these choices along with the other local state. When browser storage is unavailable, choices survive only in memory for that page session.

Each of the ten imagery-enabled families has its own image composition and protected title, blurb, and fact zones. If an image layout cannot fit the complete title, an asset is unknown, or its local file fails to load, the complete image-free composition returns. Originals retain their image-free compositions. The swipe stamps remain above both image and text layers.

Event details label subjects as **illustrative artwork, not event photography**, and show the original-art credit or archival source and rights advisory. Artwork never supplies facts about the event.

## Testing hooks

- `?demo=1&now=2026-10-23T23:30` pins the Prague clock in the fictional demo (it still ticks). The Tools screen sets this for you.
- `?demo=1&stale=1` shows the demo warning for data that failed to refresh (also a Tools checkbox).
- `node tools/screenshot.mjs --url '…' --steps '<js>;;SHOT:shots/a.png;;<js>'` drives headless Chrome at phone size.
- `node tools/deck-audit.mjs [--span 1|3|7] [--fam acid,geo]` renders every card in a deck at real size into contact sheets under `shots/audit` and flags overlaps, overflow and truncated blurbs. `--matrix` instead renders every event in every poster family, with and without artwork, and prints a summary (no images).

## Not built yet (per the brief's "explore after launch")

Shareable My Night link, timeline view, calendar export, taste-aware ranking, accounts. The schematic map is a stand-in for a real map treatment.
