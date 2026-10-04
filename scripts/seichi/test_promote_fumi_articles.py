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
        options = {"min_features": 0, "max_additions": 50}
        options.update(overrides)
        return MODULE.promote(
            {"type": "FeatureCollection", "features": current},
            {"type": "FeatureCollection", "features": candidate},
            **options,
        )

    def test_appends_new_keys_and_never_changes_published_points(self):
        base = feature("manual:1")
        published = feature("fumi-article:two", name="published")
        reparsed = feature("fumi-article:two", name="reparsed")
        added = feature("fumi-article:three")

        result, report = self.promote([base, published], [reparsed, added])

        self.assertEqual(
            ["manual:1", "fumi-article:two", "fumi-article:three"],
            [row["properties"]["sourceKey"] for row in result["features"]],
        )
        self.assertEqual("published", result["features"][1]["properties"]["name"])
        self.assertEqual((1, 0, 1), (report["added"], report["removed"], report["alreadyPublished"]))

    def test_never_removes_published_points(self):
        one, two = feature("fumi-article:one"), feature("fumi-article:two")
        result, report = self.promote([one, two], [])
        self.assertEqual(2, len(result["features"]))
        self.assertEqual(0, report["removed"])

    def test_rejects_large_addition(self):
        one, two = feature("fumi-article:one"), feature("fumi-article:two")
        with self.assertRaisesRegex(ValueError, "additions"):
            self.promote([], [one, two], max_additions=1)

    def test_rejects_duplicate_source_keys(self):
        row = feature("fumi-article:one")
        with self.assertRaisesRegex(ValueError, "duplicate"):
            self.promote([], [row, row])

    def test_rejects_unmanaged_candidate(self):
        with self.assertRaisesRegex(ValueError, "unmanaged"):
            self.promote([], [feature("youtube:one")])

    def with_url(self, url):
        f = feature("fumi-article:one")
        f["properties"]["sourceUrl"] = url
        return f

    def test_accepts_new_livedoor_blog_domain(self):
        # fumi's blog moved to fumichen2.livedoor.blog (~2026-09-10); the old check failed every run.
        _, report = self.promote([], [self.with_url("https://fumichen2.livedoor.blog/archives/58503750.html")])
        self.assertEqual(1, report["candidateFumiFeatures"])

    def test_rejects_foreign_source_url(self):
        for url in ("https://evil.livedoor.blog/archives/1.html", "https://fumichen2.livedoor.blog.evil.com/archives/1.html"):
            with self.assertRaisesRegex(ValueError, "unexpected fumi source URL"):
                self.promote([], [self.with_url(url)])

    def test_accepts_valid_overseas_coordinates(self):
        _, report = self.promote([], [feature("fumi-article:one", (121.519511, 25.054883))])
        self.assertEqual(1, report["candidateFumiFeatures"])

    def test_rejects_coordinates_outside_wgs84(self):
        with self.assertRaisesRegex(ValueError, "outside WGS84"):
            self.promote([], [feature("fumi-article:one", (181, 91))])

    def test_rejects_a_truncated_current_map(self):
        with self.assertRaisesRegex(ValueError, "minimum"):
            self.promote([feature("fumi-article:one")], [], min_features=2)


if __name__ == "__main__":
    unittest.main()
