#!/usr/bin/env python3
"""为旧版圣巡 GeoJSON 补齐来源字段，不从备注文本推断成员归属。"""

import argparse
import json
import tempfile
from pathlib import Path

CLEAR_MEMBER_FILES = {
    "fumi-sakurazaka.geojson",
    "sakurazaka-all.geojson",
    "keyakizaka-all.geojson",
    "keyaki-hiragana.geojson",
}


def migrate(path: Path) -> tuple[int, int]:
    data = json.loads(path.read_text(encoding="utf-8"))
    changed = 0
    cleared = 0
    for feature in data.get("features", []):
        props = feature.setdefault("properties", {})
        before = json.dumps(props, ensure_ascii=False, sort_keys=True)
        tags = list(props.get("tags") or [])
        props.setdefault("source", {
            "provider": props.get("sourceLabel", "") or "",
            "url": props.get("sourceUrl", "") or props.get("referenceUrl", "") or "",
            "mapId": props.get("sourceMapId", "") or "",
            "layer": props.get("sourceLayer", "") or props.get("category", "") or "",
            "tags": tags,
            "name": props.get("name", "") or "",
        })
        props.setdefault("classification", {
            "category": props.get("category", "") or "",
            "subcategory": props.get("subcategory", "") or "",
            "method": "legacy-import",
            "status": "unreviewed",
        })
        props.setdefault("classificationCandidates", {
            "members": [], "projects": [], "contentTypes": []
        })
        if path.name in CLEAR_MEMBER_FILES and props.get("members"):
            props["members"] = []
            cleared += 1
        props.setdefault("members", [])
        if before != json.dumps(props, ensure_ascii=False, sort_keys=True):
            changed += 1
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=path.parent, delete=False) as handle:
        json.dump(data, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
        temporary = Path(handle.name)
    temporary.replace(path)
    return changed, cleared


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("public_dir", type=Path)
    parser.add_argument("files", nargs="+")
    args = parser.parse_args()
    for filename in args.files:
        changed, cleared = migrate(args.public_dir / filename)
        print(f"{filename}: changed={changed}, cleared_members={cleared}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
