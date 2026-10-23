"""Private, network-free snapshot of the existing Prague event collection.

This is an interchange file, not a public feed or a source of verified facts.
Calendar records, credentials and profile preferences never enter this module.
"""
from __future__ import annotations

import fcntl
import json
import os
import stat
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable
from urllib.parse import urlsplit

DEFAULT_SNAPSHOT_PATH = Path(__file__).resolve().parent.parent / "data/prague-tonight/events.snapshot.json"
SOURCE_KEYS = frozenset({
    "punctum", "bikejesus", "ankali", "vilastvanice", "subzero", "lucerna",
    "roxy", "palac-akropolis", "meetfactory", "forum-karlin", "cross-club", "dox", "naplavka",
})
TEXT_FIELDS = (
    "source_key", "source_id", "source_label", "source_url", "title", "subtitle",
    "description_text", "location", "start_iso", "end_iso", "start_date", "end_date",
)


def _annotation(entry: object) -> dict | None:
    if not isinstance(entry, dict):
        return None
    result = {}
    for key in ("note_primary", "note_en", "price"):
        value = entry.get(key)
        if value is not None:
            if not isinstance(value, str):
                return None
            result[key] = value
    if not result:
        return None
    origin = entry.get("note_source")
    result["note_source"] = origin if origin in ("llm", "fallback") else "unknown"
    # These are cached annotations, NOT validated source prices or event facts.
    return result


def _project(event: dict, notes: dict, source_hash: Callable[[dict], str]) -> dict:
    if event.get("source_key") not in SOURCE_KEYS:
        raise ValueError("Unapproved event source")
    result = {}
    for key in TEXT_FIELDS:
        value = event.get(key)
        if value is not None:
            if not isinstance(value, str):
                raise ValueError("Expected scalar event text")
            result[key] = value
    for key in ("source_id", "title", "source_url"):
        if not result.get(key):
            raise ValueError("Missing event identity or source")
    source_url = result["source_url"].strip()
    # Some GoOut source URLs omit the scheme. Normalize only explicit www/
    # scheme-relative links; never turn arbitrary text into a navigable URL.
    if source_url.startswith("www."):
        source_url = "https://" + source_url
    elif source_url.startswith("//"):
        source_url = "https:" + source_url
    url = urlsplit(source_url)
    if url.scheme not in ("http", "https") or not url.hostname or url.username or url.password or any(c.isspace() for c in source_url):
        raise ValueError("Expected public HTTP source URL")
    result["source_url"] = source_url
    all_day = event.get("all_day")
    if not isinstance(all_day, bool):
        raise ValueError("Missing date precision")
    if not result.get("start_date" if all_day else "start_iso"):
        raise ValueError("Missing event start")
    result["all_day"] = all_day
    result["id"] = f"{result['source_key']}:{result['source_id']}"
    # The collector fills missing end times. It does not retain their provenance.
    result["end_provenance"] = "unknown"
    fingerprint = source_hash(event)
    if not isinstance(fingerprint, str) or not fingerprint:
        raise ValueError("Missing content fingerprint")
    result["source_hash"] = fingerprint
    annotation = _annotation(notes.get(fingerprint))
    if annotation:
        result["enrichment"] = annotation
    return result


def _utc(value: datetime) -> str:
    if value.tzinfo is None or value.utcoffset() is None:
        raise ValueError("Collection timestamp must have a timezone")
    return value.astimezone(timezone.utc).isoformat()


def export_snapshot(
    events: list[dict], *, cache: dict, source_hash: Callable[[dict], str],
    collection_started_at: datetime, path: Path = DEFAULT_SNAPSHOT_PATH,
) -> bool:
    """Atomically publish a full collection; skip older runs or a busy writer.

    Only local serialization/I/O occurs here. Failures propagate to the worker's
    best-effort hook, which must not let them affect calendar synchronization.
    """
    started_at = _utc(collection_started_at)
    notes = cache.get("notes", {})
    if not isinstance(notes, dict):
        notes = {}
    projected = [_project(event, notes, source_hash) for event in events]
    if len({event["id"] for event in projected}) != len(projected):
        raise ValueError("Duplicate source identities")
    payload = {
        "schema_version": 1,
        "collection_started_at": started_at,
        "collected_at": _utc(datetime.now(timezone.utc)),
        "coverage": {
            "complete": None,
            "missing_means_canceled": False,
            "window": "collector_upcoming_only",
        },
        "events": projected,
    }
    # Serialize before touching the last good file. allow_nan rejects invalid JSON.
    encoded = json.dumps(payload, ensure_ascii=False, allow_nan=False, separators=(",", ":")) + "\n"
    path = Path(path)
    directory = path.parent
    directory.mkdir(mode=0o700, parents=True, exist_ok=True)
    info = directory.lstat()
    if not stat.S_ISDIR(info.st_mode) or info.st_uid != os.getuid() or stat.S_IMODE(info.st_mode) & 0o077:
        raise PermissionError("Snapshot directory must be owned and private")
    # Lock the ordering check AND replacement, not just the write. An older
    # collection finishing late must not replace a newer collection's snapshot.
    lock_fd = os.open(directory / ".snapshot.lock", os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    with os.fdopen(lock_fd, "a") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            # An optional export must not wait on another publisher and delay
            # the calendar worker. A later scheduled run can publish instead.
            return False
        if path.is_symlink():
            raise PermissionError("Snapshot must not be a symlink")
        try:
            previous = json.loads(path.read_text(encoding="utf-8"))
            previous_start = datetime.fromisoformat(previous["collection_started_at"])
            if previous_start >= datetime.fromisoformat(started_at):
                return False
        except (FileNotFoundError, ValueError, KeyError, TypeError):
            # A missing/malformed snapshot is not a last-good generation.
            pass
        temporary = None
        try:
            with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=directory, prefix=".snapshot-", delete=False) as handle:
                temporary = Path(handle.name)
                handle.write(encoded)
                handle.flush()
                os.fsync(handle.fileno())
            os.replace(temporary, path)
        finally:
            if temporary is not None:
                temporary.unlink(missing_ok=True)
    return True
