#!/usr/bin/env python3
import json
import os
import subprocess
import sys
import tempfile
import unittest
import unittest.mock
from pathlib import Path

os.environ["SEICHI_ALERT_DRY_RUN"] = "1"
os.environ["SEICHI_TYPESAFE_ENV"] = "/nonexistent"
os.environ.pop("TYPESAFE_API_KEY", None)
sys.path.insert(0, str(Path(__file__).parent))
import fumi_geo  # noqa: E402
import fumi_review  # noqa: E402

URL = "https://fumichen2.livedoor.blog/archives/60100000.html"


def feature(key, lng=139.70, lat=35.66, name="新しい場所", address="東京都渋谷区神南1-1-1", precision="exact"):
    return {"type": "Feature", "geometry": {"type": "Point", "coordinates": [lng, lat]},
            "properties": {"id": key, "sourceKey": key, "name": name, "address": address, "sourceUrl": URL,
                           "sceneTitle": "櫻坂46 山川宇衣 Vlog撮影場所", "category": "Vlog・企画",
                           "subcategory": "Vlog", "coordPrecision": precision, "source": {"name": name},
                           "classification": {"category": "Vlog・企画", "subcategory": "Vlog"}}}


def collection(*features):
    return {"type": "FeatureCollection", "features": list(features)}


class FumiReviewTest(unittest.TestCase):
    def run_review(self, candidate, current=(), curated=(), overrides=None):
        kept, held, _ = fumi_review.review(collection(*candidate), collection(*current), collection(*curated), overrides or {})
        return [f["properties"]["id"] for f in kept["features"]], {h["key"]: h["reasons"] for h in held}

    def test_clean_new_spot_is_published(self):
        self.assertEqual((["fumi-article:a"], {}), self.run_review([feature("fumi-article:a")]))

    def test_unnamed_coarse_and_same_article_duplicate_spots_are_held(self):
        kept, held = self.run_review([
            feature("fumi-article:first", address="東京都渋谷区神南9-9-9"),
            feature("fumi-article:noname", lng=135.0, name=""),
            feature("fumi-article:town", lng=136.0, name="町の店", precision="town"),
            feature("fumi-article:dup", lng=139.7001, address="東京都渋谷区神南5-5-5"),
            feature("fumi-article:shop", lng=139.7002, name="隣の店", address="東京都渋谷区神南4-4-4"),
        ])
        self.assertEqual(["fumi-article:first", "fumi-article:shop"], kept)
        self.assertEqual({"fumi-article:noname": ["no-name"], "fumi-article:town": ["coarse"], "fumi-article:dup": ["duplicate"]}, held)

    def test_revisit_of_another_articles_place_is_published(self):
        other = feature("fumi-article:old", lng=139.7001)
        other["properties"]["sourceUrl"] = "https://fumichen2.livedoor.blog/archives/59000000.html"
        self.assertEqual((["fumi-article:a"], {}), self.run_review([feature("fumi-article:a")], current=[other]))

    def test_reparsed_published_article_is_held_not_appended(self):
        old = feature("fumi-article:old", lng=139.9)
        kept, held = self.run_review([feature("fumi-article:old", lng=139.9), feature("fumi-article:rekeyed", name="再解析")], current=[old])
        self.assertEqual((["fumi-article:old"], {"fumi-article:rekeyed": ["changed"]}), (kept, held))

    def test_jev_decides_only_the_rule_fallback_and_otherwise_just_notes_a_doubt(self):
        fallback, ruled = feature("fumi-article:a"), feature("fumi-article:b", lng=135.0)
        fallback["properties"]["subcategory"] = "その他企画"
        ruled["properties"]["sourceUrl"] = URL.replace("60100000", "60100001")
        answer = {"choice": "番組・イベント", "confidence": 0.9}
        with unittest.mock.patch.object(fumi_review, "jev", return_value={"c0": answer, "c1": answer}):
            kept, _, doubts = fumi_review.review(collection(fallback, ruled), collection(), collection(), {})
        self.assertEqual(["番組・イベント", "Vlog・企画"], [f["properties"]["category"] for f in kept["features"]])
        self.assertEqual("jev", kept["features"][0]["properties"]["classification"]["method"])
        self.assertEqual([ruled["properties"]["sourceUrl"]], [d["url"] for d in doubts])

    def test_curated_map_counts_as_published(self):
        curated = feature("mag2026-rokugo-park", lng=139.70005)
        self.assertEqual({"fumi-article:a": ["duplicate"]}, self.run_review([feature("fumi-article:a")], curated=[curated])[1])

    def test_overrides_release_rename_or_skip(self):
        overrides = {"fumi-article:a": {"action": "publish", "name": "正しい名前", "lat": 35.1, "lng": 139.1},
                     "fumi-article:b": {"action": "skip"}}
        kept, held, _ = fumi_review.review(collection(feature("fumi-article:a", name=""), feature("fumi-article:b", lng=138.0)),
                                           collection(), collection(), overrides)
        self.assertEqual(["fumi-article:a"], [f["properties"]["id"] for f in kept["features"]])
        self.assertEqual(("正しい名前", [139.1, 35.1]), (kept["features"][0]["properties"]["name"], kept["features"][0]["geometry"]["coordinates"]))
        self.assertEqual([], held)

    def test_cli_notifies_each_held_key_once(self):
        with tempfile.TemporaryDirectory() as tmp:
            d = Path(tmp)
            (d / "cand.json").write_text(json.dumps(collection(feature("fumi-article:noname", name=""))))
            for name in ("cur.json", "cur2.json"):
                (d / name).write_text(json.dumps(collection()))
            (d / "ovr.json").write_text("{}")
            cmd = [sys.executable, str(Path(fumi_review.__file__)), "--candidate", str(d / "cand.json"), "--current", str(d / "cur.json"),
                   "--curated", str(d / "cur2.json"), "--overrides", str(d / "ovr.json"), "--output", str(d / "out.json"),
                   "--report", str(d / "rep.json"), "--state", str(d / "state.json")]
            first = subprocess.run(cmd, capture_output=True, text=True, check=True).stdout
            second = subprocess.run(cmd, capture_output=True, text=True, check=True).stdout
            self.assertIn("【fumi 新地点待确认】1 件未发布", first)
            self.assertIn("fumi-article:noname", first)
            self.assertNotIn("dry-run alert", second)
            self.assertEqual([], json.loads((d / "out.json").read_text())["features"])


    def test_unresolved_spots_from_the_crawl_report_are_listed(self):
        rows = fumi_review.unresolved({"unresolvedSpots": [{"name": "某店", "address": "東京都渋谷区", "articleUrl": URL, "title": "t"}]})
        self.assertEqual(["unresolved:60100000:東京都渋谷区"], [row["key"] for row in rows])
        self.assertIn("查不到坐标", fumi_review.notice(rows, []))

    def test_network_errors_are_not_cached(self):
        spots = [{"address": "東京都渋谷区神南1-1-1", "lat": None, "lng": None}]
        with tempfile.TemporaryDirectory() as tmp, unittest.mock.patch.object(fumi_geo, "_query", return_value=None):
            cache = Path(tmp) / "gsi.json"
            self.assertEqual((0, 1), fumi_geo.geocode(spots, cache, 0))
            self.assertEqual({}, json.loads(cache.read_text()))


if __name__ == "__main__":
    unittest.main()
