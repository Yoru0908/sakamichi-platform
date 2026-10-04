#!/usr/bin/env python3
"""Append a member's newly crawled fumi spots from the combined map to her curated map (山川宇衣 → yamakawa-ui.geojson).

Every consumer of the curated map (46log, sakamichi-seichi, yamakawaui) then shows the same points without its own merge
logic. Append-only and idempotent: a spot is added when it is a `fumi-article:` point of the member, its article is newer
than fumi_baseline.json, its id is not in the curated map yet, and no hand-made point cites the same article (hand-made
points of an article win, as in yamakawaui's mergeCrawled). publish_yamakawa_ui.py (seichi-maps) keeps these points
when it rebuilds the curated map from yamakawa-ui-scenes.json.
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Any

PREFIX = "fumi-article:"


def articles(feature: dict[str, Any]) -> list[int]:
    return [int(m) for m in re.findall(r"archives/(\d+)", json.dumps(feature["properties"], ensure_ascii=False))]


def append(curated: dict[str, Any], combined: dict[str, Any], member: str, baseline: int) -> list[dict[str, Any]]:
    ids = {f["properties"].get("id") for f in curated["features"]}
    cited = {a for f in curated["features"] if not str(f["properties"].get("id", "")).startswith(PREFIX) for a in articles(f)}
    added = [f for f in combined["features"]
             if str(f["properties"].get("id", "")).startswith(PREFIX) and member in (f["properties"].get("members") or [])
             and f["properties"]["id"] not in ids and articles(f) and articles(f)[0] > baseline and articles(f)[0] not in cited]
    curated["features"].extend(added)
    return added


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--combined", type=Path, required=True)
    parser.add_argument("--curated", type=Path, required=True)
    parser.add_argument("--baseline", type=Path, required=True)
    parser.add_argument("--member", default="山川宇衣")
    args = parser.parse_args()
    curated = json.loads(args.curated.read_text(encoding="utf-8"))
    combined = json.loads(args.combined.read_text(encoding="utf-8"))
    baseline = int(json.loads(args.baseline.read_text(encoding="utf-8"))["articleId"])
    added = append(curated, combined, args.member, baseline)
    if added:
        tmp = args.curated.with_suffix(".tmp")
        tmp.write_text(json.dumps(curated, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        tmp.replace(args.curated)
    print(json.dumps({"member": args.member, "added": [f["properties"]["name"] for f in added], "curated": len(curated["features"])}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
