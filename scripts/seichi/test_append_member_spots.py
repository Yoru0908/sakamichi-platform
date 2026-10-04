#!/usr/bin/env python3
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import append_member_spots as A  # noqa: E402


def feature(fid, article, members=("山川宇衣",)):
    return {"type": "Feature", "geometry": {"type": "Point", "coordinates": [139.7, 35.6]},
            "properties": {"id": fid, "name": fid, "members": list(members),
                           "sourceUrl": f"https://fumichen2.livedoor.blog/archives/{article}.html"}}


def collection(*features):
    return {"type": "FeatureCollection", "features": list(features)}


class AppendMemberSpotsTest(unittest.TestCase):
    def test_only_new_member_spots_of_uncited_articles_are_appended_once(self):
        curated = collection(feature("hand-made", 300))
        combined = collection(
            feature("fumi-article:new", 200),
            feature("fumi-article:old", 100),
            feature("fumi-article:other-member", 200, members=("村井優",)),
            feature("fumi-article:cited", 300),
            feature("my-maps-point", 200),
        )
        self.assertEqual(["fumi-article:new"], [f["properties"]["id"] for f in A.append(curated, combined, "山川宇衣", 150)])
        self.assertEqual([], A.append(curated, combined, "山川宇衣", 150))
        self.assertEqual(2, len(curated["features"]))

    def test_appended_points_do_not_block_later_spots_of_their_article(self):
        curated = collection(feature("fumi-article:a", 200))
        added = A.append(curated, collection(feature("fumi-article:a", 200), feature("fumi-article:b", 200)), "山川宇衣", 150)
        self.assertEqual(["fumi-article:b"], [f["properties"]["id"] for f in added])


if __name__ == "__main__":
    unittest.main()
