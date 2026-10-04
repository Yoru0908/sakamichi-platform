#!/usr/bin/env python3
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import place_extract as P  # noqa: E402

TITLE = "櫻坂46 山川宇衣 Vlog撮影場所"


def names(lines, scores=None):
    return [(s["name"], s["address"], s["lat"]) for s in P.extract(lines, TITLE, scores or {})]


class PlaceExtractTest(unittest.TestCase):
    def test_without_jev_the_nearest_place_line_wins(self):
        lines = ["渋谷スカイ", "とても眺めが良かったです！", "〒150-0002 東京都渋谷区渋谷2-24-12", "座標: 35.658, 139.702"]
        self.assertEqual([("渋谷スカイ", "東京都渋谷区渋谷2-24-12", 35.658)], names(lines))

    def test_jev_ranking_can_beat_the_layout_prior(self):
        lines = ["納豆劇場", "台北の路地裏", "〒150-0002 東京都渋谷区渋谷2-24-12"]
        anchor = lines[2]
        scores = {P.question_key(anchor, "納豆劇場"): 0.9, P.question_key(anchor, "台北の路地裏"): 0.1}
        self.assertEqual("納豆劇場", names(lines, scores)[0][0])
        self.assertEqual("台北の路地裏", names(lines)[0][0])

    def test_profile_lines_give_no_name(self):
        lines = ["山川 宇衣 (やまかわ うい)", "立教大学2年生、19歳", "座標: 38.260646, 140.881072"]
        self.assertEqual([("", "", 38.260646)], names(lines))

    def test_label_split_by_a_link_is_joined(self):
        lines = ["橫濱媽祖廟", "前 / 南門シルクロード", "〒231-0023 神奈川県横浜市中区山下町136"]
        self.assertEqual("橫濱媽祖廟前 / 南門シルクロード", names(lines)[0][0])

    def test_head_before_comma_is_a_candidate(self):
        lines = ["家康の湯、JR熱海駅前にある足湯", "〒413-0011 静岡県熱海市田原本町11-1"]
        scores = {P.question_key(lines[1], "家康の湯"): 0.9}
        self.assertEqual("家康の湯", names(lines, scores)[0][0])

    def test_names_do_not_cross_the_previous_entry(self):
        lines = ["一軒目のカフェ", "〒150-0002 東京都渋谷区渋谷1-1-1", "座標: 35.1, 139.1", "とても美味しかった！", "座標: 35.2, 139.2"]
        self.assertEqual([("一軒目のカフェ", "東京都渋谷区渋谷1-1-1", 35.1), ("", "", 35.2)], names(lines))

    def test_coordinate_after_a_newly_named_place_is_its_own_spot(self):
        lines = ["お店", "〒150-0002 東京都渋谷区渋谷1-1-1", "撮影した公園", "座標: 35.1, 139.1"]
        self.assertEqual([("お店", "東京都渋谷区渋谷1-1-1", None), ("撮影した公園", "", 35.1)], names(lines))

    def test_site_url_belongs_to_its_own_entry_only(self):
        lines = ["https://a.example/", "A店", "〒150-0002 東京都渋谷区渋谷1-1-1", "B店", "〒150-0002 東京都渋谷区渋谷1-1-2"]
        self.assertEqual(["https://a.example/", ""], [s["siteUrl"] for s in P.extract(lines, TITLE, {})])

    def test_scorer_without_key_asks_nothing_and_does_not_fail(self):
        scorer = P.JevScorer(Path("/nonexistent/cache.json"), Path("/nonexistent/env"))
        scorer.key = ""
        self.assertEqual({}, scorer.score(["A店", "〒150-0002 東京都渋谷区渋谷1-1-1"], TITLE))
        self.assertFalse(scorer.failed)


if __name__ == "__main__":
    unittest.main()
