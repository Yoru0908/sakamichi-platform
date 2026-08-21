#!/usr/bin/env python3
import importlib.util
import sys
import unittest
from pathlib import Path

MODULE_PATH = Path(__file__).with_name("sync_fumi_articles.py")
SPEC = importlib.util.spec_from_file_location("sync_fumi_articles", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


class SyncFumiArticlesTest(unittest.TestCase):
    def article(self):
        return MODULE.Article(
            59716400,
            "http://blog.livedoor.jp/fumichen2/archives/59716400.html",
            "櫻坂46「光源」PV撮影場所",
            ("山川宇衣",),
        )

    def test_article_tags_do_not_include_sidebar_tag_cloud(self):
        html = """
        <h2 class="article-title">櫻坂46「光源」PV撮影場所</h2>
        <div class="article-body"><dl class="article-tags">
          <a href="/fumichen2/tag/櫻坂46">櫻坂46</a>
        </dl><div class="article-body-inner">FIKA Lounge 南行徳<br>
        〒272-0142 千葉県市川市欠真間2-16-12 つくば5号館</div></div>
        <aside class="tagcloud"><a href="/fumichen2/tag/乃木坂46">乃木坂46</a>
          <a href="/fumichen2/tag/佐藤愛桜">佐藤愛桜</a></aside>
        """
        rows = MODULE.parse_locations(self.article(), html)
        self.assertEqual(1, len(rows))
        self.assertEqual(["櫻坂46", "山川宇衣", "四期生"], rows[0]["tags"])
        self.assertEqual(["山川宇衣"], rows[0]["members"])

    def test_coordinate_is_attached_to_the_address_before_it(self):
        html = """
        <h2 class="article-title">櫻坂46「光源」PV撮影場所</h2>
        <div class="article-body">
          <div class="article-body-inner">
            FIKA Lounge 南行徳<br>〒272-0142 千葉県市川市欠真間2-16-12 つくば5号館<br>
            東京電力パワーグリッド株式会社行徳変電所<br>
            〒272-0142 千葉県市川市欠真間2-5-12<br>座標: 35.678231, 139.904897<br>
            JFE条鋼株式会社鹿島製造所<br>〒314-0111 茨城県神栖市南浜7
          </div>
          <dl class="article-tags"><a href="/tag/櫻坂46">櫻坂46</a></dl>
        </div>
        """
        rows = MODULE.parse_locations(self.article(), html)
        self.assertEqual(3, len(rows))
        self.assertIsNone(rows[0]["lat"])
        self.assertEqual((35.678231, 139.904897), (rows[1]["lat"], rows[1]["lng"]))
        self.assertIsNone(rows[2]["lat"])
        self.assertEqual("東京電力パワーグリッド株式会社行徳変電所", rows[1]["name"])

    def test_address_parser_rejects_prefecture_words_in_sentences(self):
        self.assertIsNone(MODULE.clean_address("クイズに正解して栃木県クイズへ"))
        self.assertIsNone(MODULE.clean_address("滋賀県、セーフ"))
        self.assertEqual(
            "神奈川県三浦市三崎3-12-10",
            MODULE.clean_address("3204 bread&gelato 神奈川県三浦市三崎3-12-10"),
        )
        self.assertEqual("熱海市田原本町5-5", MODULE.clean_address("〒4130011 熱海市田原本町5-5"))

    def test_private_home_is_excluded(self):
        html = """
        <h2 class="article-title">blog写真撮影場所</h2>
        <div class="article-body"><div class="article-body-inner">
          soy casa<br>〒100-0001 東京都千代田区千代田1-1<br>※個人宅なので訪問しないでください
        </div></div>
        """
        self.assertEqual([], MODULE.parse_locations(self.article(), html))

    def test_merge_replaces_previous_article_sync_features(self):
        legacy = {"type": "Feature", "geometry": {"type": "Point", "coordinates": [1, 2]},
                  "properties": {"id": "legacy"}}
        stale = {"type": "Feature", "geometry": {"type": "Point", "coordinates": [3, 4]},
                 "properties": {"id": "fumi-article:stale", "sourceKey": "fumi-article:stale"}}
        fresh = {"type": "Feature", "geometry": {"type": "Point", "coordinates": [5, 6]},
                 "properties": {"id": "fumi-article:fresh", "sourceKey": "fumi-article:fresh", "sourceUrl": "u"}}
        merged = MODULE.merge_features({"type": "FeatureCollection", "features": [legacy, stale]}, [fresh])
        self.assertEqual(["legacy", "fumi-article:fresh"], [x["properties"]["id"] for x in merged["features"]])


if __name__ == "__main__":
    unittest.main()
