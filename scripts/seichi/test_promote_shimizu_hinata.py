#!/usr/bin/env python3
import importlib.util
import json
import copy
import subprocess
import tempfile
import sys
import unittest
from pathlib import Path

MODULE_PATH = Path(__file__).with_name("promote_shimizu_hinata.py")
SPEC = importlib.util.spec_from_file_location("promote_shimizu_hinata", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


def candidate(key="one", *, name="spot", note="note", coordinates=(139.0, 35.0), images=None):
    source_key = MODULE.KEY_PREFIX + key
    return {
        "type": "Feature",
        "geometry": {"type": "Point", "coordinates": list(coordinates)},
        "properties": {
            "id": source_key,
            "sourceKey": source_key,
            "name": name,
            "category": "日向坂46",
            "subcategory": "清水ひなた My Maps",
            "sceneNote": note,
            "images": list(images or []),
            "members": [],
            "tags": ["日向坂46"],
            "source": {"mapId": MODULE.MAP_ID, "layer": "MV"},
        },
    }


def legacy(*, name="spot", note="note", coordinates=(139.0, 35.0), images=None):
    return {
        "type": "Feature",
        "geometry": {"type": "Point", "coordinates": list(coordinates)},
        "properties": {
            "id": "hinata_0",
            "name": name,
            "sceneNote": note,
            "sourceLabel": MODULE.LABEL,
            "images": list(images or []),
            "source": {"provider": MODULE.LABEL},
        },
    }


def manual():
    return {
        "type": "Feature",
        "geometry": {"type": "Point", "coordinates": [140.0, 36.0]},
        "properties": {"id": "manual:one", "sourceKey": "manual:one", "name": "manual"},
    }


class PromoteShimizuHinataTest(unittest.TestCase):
    def promote(self, current, staged, **overrides):
        options = {"min_features": 1, "max_additions": 50, "max_removals": 10}
        options.update(overrides)
        return MODULE.promote(
            {"type": "FeatureCollection", "features": current},
            {"type": "FeatureCollection", "features": staged},
            **options,
        )

    def test_migrates_legacy_row_preserves_r2_and_manual_feature(self):
        r2 = f"https://{MODULE.R2_HOST}/seichi/hinata/one.jpg"
        staged = candidate(images=["https://mymaps.usercontent.google.com/source.jpg"])
        result, report = self.promote([manual(), legacy(images=[r2])], [staged])
        self.assertEqual(["manual:one", MODULE.KEY_PREFIX + "one"], [
            row["properties"].get("sourceKey") for row in result["features"]
        ])
        props = result["features"][1]["properties"]
        self.assertEqual([r2], props["images"])
        self.assertEqual("MV", props["category"])
        self.assertEqual(MODULE.LABEL, props["sourceLabel"])
        self.assertEqual(1, report["matched"])
        self.assertEqual(0, report["added"])

    def test_new_google_image_uses_same_origin_proxy(self):
        result, report = self.promote([], [candidate(images=["https://mymaps.usercontent.google.com/new.png"])])
        image = result["features"][0]["properties"]["images"][0]
        self.assertTrue(image.startswith("/api/proxy-image?url="))
        self.assertEqual(1, report["newSourceImagesUsingProxy"])

    def test_preserves_existing_proxy_when_google_rotates_url(self):
        old_proxy = "/api/proxy-image?url=https%3A%2F%2Fmymaps.usercontent.google.com%2Fold.png"
        result, report = self.promote(
            [legacy(images=[old_proxy])],
            [candidate(images=["https://mymaps.usercontent.google.com/rotated.png"])],
        )
        self.assertEqual([old_proxy], result["features"][0]["properties"]["images"])
        self.assertEqual(0, report["newSourceImagesUsingProxy"])

    def test_youtube_thumbnail_remains_direct(self):
        thumbnail = "https://img.youtube.com/vi/example/hqdefault.jpg"
        result, report = self.promote([], [candidate(images=[thumbnail])])
        self.assertEqual([thumbnail], result["features"][0]["properties"]["images"])
        self.assertEqual(0, report["newSourceImagesUsingProxy"])

    def test_batches_additions_and_retains_deletions(self):
        current = [candidate("old", name="old", note="old", coordinates=(138, 34))]
        staged = [candidate("one", name="one", note="one"),
                  candidate("two", name="two", note="two", coordinates=(140, 36))]
        result, report = self.promote(current, staged, max_additions=1, max_removals=0)
        self.assertEqual(1, report["added"])
        self.assertEqual(1, report["deferredAdditions"])
        self.assertEqual(0, report["removed"])
        self.assertEqual(1, report["retainedPendingReview"])
        self.assertEqual("validated-with-pending", report["status"])
        result2, report2 = self.promote(result["features"], staged, max_additions=1)
        self.assertEqual(1, report2["added"])
        result3, report3 = self.promote(result2["features"], staged, max_additions=1)
        self.assertEqual(result2, result3)
        self.assertEqual(0, report3["added"])

    def test_rename_keeps_public_id_and_move_keeps_old_geometry(self):
        old = candidate("old", name="before")
        renamed = candidate("new", name="after")
        result, report = self.promote([old], [renamed])
        self.assertEqual(1, report["renamed"])
        self.assertEqual(old["properties"]["id"], result["features"][0]["properties"]["id"])
        moved = candidate("moved", name="after", coordinates=(139.1, 35.1))
        held, report = self.promote(result["features"], [moved])
        self.assertEqual(result, held)
        self.assertEqual(0, report["added"])
        self.assertEqual(1, report["coordinateChangesHeld"])

    def test_rename_and_move_or_ambiguous_scene_cannot_appear_as_new(self):
        old = candidate("old", name="before")
        changed = candidate("new", name="after", coordinates=(139.1, 35.1))
        held, report = self.promote([old], [changed])
        self.assertEqual([old], held["features"])
        self.assertEqual(0, report["added"])
        # Different works at one location remain distinct rows, not merged.
        first = candidate("first", name="hall", note="first work")
        second = candidate("second", name="hall", note="second work")
        result, _ = self.promote([first, second], [second, first])
        self.assertEqual(2, len(result["features"]))
        self.assertEqual({"first work", "second work"},
                         {row["properties"]["sceneNote"] for row in result["features"]})

    def test_failed_cli_replaces_stale_validated_report(self):
        with tempfile.TemporaryDirectory() as folder:
            base = Path(folder)
            source = base / "source.json"
            source.write_text(json.dumps({"type": "FeatureCollection", "features": []}))
            report = base / "report.json"
            report.write_text('{"status":"validated"}')
            run = subprocess.run([sys.executable, str(MODULE_PATH), "--current", str(source),
                                  "--candidate", str(source), "--report", str(report), "--dry-run"],
                                 capture_output=True, text=True)
            self.assertEqual(1, run.returncode)
            actual = json.loads(report.read_text())
            self.assertEqual(("failed", "promote"), (actual["status"], actual["stage"]))
            self.assertIn("failedAt", actual)

    def test_unrelated_bulk_snapshot_is_not_drained_as_new(self):
        old = [candidate(str(i), name=f"old {i}", coordinates=(139 + i / 1000, 35)) for i in range(100)]
        new = [candidate(f"new{i}", name=f"new {i}", coordinates=(140 + i / 1000, 36)) for i in range(100)]
        with self.assertRaisesRegex(ValueError, "continuity"):
            self.promote(old, new)

    def test_new_scene_before_old_does_not_steal_identity(self):
        old = candidate("old", name="hall", note="old scene")
        new = candidate("new", name="hall", note="new scene")
        result, report = self.promote([old], [new, old])
        by_note = {row["properties"]["sceneNote"]: row["properties"]["id"] for row in result["features"]}
        self.assertEqual(old["properties"]["id"], by_note["old scene"])
        self.assertEqual(new["properties"]["id"], by_note["new scene"])
        self.assertEqual(1, report["added"])

    def test_real_oct23_delta_converges_without_losing_old_rows(self):
        fixture = json.loads((MODULE_PATH.parent / "fixtures/hinata-20261023-delta.json").read_text())
        # Unchanged rows are synthetic context only; all changed rows below
        # are the captured source delta. Restore full-map continuity coverage.
        unchanged_count = fixture["fullCurrentCount"] - len(fixture["current"])
        anchors = [candidate(f"context-{i}", name=f"unchanged context {i}",
                             note=f"unchanged context {i}", coordinates=(130 + i / 100000, 30))
                   for i in range(unchanged_count)]
        current = anchors + fixture["current"]
        staged = anchors + fixture["candidate"]
        original = copy.deepcopy(staged)
        one, r1 = self.promote(current, staged)
        two, r2 = self.promote(one["features"], staged)
        three, r3 = self.promote(two["features"], staged)
        self.assertEqual((50, 50, 0), (r1["added"], r2["added"], r3["added"]))
        self.assertEqual((6, 22), (r1["renamed"], r1["retainedPendingReview"]))
        self.assertEqual(two, three)
        self.assertEqual(original, staged)
        old = next(row for row in current if row["properties"]["name"] == "相模川自転車道線")
        actual = [row for row in three["features"] if row["properties"]["name"] == "相模川自転車道線"]
        self.assertEqual([old], actual)
        self.assertEqual(0, r3["removed"])

    def test_rejects_duplicate_source_keys(self):
        row = candidate()
        with self.assertRaisesRegex(ValueError, "duplicate"):
            self.promote([], [row, row])

    def test_rejects_invalid_coordinates(self):
        with self.assertRaisesRegex(ValueError, "invalid coordinates"):
            self.promote([], [candidate(coordinates=(181, 91))])

    def test_rejects_too_small_snapshot(self):
        with self.assertRaisesRegex(ValueError, "minimum"):
            self.promote([], [candidate()], min_features=2)


if __name__ == "__main__":
    unittest.main()
