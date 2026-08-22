#!/usr/bin/env python3
import importlib.util
import sys
import unittest
from pathlib import Path

MODULE_PATH = Path(__file__).with_name("promote_fumi_articles.py")
SPEC = importlib.util.spec_from_file_location("promote_fumi_articles", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


def feature(key, coordinates=(139.0, 35.0), *, name="spot"):
    props = {"id": key, "sourceKey": key, "name": name}
    if key.startswith(MODULE.PREFIX):
        props.update({
            "sourceLabel": MODULE.PROVIDER,
            "sourceUrl": "http://blog.livedoor.jp/fumichen2/archives/59900000.html",
        })
    return {
        "type": "Feature",
        "geometry": {"type": "Point", "coordinates": list(coordinates)},
        "properties": props,
    }


class PromoteFumiArticlesTest(unittest.TestCase):
    def promote(self, current, candidate, **overrides):
        options = {"min_features": 1, "max_additions": 50, "max_removals": 10}
        options.update(overrides)
        return MODULE.promote(
            {"type": "FeatureCollection", "features": current},
            {"type": "FeatureCollection", "features": candidate},
            **options,
        )

    def test_replaces_only_managed_subset_and_reports_changes(self):
        base = feature("manual:1")
        unchanged = feature("fumi-article:one")
        old = feature("fumi-article:two", name="old")
        changed = feature("fumi-article:two", name="new")
        added = feature("fumi-article:three")

        result, report = self.promote([base, unchanged, old], [unchanged, changed, added])

        self.assertEqual(
            ["manual:1", "fumi-article:one", "fumi-article:two", "fumi-article:three"],
            [row["properties"]["sourceKey"] for row in result["features"]],
        )
        self.assertEqual(1, report["added"])
        self.assertEqual(0, report["removed"])
        self.assertEqual(1, report["changed"])

    def test_rejects_large_addition_or_removal(self):
        one = feature("fumi-article:one")
        two = feature("fumi-article:two")
        with self.assertRaisesRegex(ValueError, "additions"):
            self.promote([], [one, two], max_additions=1)
        with self.assertRaisesRegex(ValueError, "removals"):
            self.promote([one, two], [one], max_removals=0)

    def test_rejects_duplicate_source_keys(self):
        row = feature("fumi-article:one")
        with self.assertRaisesRegex(ValueError, "duplicate"):
            self.promote([], [row, row])

    def test_rejects_unmanaged_candidate(self):
        with self.assertRaisesRegex(ValueError, "unmanaged"):
            self.promote([], [feature("youtube:one")])

    def test_accepts_valid_overseas_coordinates(self):
        _, report = self.promote([], [feature("fumi-article:one", (121.519511, 25.054883))])
        self.assertEqual(1, report["candidateFumiFeatures"])

    def test_rejects_coordinates_outside_wgs84(self):
        with self.assertRaisesRegex(ValueError, "outside WGS84"):
            self.promote([], [feature("fumi-article:one", (181, 91))])

    def test_rejects_too_small_snapshot(self):
        with self.assertRaisesRegex(ValueError, "minimum"):
            self.promote([], [feature("fumi-article:one")], min_features=2)


if __name__ == "__main__":
    unittest.main()
