"""Read-only public projection. No discovery, enrichment or calendar access."""
from __future__ import annotations

import hashlib
import ipaddress
import json
import re
import sys
import unicodedata
from datetime import date, datetime, timedelta, timezone
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit
from zoneinfo import ZoneInfo

from events_snapshot import DEFAULT_SNAPSHOT_PATH, SOURCE_KEYS

PRAGUE = ZoneInfo("Europe/Prague")
MAX_BYTES = 20 * 1024 * 1024
# Match actual source location names, not a source-wide guess. No coordinates,
# addresses, category, price or end time are inferred from this catalog.
VENUES = {
    "punctum krasovka, prague": ("punctum", "Žižkov"),
    "palac akropolis": ("palac-akropolis", "Žižkov"),
    "cross club": ("cross-club", "Holešovice"),
    "ankali": ("ankali", "Vršovice"),
    "ankali, planeta za": ("ankali", "Vršovice"),
    "planeta za": ("ankali", "Vršovice"),
    "roxy": ("roxy", "Staré Město"),
    "dox centre for contemporary art": ("dox", "Holešovice"),
    "divadlo vila stvanice": ("vilastvanice", "Holešovice"),
    "lucerna music bar": ("lucerna", "Nové Město"),
    "meetfactory": ("meetfactory", "Smíchov"),
    "forum karlin": ("forum-karlin", "Karlín"),
}


def _text(value: object, *, maximum: int, required: bool = False) -> str:
    if value is None and not required:
        return ""
    if not isinstance(value, str) or len(value) > maximum or (required and not value.strip()):
        raise ValueError("Invalid feed text")
    return value.strip()


def _timestamp(value: object) -> datetime:
    text = _text(value, maximum=64, required=True)
    parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
    if parsed.tzinfo is None or parsed.utcoffset() is None:
        raise ValueError("Timestamp needs an explicit offset")
    return parsed


def _wall(value: datetime) -> str:
    return value.astimezone(PRAGUE).strftime("%Y-%m-%dT%H:%M")


def _url(value: object) -> str:
    text = _text(value, maximum=4096, required=True)
    parts = urlsplit(text)
    host = parts.hostname.rstrip(".").lower() if parts.hostname else None
    if parts.scheme not in ("http", "https") or not host or parts.username or parts.password or any(c.isspace() or ord(c) < 32 for c in text):
        raise ValueError("Unsafe source link")
    if host in ("localhost", "localhost.localdomain") or host.endswith((".local", ".localhost", ".internal")) or "." not in host:
        raise ValueError("Source link is not public")
    try:
        address = ipaddress.ip_address(host)
    except ValueError:
        address = None
    if (address and not address.is_global) or (address is None and host.rsplit(".", 1)[-1].isdigit()):
        raise ValueError("Source link is not public")
    # Tracking/auth-like query values and fragments are not part of the handoff.
    query = urlencode([(k, v) for k, v in parse_qsl(parts.query) if k in ("id", "event", "event_id", "page_id", "lang")])
    return urlunsplit((parts.scheme, parts.netloc, parts.path, query, ""))


def _venue(location: str, source: str) -> dict | None:
    if not location:
        return None
    folded = "".join(c for c in unicodedata.normalize("NFD", location.casefold()) if not unicodedata.combining(c))
    known = VENUES.get(folded)
    result = {"id": source + ":" + hashlib.sha256(location.encode()).hexdigest()[:12], "name": location}
    if known and known[0] == source:
        result.update(id=source, district=known[1])
    return result


def _blurb(description: str, location: str) -> str:
    # GoOut appends venue/link lines even when it supplies no descriptive copy.
    # Keep those in the full description, not as an oversized poster headline.
    lines = [re.sub(r"https?://\S+|www\.\S+", "", line).strip() for line in description.splitlines()]
    text = " ".join(line for line in lines if line and line.casefold() != location.casefold())
    return text if len(text) <= 300 else text[:300].rsplit(" ", 1)[0] + "…"


def public_feed(snapshot: object) -> dict:
    if not isinstance(snapshot, dict) or type(snapshot.get("schema_version")) is not int or snapshot["schema_version"] != 1:
        raise ValueError("Unsupported snapshot schema")
    # Age comes from source collection, not from a later retry/publication.
    collected = _timestamp(snapshot.get("collection_started_at"))
    events = snapshot.get("events")
    if not isinstance(events, list) or len(events) > 5000:
        raise ValueError("Invalid event collection")
    output = []
    identities = set()
    for item in events:
        if not isinstance(item, dict) or item.get("source_key") not in SOURCE_KEYS:
            raise ValueError("Unknown source")
        source = item["source_key"]
        source_id = _text(item.get("source_id"), maximum=500, required=True)
        identity = f"hermes:{source}:{source_id}"
        if identity in identities:
            raise ValueError("Duplicate occurrence identity")
        identities.add(identity)
        all_day = item.get("all_day")
        if not isinstance(all_day, bool):
            raise ValueError("Missing date precision")
        if all_day:
            listed = _text(item.get("start_date"), maximum=10, required=True)
            night = date.fromisoformat(listed).isoformat()
            if night != listed:
                raise ValueError("Invalid calendar date")
            start = None
        else:
            instant = _timestamp(item.get("start_iso")).astimezone(PRAGUE)
            night = (instant.date() - timedelta(days=int(instant.hour < 5))).isoformat()
            start = _wall(instant)
        description = _text(item.get("description_text"), maximum=10000)
        location = _text(item.get("location"), maximum=500)
        venue = _venue(location, source)
        event = {
            "id": identity,
            "title": _text(item.get("title"), maximum=2000, required=True),
            "night": night,
            "dateAmbiguous": all_day,
            "category": "other",
            "canceled": False,  # No cancellation evidence in this interchange schema.
            "sourceAlive": True,  # Observed by the collector, not freshly link-checked.
            "confidence": 0.5 if all_day else 0.8,
            "oneOff": False,
            "local": bool(venue and venue.get("district")),
            "updatedAt": _wall(collected),
            "sources": [{
                "id": source,
                "name": _text(item.get("source_label"), maximum=200, required=True),
                "kind": "venue" if source in ("punctum", "bikejesus", "ankali") else "aggregator",
                "url": _url(item.get("source_url")),
            }],
        }
        if start:
            event["start"] = start
            event["startInstant"] = instant.astimezone(timezone.utc).isoformat()
        if venue:
            event["venue"] = venue
        if description:
            event["description"] = description
            blurb = _blurb(description, location)
            if blurb:
                event["blurb"] = blurb
        # No raw enrichment, cached price, unknown end, or other snapshot fields.
        output.append(event)
    return {"schemaVersion": 1, "collectedAt": collected.astimezone(timezone.utc).isoformat(), "events": output}


def main() -> int:
    try:
        with DEFAULT_SNAPSHOT_PATH.open("rb") as handle:
            raw = handle.read(MAX_BYTES + 1)
        if len(raw) > MAX_BYTES:
            raise ValueError("Snapshot too large")
        print(json.dumps(public_feed(json.loads(raw)), ensure_ascii=False, allow_nan=False, separators=(",", ":")))
        return 0
    except Exception:
        print("Prague event feed is unavailable.", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
