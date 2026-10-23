import ast
import copy
import fcntl
import io
import json
import os
import stat
import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor
from contextlib import redirect_stderr, redirect_stdout
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import Mock, patch

import events_snapshot as snapshot

START = datetime(2026, 10, 23, 12, tzinfo=timezone.utc)


def event(**overrides):
    return {
        "source_key": "punctum", "source_id": "123", "source_label": "Punctum",
        "source_url": "https://punctum.cz/event/example", "title": "Synthetic event",
        "description_text": "Public source copy", "all_day": False,
        "start_iso": "2026-10-25T01:30:00+02:00", "end_iso": "2026-10-25T03:30:00+01:00",
        **overrides,
    }


class SnapshotTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.path = Path(self.temporary.name) / "private/events.snapshot.json"

    def publish(self, events=None, cache=None, started=START):
        return snapshot.export_snapshot(
            [event()] if events is None else events, cache=cache or {},
            source_hash=lambda item: "hash-" + item["source_id"],
            collection_started_at=started, path=self.path,
        )

    def read(self):
        return json.loads(self.path.read_text())

    def test_full_pool_empty_pool_and_unknown_coverage(self):
        self.publish([event(), event(source_id="456")])
        payload = self.read()
        self.assertEqual(payload["schema_version"], 1)
        self.assertEqual(len(payload["events"]), 2)
        self.assertIsNone(payload["coverage"]["complete"])
        self.assertFalse(payload["coverage"]["missing_means_canceled"])
        self.publish([], started=START + timedelta(seconds=1))
        self.assertEqual(self.read()["events"], [])

    def test_annotations_require_exact_hash_and_remain_separate(self):
        cache = {"notes": {
            "hash-123": {"note_primary": "Cached copy", "note_en": "Cached English", "price": "maybe 200 Kč", "note_source": "llm", "private": "excluded"},
            "stale-hash": {"note_primary": "Old copy"},
        }}
        self.publish([event(), event(source_id="456")], cache)
        first, second = self.read()["events"]
        self.assertEqual(first["enrichment"], {
            "note_primary": "Cached copy", "note_en": "Cached English", "price": "maybe 200 Kč", "note_source": "llm",
        })
        self.assertNotIn("price", first)
        self.assertNotIn("enrichment", second)

    def test_bad_annotations_do_not_block_raw_events(self):
        for offset, entry in enumerate((None, [], {"note_primary": {"nested": "bad"}}, {"price": 200})):
            with self.subTest(entry=entry):
                self.publish(cache={"notes": {"hash-123": entry}}, started=START + timedelta(seconds=offset))
                self.assertNotIn("enrichment", self.read()["events"][0])

    def test_unknown_annotation_origin_and_bad_cache(self):
        self.publish(cache={"notes": {"hash-123": {"note_primary": "Copy", "note_source": "other"}}})
        self.assertEqual(self.read()["events"][0]["enrichment"]["note_source"], "unknown")
        self.publish(cache={"notes": []}, started=START + timedelta(seconds=1))
        self.assertNotIn("enrichment", self.read()["events"][0])

    def test_allowlist_and_no_input_mutation(self):
        source = event(attendees=["private"], credentials={"token": "synthetic-secret"}, price_hits=["guess"])
        cache = {"notes": {"hash-123": {"note_primary": "Note", "token": "synthetic-secret"}}, "profile": "private"}
        before = copy.deepcopy((source, cache))
        self.publish([source], cache)
        self.assertEqual((source, cache), before)
        text = self.path.read_text()
        for forbidden in ("attendees", "credentials", "synthetic-secret", "price_hits", "profile"):
            self.assertNotIn(forbidden, text)

    def test_temporal_values_preserved_without_claiming_verified_end(self):
        timed = event()
        date_only = event(source_id="day", all_day=True, start_date="2026-10-24", end_date="2026-10-25")
        del date_only["start_iso"]
        del date_only["end_iso"]
        self.publish([timed, date_only])
        first, second = self.read()["events"]
        self.assertEqual(first["start_iso"], timed["start_iso"])
        self.assertEqual(first["end_iso"], timed["end_iso"])
        self.assertEqual(first["end_provenance"], "unknown")
        self.assertTrue(second["all_day"])
        self.assertNotIn("start_iso", second)
        self.assertEqual(second["end_date"], "2026-10-25")

    def test_identity_survives_content_changes(self):
        self.publish()
        first_id = self.read()["events"][0]["id"]
        self.publish([event(title="Changed title", start_iso="2026-10-26T20:00:00+01:00")], started=START + timedelta(seconds=1))
        self.assertEqual(self.read()["events"][0]["id"], first_id)

    def test_invalid_event_keeps_previous_file(self):
        self.publish()
        previous = self.path.read_bytes()
        for bad in (
            event(source_key="unapproved"), event(source_id=""), event(title={"nested": "bad"}),
            event(source_url="javascript:alert(1)"), event(source_url="https://user:password@example.com/event"),
            event(all_day=None), event(start_iso=""),
        ):
            with self.subTest(bad=bad):
                with self.assertRaises(ValueError):
                    self.publish([bad], started=START + timedelta(seconds=1))
                self.assertEqual(self.path.read_bytes(), previous)

    def test_duplicate_identity_rejected(self):
        with self.assertRaises(ValueError):
            self.publish([event(), event()])
        self.assertFalse(self.path.exists())

    def test_public_schemeless_links_and_surrounding_whitespace(self):
        self.publish([event(source_url="  www.example.org/events/example\n"), event(source_id="second", source_url="//example.org/second")])
        first, second = self.read()["events"]
        self.assertEqual(first["source_url"], "https://www.example.org/events/example")
        self.assertEqual(second["source_url"], "https://example.org/second")

    def test_naive_collection_clock_rejected(self):
        with self.assertRaises(ValueError):
            self.publish(started=START.replace(tzinfo=None))
        self.assertFalse(self.path.parent.exists())

    def test_private_permissions(self):
        self.publish()
        self.assertEqual(stat.S_IMODE(self.path.parent.stat().st_mode), 0o700)
        self.assertEqual(stat.S_IMODE(self.path.stat().st_mode), 0o600)

    def test_shared_directory_and_symlinks_rejected(self):
        self.path.parent.mkdir(mode=0o755)
        self.path.parent.chmod(0o755)
        with self.assertRaises(PermissionError):
            self.publish()
        self.path.parent.chmod(0o700)
        target = self.path.parent / "target"
        target.write_text("leave untouched")
        self.path.symlink_to(target)
        with self.assertRaises(PermissionError):
            self.publish()
        self.assertEqual(target.read_text(), "leave untouched")

    def test_replace_and_write_failures_preserve_previous_and_clean_temp(self):
        self.publish()
        previous = self.path.read_bytes()
        for name in ("os.replace", "os.fsync"):
            with self.subTest(operation=name), patch(f"events_snapshot.{name}", side_effect=OSError("synthetic failure")):
                with self.assertRaises(OSError):
                    self.publish([event(title="New copy")], started=START + timedelta(seconds=1))
                self.assertEqual(self.path.read_bytes(), previous)
                self.assertEqual(list(self.path.parent.glob(".snapshot-*")), [])

    def test_hash_failure_preserves_previous(self):
        self.publish()
        previous = self.path.read_bytes()
        with self.assertRaises(RuntimeError):
            snapshot.export_snapshot([event()], cache={}, source_hash=Mock(side_effect=RuntimeError("hash failed")), collection_started_at=START, path=self.path)
        self.assertEqual(self.path.read_bytes(), previous)

    def test_older_and_repeated_collections_do_not_replace_newer(self):
        self.publish(started=START + timedelta(minutes=2))
        previous = self.path.read_bytes()
        self.assertFalse(self.publish(started=START))
        self.assertFalse(self.publish(started=START + timedelta(minutes=2)))
        self.assertEqual(self.path.read_bytes(), previous)

    def test_busy_writer_does_not_delay_calendar_worker(self):
        self.publish()
        previous = self.path.read_bytes()
        with (self.path.parent / ".snapshot.lock").open("a") as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            self.assertFalse(self.publish(started=START + timedelta(seconds=1)))
        self.assertEqual(self.path.read_bytes(), previous)

    def test_concurrent_publication_keeps_newest_accepted_collection(self):
        def publish(offset):
            return offset, self.publish([event(title=str(offset))], started=START + timedelta(seconds=offset))
        with ThreadPoolExecutor(max_workers=4) as executor:
            results = list(executor.map(publish, [4, 2, 8, 1, 6]))
        newest_published = max(offset for offset, written in results if written)
        self.assertEqual(self.read()["events"][0]["title"], str(newest_published))

    def test_malformed_previous_snapshot_can_be_replaced(self):
        self.path.parent.mkdir(mode=0o700)
        self.path.write_text("bad JSON")
        self.assertTrue(self.publish())
        self.assertEqual(len(self.read()["events"]), 1)


