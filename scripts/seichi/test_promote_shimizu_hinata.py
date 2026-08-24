#!/usr/bin/env python3
import importlib.util
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

    def test_rejects_large_addition_or_removal(self):
        with self.assertRaisesRegex(ValueError, "additions"):
            self.promote([], [candidate("one"), candidate("two", coordinates=(140, 36))], max_additions=1)
        with self.assertRaisesRegex(ValueError, "removals"):
            self.promote([legacy(), legacy(name="two", coordinates=(140, 36))], [candidate()], max_removals=0)

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
