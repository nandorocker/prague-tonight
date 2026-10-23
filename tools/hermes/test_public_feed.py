import copy
import json
import unittest

from public_feed import public_feed


def event(**changes):
    return {
        "source_key": "roxy", "source_id": "schedule-123", "source_label": "Roxy",
        "source_url": "https://example.org/event?id=123&page_id=456&token=synthetic-secret#private",
        "title": "Synthetic concert", "location": "Roxy", "all_day": False,
        "start_iso": "2026-10-25T00:30:00Z", "end_iso": "2026-10-25T04:30:00Z",
        "description_text": "Public source copy", "enrichment": {"note_primary": "synthetic-secret", "price": "Free"},
        "credentials": "synthetic-secret", **changes,
    }


def source(events=None):
    return {"schema_version": 1, "collection_started_at": "2026-10-23T09:30:00Z", "collected_at": "2026-10-23T09:31:00Z", "events": [event()] if events is None else events, "profile": "synthetic-secret"}


class PublicFeedTests(unittest.TestCase):
    def test_allowlisted_projection_and_untrusted_price_end_exclusion(self):
        data = source()
        original = copy.deepcopy(data)
        feed = public_feed(data)
        self.assertEqual(data, original)
        self.assertEqual(feed["schemaVersion"], 1)
        self.assertEqual(feed["collectedAt"], "2026-10-23T09:30:00+00:00")
        e = feed["events"][0]
        self.assertEqual(e["id"], "hermes:roxy:schedule-123")
        self.assertEqual(e["category"], "other")
        self.assertEqual(e["sources"][0]["kind"], "aggregator")
        for forbidden in ("price", "end", "enrichment", "credentials", "profile"):
            self.assertNotIn(forbidden, e)
        self.assertNotIn("synthetic-secret", json.dumps(feed))
        self.assertEqual(e["sources"][0]["url"], "https://example.org/event?id=123&page_id=456")

    def test_dst_and_night_cutoff(self):
        feed = public_feed(source([
            event(source_id="before", start_iso="2026-10-25T00:30:00Z"),
            event(source_id="after", start_iso="2026-10-25T01:30:00Z"),
            event(source_id="morning", start_iso="2026-10-25T04:00:00Z"),
        ]))
        first, second, third = feed["events"]
        self.assertEqual(first["start"], "2026-10-25T02:30")
        self.assertEqual(second["start"], "2026-10-25T02:30")
        self.assertEqual(first["startInstant"], "2026-10-25T00:30:00+00:00")
        self.assertEqual(second["startInstant"], "2026-10-25T01:30:00+00:00")
        self.assertEqual(first["night"], "2026-10-24")
        self.assertEqual(third["night"], "2026-10-25")

    def test_date_only_does_not_invent_times(self):
        e = public_feed(source([event(all_day=True, start_date="2026-10-24")]))["events"][0]
        self.assertNotIn("start", e)
        self.assertNotIn("end", e)
        self.assertTrue(e["dateAmbiguous"])
        self.assertEqual(e["night"], "2026-10-24")

    def test_identity_survives_title_time_changes(self):
        old = public_feed(source())["events"][0]
        new = public_feed(source([event(title="Changed title", start_iso="2026-10-27T20:00:00+01:00")]))["events"][0]
        self.assertEqual(old["id"], new["id"])
        self.assertNotEqual(old["night"], new["night"])

    def test_unknown_or_mismatched_venue_has_no_guessed_district(self):
        for item in (event(location="Unknown place"), event(source_key="punctum", location="Roxy")):
            e = public_feed(source([item]))["events"][0]
            self.assertNotIn("district", e["venue"])
            self.assertFalse(e["local"])
        known = public_feed(source())["events"][0]
        self.assertEqual(known["venue"]["district"], "Staré Město")
        e = public_feed(source([event(location="")]))["events"][0]
        self.assertNotIn("venue", e)

    def test_empty_success_has_no_cancellation_claim(self):
        self.assertEqual(public_feed(source([]))["events"], [])
        self.assertFalse(public_feed(source())["events"][0]["canceled"])

    def test_reject_malformed_contract_or_duplicates(self):
        for data in ({}, source([event(), event()]), {**source(), "schema_version": True}, {**source(), "collection_started_at": "2026-10-23T09:30"}, {**source(), "events": {}}, source([event(source_key="private")])):
            with self.subTest(data=data), self.assertRaises((ValueError, TypeError)):
                public_feed(data)

    def test_reject_unsafe_urls_and_malformed_times(self):
        for url in ("javascript:alert(1)", "file:///etc/passwd", "https://user:password@example.org", "http://127.0.0.1/", "http://127.1/", "https://localhost/", "https://intranet.local./", "https://example.org/unsafe\npath"):
            with self.subTest(url=url), self.assertRaises(ValueError):
                public_feed(source([event(source_url=url)]))
        for start in ("2026-10-24T20:00", "not-a-date", "2026-02-30T20:00:00Z"):
            with self.subTest(start=start), self.assertRaises(ValueError):
                public_feed(source([event(start_iso=start)]))

    def test_untrusted_source_copy_remains_text(self):
        text = '<img src=x onerror="alert(1)"> & source copy'
        e = public_feed(source([event(title=text, description_text=text)]))["events"][0]
        self.assertEqual(e["title"], text)
        self.assertEqual(e["description"], text)

    def test_blurb_does_not_promote_appended_venue_and_link_lines(self):
        description = "Roxy\nhttps://example.org/event?id=123"
        e = public_feed(source([event(description_text=description)]))["events"][0]
        self.assertEqual(e["description"], description)
        self.assertNotIn("blurb", e)
        e = public_feed(source([event(description_text="Actual source description.\n" + description)]))["events"][0]
        self.assertEqual(e["blurb"], "Actual source description.")


if __name__ == "__main__":
    unittest.main()