@unittest.skipUnless(os.getenv("HERMES_EVENTS_SYNC_SCRIPT"), "Set HERMES_EVENTS_SYNC_SCRIPT to verify the installed run() hook")
class HookTests(unittest.TestCase):
    def setUp(self):
        tree = ast.parse(Path(os.environ["HERMES_EVENTS_SYNC_SCRIPT"]).read_text())
        run = next(node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name == "run")
        self.calendar = Mock(side_effect=RuntimeError("calendar sentinel"))
        self.collect = Mock(return_value=[event()])
        self.cache = Mock(return_value={"notes": {}})
        self.hash = Mock(return_value="hash-123")
        namespace = {
            "datetime": datetime, "timezone": timezone, "sys": __import__("sys"),
            "iter_all_events": self.collect, "load_sync_cache": self.cache,
            "compute_source_hash": self.hash, "list_calendar_events": self.calendar,
            "dry_run_report": lambda events: "synthetic dry run",
        }
        exec(compile(ast.Module(body=[run], type_ignores=[]), "installed-worker-run", "exec"), namespace)
        self.run = namespace["run"]

    def assert_calendar_continues(self):
        with self.assertRaisesRegex(RuntimeError, "calendar sentinel"):
            self.run()
        self.calendar.assert_called_once_with()
        self.collect.assert_called_once_with()

    def test_full_collection_exported_before_calendar(self):
        with patch.object(snapshot, "export_snapshot") as export:
            self.assert_calendar_continues()
            self.assertEqual(export.call_args.args[0], [event()])
            self.assertEqual(export.call_args.kwargs["cache"], {"notes": {}})
            self.assertIs(export.call_args.kwargs["source_hash"], self.hash)
            self.assertIsNotNone(export.call_args.kwargs["collection_started_at"].tzinfo)

    def test_dry_run_does_not_read_cache_or_export(self):
        with patch.object(snapshot, "export_snapshot") as export, redirect_stdout(io.StringIO()):
            self.assertEqual(self.run(dry_run=True), 0)
            export.assert_not_called()
            self.cache.assert_not_called()
            self.calendar.assert_not_called()

    def test_import_failure_does_not_block_calendar(self):
        with patch.dict("sys.modules", {"events_snapshot": None}), redirect_stderr(io.StringIO()) as warning:
            self.assert_calendar_continues()
            self.assertIn("retaining previous snapshot", warning.getvalue())

    def test_cache_or_export_failure_does_not_block_calendar(self):
        for failure in ("cache", "export"):
            with self.subTest(failure=failure):
                self.collect.reset_mock()
                self.calendar.reset_mock()
                self.cache.side_effect = OSError("synthetic secret") if failure == "cache" else None
                with patch.object(snapshot, "export_snapshot", side_effect=OSError("synthetic secret")), redirect_stderr(io.StringIO()) as warning:
                    self.assert_calendar_continues()
                    self.assertNotIn("synthetic secret", warning.getvalue())

    def test_collection_failure_does_not_export(self):
        self.collect.side_effect = RuntimeError("collection failure")
        with patch.object(snapshot, "export_snapshot") as export:
            with self.assertRaisesRegex(RuntimeError, "collection failure"):
                self.run()
            export.assert_not_called()
            self.calendar.assert_not_called()


if __name__ == "__main__":
    unittest.main()
