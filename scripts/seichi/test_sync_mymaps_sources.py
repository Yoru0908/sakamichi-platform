import copy
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from sync_mymaps_sources import diff, parse_kml, source_key

SOURCE = {
    "id": "fixture",
    "label": "Fixture Map",
    "provider": "Fixture Author",
    "mapId": "fixture-map",
    "sourceUrl": "https://example.test/map",
    "platform": {"category": "櫻坂46", "subcategory": "Fixture", "categoryColor": "#ff00aa"},
}

KML = '''<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <Folder>
      <name>单曲</name>
      <Folder>
        <name>MV</name>
        <Placemark>
          <name>测试地点</name>
          <description><![CDATA[<p>说明</p><img src="https://img.test/a.jpg">]]></description>
          <Point><coordinates>139.700000,35.600000,0</coordinates></Point>
        </Placemark>
        <Placemark>
          <name>路线</name>
          <LineString><coordinates>139.7,35.6,0 139.8,35.7,0</coordinates></LineString>
        </Placemark>
      </Folder>
    </Folder>
  </Document>
</kml>'''.encode()


class SyncTests(unittest.TestCase):
    def test_layer_point_image_and_unverified_member(self):
        data, skipped = parse_kml(KML, SOURCE)
        self.assertEqual(len(data["features"]), 1)
        self.assertEqual(skipped, ["单曲/MV/路线"])
        props = data["features"][0]["properties"]
        self.assertEqual(props["source"]["layer"], "单曲/MV")
        self.assertEqual(props["classification"]["category"], "櫻坂46")
        self.assertEqual(props["members"], [])
        self.assertEqual(props["images"], ["https://img.test/a.jpg"])

    def test_source_key_is_stable(self):
        first = source_key("map", "Layer", "Name", (35.6, 139.7))
        self.assertEqual(first, source_key("map", "Layer", "Name", (35.6, 139.7)))
        self.assertNotEqual(first, source_key("map", "Layer", "Other", (35.6, 139.7)))

    def test_stacked_placemarks_receive_unique_stable_keys(self):
        duplicate_kml = KML.replace(
            b"</Folder>\n    </Folder>",
            """<Placemark><name>测试地点</name><description>另一条说明</description>
            <Point><coordinates>139.700000,35.600000,0</coordinates></Point></Placemark>
            </Folder>\n    </Folder>""".encode(),
        )
        first, _ = parse_kml(duplicate_kml, SOURCE)
        second, _ = parse_kml(duplicate_kml, SOURCE)
        keys = [row["properties"]["sourceKey"] for row in first["features"]]
        self.assertEqual(len(keys), len(set(keys)))
        self.assertEqual(keys, [row["properties"]["sourceKey"] for row in second["features"]])

    def test_diff(self):
        old, _ = parse_kml(KML, SOURCE)
        current = copy.deepcopy(old)
        current["features"][0]["properties"]["fingerprint"] = "changed"
        current["features"].append(copy.deepcopy(old["features"][0]))
        current["features"][-1]["properties"]["sourceKey"] = "new-key"
        current["features"][-1]["properties"]["fingerprint"] = "new"
        previous = {"features": {
            old["features"][0]["properties"]["sourceKey"]: old["features"][0]["properties"]["fingerprint"],
            "removed-key": "removed",
        }}
        result = diff(previous, current)
        self.assertEqual(result["counts"], {"added": 1, "changed": 1, "removed": 1})


if __name__ == "__main__":
    unittest.main()
