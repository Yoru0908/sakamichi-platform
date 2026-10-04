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
    def run_review(self, candidate, current=(), curated=(), overrides=None, answers=None):
        with unittest.mock.patch.object(fumi_review, "jev", return_value={} if answers is None else answers):
            kept, rows = fumi_review.review(collection(*candidate), collection(*current), collection(*curated), overrides or {})
        return [f["properties"]["id"] for f in kept["features"]], {r["key"]: r["decision"] for r in rows}

    def test_coarse_and_position_named_spots_are_published(self):
        town = feature("fumi-article:town", lng=136.0, name="町の店", precision="town")
        named = feature("fumi-article:named", lng=135.0, name="神南一丁目付近")
        named["properties"]["nameSource"] = "position"
        kept, rows = self.run_review([town, named])
        self.assertEqual(["fumi-article:town", "fumi-article:named"], kept)
        self.assertEqual({"fumi-article:town": "published", "fumi-article:named": "published"}, rows)

    def test_same_name_in_one_article_is_skipped_only_when_close(self):
        kept, rows = self.run_review([
            feature("fumi-article:a", address="東京都渋谷区神南9-9-9"),
            feature("fumi-article:twin", lng=139.7001, address="東京都渋谷区神南5-5-5"),
            feature("fumi-article:road", lng=139.75, address="東京都港区芝4-7-4"),
            feature("fumi-article:shop", lng=139.7002, name="隣の店", address="東京都渋谷区神南4-4-4"),
        ])
        self.assertEqual(["fumi-article:a", "fumi-article:road", "fumi-article:shop"], kept)
        self.assertEqual("skipped", rows["fumi-article:twin"])

    def test_revisit_of_another_articles_place_is_published(self):
        other = feature("fumi-article:old", lng=139.7001)
        other["properties"]["sourceUrl"] = "https://fumichen2.livedoor.blog/archives/59000000.html"
        self.assertEqual(["fumi-article:a"], self.run_review([feature("fumi-article:a")], current=[other])[0])

    def test_rekeyed_spot_of_published_article_is_dropped_silently(self):
        old = feature("fumi-article:old", lng=139.9)
        kept, rows = self.run_review([feature("fumi-article:old", lng=139.9), feature("fumi-article:rekeyed", name="再解析")], current=[old])
        self.assertEqual((["fumi-article:old"], {}), (kept, rows))

    def test_curated_neighbour_is_skipped_when_same_place_else_published(self):
        curated = feature("mag2026-rokugo-park", lng=139.70005, name="六郷土手")
        same_name = feature("fumi-article:a", name="六郷土手河川敷")
        jev_same = feature("fumi-article:b", name="別名の場所", address="東京都渋谷区神南2-2-2")
        jev_other = feature("fumi-article:c", name="隣のカフェ", address="東京都渋谷区神南3-3-3")
        for f, url in ((jev_same, "60100001"), (jev_other, "60100002")):
            f["properties"]["sourceUrl"] = URL.replace("60100000", url)
        kept, rows = self.run_review([same_name, jev_same, jev_other], curated=[curated], answers={"d1": {"noul": 0.8}, "d2": {"noul": 0.1}})
        self.assertEqual(["fumi-article:c"], kept)
        self.assertEqual({"fumi-article:a": "skipped", "fumi-article:b": "skipped", "fumi-article:c": "published"}, rows)

    def test_curated_neighbour_waits_when_jev_is_down(self):
        curated = feature("mag2026-x", lng=139.70005, name="全然違う名前")
        with unittest.mock.patch.object(fumi_review, "jev", return_value=None):
            kept, rows = fumi_review.review(collection(feature("fumi-article:a")), collection(), collection(curated), {})
        self.assertEqual(([], "deferred"), (kept["features"], rows[0]["decision"]))

    def test_jev_reclassifies_only_the_rule_fallback(self):
        fallback, ruled = feature("fumi-article:a"), feature("fumi-article:b", lng=135.0)
        fallback["properties"]["subcategory"] = "その他企画"
        ruled["properties"]["sourceUrl"] = URL.replace("60100000", "60100001")
        answer = {"choice": "番組・イベント", "confidence": 0.9}
        with unittest.mock.patch.object(fumi_review, "jev", return_value={"c0": answer, "c1": answer}):
            kept, _ = fumi_review.review(collection(fallback, ruled), collection(), collection(), {})
        self.assertEqual(["番組・イベント", "Vlog・企画"], [f["properties"]["category"] for f in kept["features"]])
        self.assertEqual("jev", kept["features"][0]["properties"]["classification"]["method"])

    def test_overrides_publish_rename_or_skip(self):
        overrides = {"fumi-article:a": {"action": "publish", "name": "正しい名前", "lat": 35.1, "lng": 139.1},
                     "fumi-article:b": {"action": "skip"}}
        kept, rows = self.run_review([feature("fumi-article:a", name=""), feature("fumi-article:b", lng=138.0)], overrides=overrides)
        self.assertEqual((["fumi-article:a"], {}), (kept, rows))

    def test_cli_sends_fyi_once_privately(self):
        with tempfile.TemporaryDirectory() as tmp:
            d = Path(tmp)
            (d / "cand.json").write_text(json.dumps(collection(feature("fumi-article:new", precision="town"))))
            for name in ("cur.json", "cur2.json"):
                (d / name).write_text(json.dumps(collection()))
            (d / "ovr.json").write_text("{}")
            cmd = [sys.executable, str(Path(fumi_review.__file__)), "--candidate", str(d / "cand.json"), "--current", str(d / "cur.json"),
                   "--curated", str(d / "cur2.json"), "--overrides", str(d / "ovr.json"), "--output", str(d / "out.json"),
                   "--report", str(d / "rep.json"), "--state", str(d / "state.json")]
            first = subprocess.run(cmd, capture_output=True, text=True, check=True).stdout
            second = subprocess.run(cmd, capture_output=True, text=True, check=True).stdout
            self.assertIn("【fumi 新地点】已发布 1", first)
            self.assertIn("町名级坐标", first)
            self.assertIn("→ 314389463", first)
            self.assertNotIn("dry-run alert", second)
            self.assertEqual(["fumi-article:new"], [f["properties"]["id"] for f in json.loads((d / "out.json").read_text())["features"]])

    def test_unresolved_spots_from_the_crawl_report_are_listed(self):
        rows = fumi_review.unresolved({"unresolvedSpots": [{"name": "某店", "address": "東京都渋谷区", "articleUrl": URL, "title": "t"}]})
        self.assertEqual(["unresolved:60100000:東京都渋谷区"], [row["key"] for row in rows])
        self.assertIn("查不到坐标", fumi_review.notice(rows))

    def test_network_errors_are_not_cached(self):
        spots = [{"address": "東京都渋谷区神南1-1-1", "lat": None, "lng": None}]
        with tempfile.TemporaryDirectory() as tmp, unittest.mock.patch.object(fumi_geo, "_query", return_value=None):
            cache = Path(tmp) / "gsi.json"
            self.assertEqual((0, 1), fumi_geo.geocode(spots, cache, 0))
            self.assertEqual({}, json.loads(cache.read_text()))


if __name__ == "__main__":
    unittest.main()
