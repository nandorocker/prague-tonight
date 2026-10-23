# Hermes snapshot seam

`events_snapshot.py` exports the **full already-collected pool** from the existing
personal-profile Prague calendar job. It does not fetch sources, call a model,
read calendar records or credentials, or change the job schedule. Live mode
connects through `public_feed.py` and a cached same-origin `/api/events` endpoint.

## Runtime

Install alongside `/opt/data/profiles/personal/scripts/events_sync.py` in the
`hermes` container, as runtime UID/GID 10000. The companion
`events_sync.snapshot.patch` records the small hook in `run()`. Back up the exact
live script before applying that change; preserve its owner and mode. No Hermes
restart is required for a script-only change. Do not invoke the calendar job just
to test the exporter: it has external effects. Check installed script changes on
Hermes upgrades rather than blindly reapplying the patch.

The next normal sync writes:

`/opt/data/profiles/personal/data/prague-tonight/events.snapshot.json`

The new directory is owner-only (0700); files are 0600. The raw snapshot is never served.
Output is ignored by Git. Keep live event data out of this repository.

Install `public_feed.py` alongside the exporter, also as UID/GID 10000, mode
0660. It reads the fixed snapshot path and prints a newly projected public feed.
It does not import the collector or access Google credentials. A fixed
`docker exec -u 10000 hermes python3 /opt/data/profiles/personal/scripts/public_feed.py`
command is the only transport used by the Vite dev/preview middleware. No request
parameter becomes a command, argument or file path. Reads have a five-second
timeout, a 4 MiB output cap, single-flight sharing, a one-minute success cache
and a 30-second failure backoff. Last-good data survives read failures within
the server process, with a visible refresh-failed flag and original timestamp.

This transport is for the existing trusted, tailnet-only host development
environment. Docker access is privileged; it is **not** a sandbox. Do not mount
a Docker socket into a public web app. For a public deployment, arrange an
app-owned sanitized-file handoff or an equivalent least-privilege reader first.
Static `dist/` alone cannot execute the adapter. `pnpm preview` runs the feed
middleware too; no extra Caddy route is necessary for development access.

## Contract and limitations

- Version 1 has collection start/completion timestamps and the collected events.
  Source key + source ID is the identity; the content hash joins cached notes,
  never identifies saves. A source's own unstable ID cannot be repaired here.
- Event fields and source keys are explicitly allowlisted. Cached annotations
  are joined only by exact content hash, in a separate `enrichment` object.
  Unknown/nested fields and the rest of the cache are never exported.
- Source URLs with explicit `www.` or `//` prefixes are normalized to HTTPS,
  with surrounding whitespace removed. Arbitrary text, credential-bearing
  links and non-HTTP schemes remain rejected.
- Annotations reflect the cache **before this run**. Cache misses do not trigger
  enrichment. Notes can be machine-generated; cached `price` is unvalidated text,
  not the app's trusted `Price`. A future adapter must validate before displaying.
- Completeness is unknown: Bike Jesus may return an optional-source 404, and
  empty HTML parsing results are not proof that a venue has no events. Absence
  is **not** cancellation. Export failure keeps the previous file and emits a
  fixed warning on stderr; it never prints raw exceptions or event content.
- Source date-only values and ISO offsets are preserved. End-time provenance is
  unknown because the collector already fills missing end times. Never present
  these as confirmed ends. The collector excludes already-started timed events;
  an adapter must not assume this is a complete “on now” feed. Retaining earlier
  observations or changing discovery semantics needs a separate decision.
- Publication uses a same-directory temporary file and atomic replacement.
  A lock plus collection-start comparison prevents older overlapping runs from
  replacing a newer collection. A busy publisher is skipped without waiting,
  so it cannot hold up the calendar worker. This does not change existing calendar/cache
  concurrency behavior. Dry runs do not export.
- This is **private interchange data, not ready-to-publish JSON**. Source copy,
  links and cached notes remain untrusted. A future adapter must escape text,
  validate URLs and price/time certainty, and export only public app fields.

## Public feed and app behavior

The adapter projects fresh objects from an explicit allowlist. It omits all
cached enrichment/prices and unknown end times, strips nonessential query
parameters/fragments, rejects unsafe/local links and malformed dates, preserves
date-only ambiguity, and keeps both offset-aware start instants and Prague wall
time. Live countdowns use the exact instant through the repeated DST hour. It
uses collection **start** time for freshness, not a later publication/retry time.
Source text remains untrusted text and is escaped by the UI. An exact-location
venue catalog supplies known districts only; unmatched venues stay list-only.
Event type is `other` (“Event”), not inferred from a venue or title.

Live mode is the default. `?demo=1` opts into the isolated fictional feed and
editor simulations. Live IDs are `hermes:<source_key>:<source_id>`; these inherit
the collector's occurrence identity (GoOut schedule IDs, venue event IDs).
The app refreshes at most every 15 minutes; snapshots older than 30 hours are
marked stale. Initial failure shows an error, never fixtures. Saved events
missing from an upcoming-only feed say “Not in latest feed”, not canceled or
removed; rescheduled saves retain their last observed schedule separately from
the original as-saved information, even after absence and reload.

## Verification

```bash
python3 -m unittest discover -s tools/hermes -p 'test_*.py' -v
node --test tools/hermes/test-feed-server.mjs
# Also test the actual hook using a local copy of the installed script.
# Only its run() AST is executed; collection/calendar/export are stubbed.
HERMES_EVENTS_SYNC_SCRIPT=/private/path/events_sync.py \
  python3 -m unittest discover -s tools/hermes -p 'test_*.py' -v
```

Tests use synthetic events only. Rollback: restore the backed-up worker script;
the dormant exporter and last snapshot can remain private. Do not restore over
subsequent worker edits without comparing them first.
