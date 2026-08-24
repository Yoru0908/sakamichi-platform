import copy
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from promote_oversea_mymaps import promote


def feature(key, name, lng, lat, *, images=None, note="note", layer="Trip"):
    return {
        "type": "Feature",
        "geometry": {"type": "Point", "coordinates": [lng, lat]},
        "properties": {
            "id": key,
            "sourceKey": key,
            "name": name,
            "category": layer,
            "subcategory": layer,
            "categoryColor": "#000000",
            "sceneTitle": "",
            "sceneNote": note,
            "sourceLabel": "source",
            "sourceUrl": "https://example.test",
            "tags": [],
            "images": images or [],
            "members": [],
            "source": {"layer": layer},
        },
    }


class PromoteTests(unittest.TestCase):
    def test_preserves_r2_images_and_proxies_new_google_images(self):
        r2 = "https://pub-6d7574c4452b41519ab8adf1541d7f9e.r2.dev/seichi/oversea/a.png"
        current = {"type": "FeatureCollection", "features": [feature("old", "Place", 1, 2, images=[r2])]}
        candidate = {"type": "FeatureCollection", "features": [
            feature("new", "Place", 1, 2, images=["https://mymaps.usercontent.google.com/a.png"]),
            feature("added", "New", 3, 4, images=["https://mymaps.usercontent.google.com/b.png"]),
        ]}
        result, report = promote(current, candidate, min_features=1, max_additions=5, max_removals=5)
        self.assertEqual(result["features"][0]["properties"]["images"], [r2])
        self.assertTrue(
            result["features"][1]["properties"]["images"][0].startswith("/api/proxy-image?url=")
        )
        self.assertEqual(report["newSourceImagesUsingProxy"], 1)
        self.assertEqual(report["added"], 1)
        self.assertEqual(result["features"][0]["properties"]["tags"], ["海外", "Trip"])

    def test_preserves_existing_proxy_when_google_rotates_url(self):
        old_proxy = "/api/proxy-image?url=https%3A%2F%2Fmymaps.usercontent.google.com%2Fold.png"
        current = {"type": "FeatureCollection", "features": [
            feature("stable", "Place", 1, 2, images=[old_proxy]),
        ]}
        candidate = {"type": "FeatureCollection", "features": [
            feature("stable", "Place", 1, 2, images=["https://mymaps.usercontent.google.com/rotated.png"]),
        ]}
        result, report = promote(current, candidate, min_features=1, max_additions=5, max_removals=5)
        self.assertEqual([old_proxy], result["features"][0]["properties"]["images"])
        self.assertEqual(0, report["newSourceImagesUsingProxy"])

    def test_refuses_unexpected_bulk_removal(self):
        current = {"type": "FeatureCollection", "features": [
            feature(f"old-{index}", f"Place {index}", index, 2) for index in range(5)
        ]}
        candidate = {"type": "FeatureCollection", "features": [copy.deepcopy(current["features"][0])]}
        with self.assertRaisesRegex(ValueError, "removals"):
            promote(current, candidate, min_features=1, max_additions=5, max_removals=1)

    def test_refuses_duplicate_source_keys(self):
        row = feature("duplicate", "Place", 1, 2)
        candidate = {"type": "FeatureCollection", "features": [row, copy.deepcopy(row)]}
        current = {"type": "FeatureCollection", "features": []}
        with self.assertRaisesRegex(ValueError, "duplicate sourceKey"):
            promote(current, candidate, min_features=1, max_additions=5, max_removals=5)


if __name__ == "__main__":
    unittest.main()
