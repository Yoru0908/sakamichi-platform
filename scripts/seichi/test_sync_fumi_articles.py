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
from fumi_names import clean_address  # noqa: E402  (module dir is on sys.path once MODULE is loaded)


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
        self.assertIsNone(clean_address("クイズに正解して栃木県クイズへ"))
        self.assertIsNone(clean_address("滋賀県、セーフ"))
        self.assertEqual(
            "神奈川県三浦市三崎3-12-10",
            clean_address("3204 bread&gelato 神奈川県三浦市三崎3-12-10"),
        )
        self.assertEqual("熱海市田原本町5-5", clean_address("〒4130011 熱海市田原本町5-5"))

    def test_classification_uses_source_channel_and_normalizes_publication(self):
        self.assertEqual(
            ("Vlog・企画", "櫻坂チャンネル"),
            MODULE.classify("2026.01.01 櫻坂46 山川宇衣 キャンプへ!", ["櫻坂チャンネル"]),
        )
        self.assertEqual(
            ("番組・イベント", "THE TIME,"),
            MODULE.classify("2024.07.19 櫻坂46 松田里奈「THE TIME,」出張リポート"),
        )
        self.assertEqual(
            ("雑誌・グラビア", "週刊少年マガジン 2026 No.22+23"),
            MODULE.classify("櫻坂46 山川宇衣 週刊少年マガジン 2026 No.22+23 写真撮影場所"),
        )

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


    def parse_body(self, body):
        html = f'<h2 class="article-title">櫻坂46 山川宇衣 Vlog撮影場所</h2><div class="article-body"><div class="article-body-inner">{body}</div></div>'
        return [(row["name"], row["address"], row["lat"]) for row in MODULE.parse_locations(self.article(), html)]

    # Layouts below are taken from real fumi articles (full-corpus run over ~370 articles, 2026-10-04).
    def test_a_place_line_between_address_and_coordinate_owns_the_coordinate(self):
        rows = self.parse_body("ビックカメラ有楽町店<br>https://www.biccamera.com/<br>〒100-0006 東京都千代田区有楽町1-11-1<br>"
                               "そして、恵比寿ガーデンプレイスに来ました。<br>YEBISU BAR STAND前<br>座標: 35.643007, 139.712809")
        self.assertEqual([("ビックカメラ有楽町店", "東京都千代田区有楽町1-11-1", None), ("YEBISU BAR STAND前", "", 35.643007)], rows)

    def test_arrival_narration_moves_the_coordinate_to_the_new_place(self):
        rows = self.parse_body("AUBREY HOUSE 渋谷青山店<br>〒150-0002 東京都渋谷区渋谷2-11-14<br>10:00 AM<br>"
                               "代々木公園に到着しました。<br>座標: 35.672120, 139.693177")
        self.assertEqual([("AUBREY HOUSE 渋谷青山店", "東京都渋谷区渋谷2-11-14", None), ("代々木公園", "", 35.67212)], rows)

    def test_remarks_between_address_and_coordinate_keep_the_pair(self):
        rows = self.parse_body("福浦橋<br>〒981-0213 宮城県宮城郡松島町松島字仙随39-1<br>渡った先にもちょっと島があります。<br>座標: 38.369864, 141.068364")
        self.assertEqual([("福浦橋", "宮城県宮城郡松島町松島字仙随39-1", 38.369864)], rows)

    def test_name_with_a_remark_after_the_comma(self):
        rows = self.parse_body("六郷水門付近の建築物、Google Mapで情報がありません。<br>〒144-0045 東京都大田区南六郷2丁目35<br>座標: 35.544353, 139.723105")
        self.assertEqual("六郷水門付近の建築物", rows[0][0])

    def test_no_title_fallback_and_no_sentence_or_profile_names(self):
        rows = self.parse_body("立教大学2年生、19歳<br>今日は友達とご飯を食べました。<br>座標: 38.260646, 140.881072")
        self.assertEqual([("", "", 38.260646)], rows)

    def test_overseas_address_line_is_not_a_name(self):
        rows = self.parse_body("建成公園<br>103 台北市大同區承德路二段35號<br>座標: 25.054883, 121.519511")
        self.assertEqual("建成公園", rows[0][0])

    def test_link_split_name_is_joined(self):
        rows = self.parse_body("橫濱媽祖廟<br>前 / 南門シルクロード<br>https://www.yokohama-masobyo.jp/<br>〒231-0023 神奈川県横浜市中区山下町136<br>座標: 35.442152, 139.647910")
        self.assertEqual("橫濱媽祖廟前 / 南門シルクロード", rows[0][0])

    def test_repeated_lines_keep_their_own_coordinates(self):
        rows = self.parse_body("道標<br>座標: 38.368249, 141.059300<br>道標<br>座標: 38.368408, 141.059567")
        self.assertEqual([("道標", "", 38.368249), ("道標", "", 38.368408)], rows)

    def test_gsi_precision(self):
        geo = importlib.import_module("fumi_geo")
        self.assertEqual("town", geo.precision("青森県十和田市奥瀬"))
        self.assertEqual("lot", geo.precision("千葉県富津市上６４８番地"))

if __name__ == "__main__":
    unittest.main()
