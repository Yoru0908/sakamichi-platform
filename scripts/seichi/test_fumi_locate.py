#!/usr/bin/env python3
import json
import sys
import tempfile
import unittest
import unittest.mock
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import fumi_locate as L  # noqa: E402


def spot(**extra):
    return {"name": "某カフェ", "address": "東京都渋谷区神南", "lat": 35.66, "lng": 139.70, "coordPrecision": "town", **extra}


class FumiLocateTest(unittest.TestCase):
    def test_name_variants_drop_lines_and_branch_names(self):
        self.assertEqual(["池袋駅西口", "池袋駅", "池袋"], [v for v in L.name_variants("JR池袋駅西口") if v != "JR池袋駅西口"])
        self.assertEqual([], L.name_variants("賀茂川沿い (東側) / 鴨川ジョギングロード"))
        self.assertEqual(["風籟堂 紅葉谷店", "風籟堂"], L.name_variants("風籟堂 紅葉谷店 / うぐいす歩道"))

    def test_same_name_refuses_partial_and_chain_matches(self):
        self.assertTrue(L.same_name("池袋", "池袋駅"))
        self.assertFalse(L.same_name("中央広場", "代々木公園中央広場"))
        self.assertFalse(L.same_name("ローソン 嵐山渡月橋店", "渡月橋"))

    def test_big_areas_have_a_large_half_diagonal(self):
        self.assertGreater(L._half_diagonal({"boundingbox": ["35.60", "35.62", "139.85", "139.88"]}), L.MAX_HALF_DIAGONAL_M)
        self.assertLess(L._half_diagonal({"boundingbox": ["35.6000", "35.6005", "139.8500", "139.8505"]}), L.MAX_HALF_DIAGONAL_M)

    def test_hits_outside_the_anchor_municipality_are_refused(self):
        with unittest.mock.patch.object(L, "STEPS", [lambda s, a: ((35.0, 135.0), "x")]), \
             unittest.mock.patch.object(L, "municipality", side_effect=["13113", "27100"]):
            self.assertIsNone(L.find(spot(), (35.66, 139.70)))

    def test_no_anchor_municipality_means_no_upgrade(self):
        with unittest.mock.patch.object(L, "municipality", return_value=""):
            self.assertIsNone(L.find(spot(), (35.66, 139.70)))

    def test_outage_defers_and_is_not_cached(self):
        with tempfile.TemporaryDirectory() as tmp, unittest.mock.patch.object(L, "find", side_effect=L.Unavailable("down")):
            cache = Path(tmp) / "c.json"
            spots = [spot()]
            self.assertEqual({"anchored": 0, "located": 0, "named": 0, "deferred": 1}, L.resolve(spots, cache))
            self.assertEqual(({}, "town"), (json.loads(cache.read_text()), spots[0]["coordPrecision"]))

    def test_found_coordinate_and_position_name_are_applied_and_cached(self):
        with tempfile.TemporaryDirectory() as tmp, \
             unittest.mock.patch.object(L, "find", return_value=((35.661, 139.701), "osm cafe 某カフェ")), \
             unittest.mock.patch.object(L, "name_here", return_value="神南一丁目付近"):
            spots = [spot(), spot(name="", address="", coordPrecision="exact", lat=35.5, lng=139.5)]
            stats = L.resolve(spots, Path(tmp) / "c.json")
        self.assertEqual({"anchored": 0, "located": 1, "named": 1, "deferred": 0}, stats)
        self.assertEqual((35.661, "exact", "lookup"), (spots[0]["lat"], spots[0]["coordPrecision"], spots[0]["coordSource"]))
        self.assertEqual(("神南一丁目付近", "position"), (spots[1]["name"], spots[1]["nameSource"]))


if __name__ == "__main__":
    unittest.main()
