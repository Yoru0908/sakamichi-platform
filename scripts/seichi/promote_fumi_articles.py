#!/usr/bin/env python3
"""Validate and append newly reviewed fumi article points to the combined map.

The crawler only emits articles newer than fumi_baseline.json, fumi_review.py holds
back spots that need a human, and this promoter appends the remaining new keys.
Published points (every My Maps, curated and earlier fumi feature) are never changed.
"""

from __future__ import annotations

import argparse
import json
import math
import sys
import tempfile
from pathlib import Path
from typing import Any

PREFIX = "fumi-article:"
PROVIDER = "fumi Diary 2号店"
# fumi's blog moved from blog.livedoor.jp/fumichen2 to fumichen2.livedoor.blog (old URLs 301 there) around
# 2026-09-10; both forms are the same articles (ids come from the article number, so no duplicates).
SOURCE_URL_PREFIXES = (
    "http://blog.livedoor.jp/fumichen2/archives/",
    "https://blog.livedoor.jp/fumichen2/archives/",
    "http://fumichen2.livedoor.blog/archives/",
    "https://fumichen2.livedoor.blog/archives/",
)


def load(path: Path) -> dict[str, Any]:
    with path.open(encoding="utf-8") as handle:
        data = json.load(handle)
    if data.get("type") != "FeatureCollection" or not isinstance(data.get("features"), list):
        raise ValueError(f"{path} is not a GeoJSON FeatureCollection")
    return data


def atomic_write(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=path.parent, delete=False) as handle:
        json.dump(value, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
        temporary = Path(handle.name)
    temporary.replace(path)


def source_key(feature: dict[str, Any]) -> str:
    props = feature.get("properties") or {}
    return str(props.get("sourceKey") or props.get("id") or "")


def is_managed(feature: dict[str, Any]) -> bool:
    return source_key(feature).startswith(PREFIX)


def validate_coordinates(feature: dict[str, Any]) -> None:
    geometry = feature.get("geometry") or {}
    values = geometry.get("coordinates") or []
    if geometry.get("type") != "Point" or len(values) < 2:
        raise ValueError("fumi candidate contains a non-Point feature")
    lng, lat = float(values[0]), float(values[1])
    if not math.isfinite(lng) or not math.isfinite(lat):
        raise ValueError(f"invalid coordinates: {values}")
    if not (-180 <= lng <= 180 and -90 <= lat <= 90):
        raise ValueError(f"coordinates outside WGS84 bounds: {values}")


def validate_candidate(feature: dict[str, Any]) -> None:
    key = source_key(feature)
    props = feature.get("properties") or {}
    if not key.startswith(PREFIX):
        raise ValueError(f"candidate contains an unmanaged feature: {key or '<missing key>'}")
    if props.get("id") != key or props.get("sourceKey") != key:
        raise ValueError(f"candidate id/sourceKey mismatch: {key}")
    if props.get("sourceLabel") != PROVIDER:
        raise ValueError(f"unexpected fumi source label: {props.get('sourceLabel')}")
    source_url = str(props.get("sourceUrl") or "")
    if not source_url.startswith(SOURCE_URL_PREFIXES):
        raise ValueError(f"unexpected fumi source URL: {source_url}")
    validate_coordinates(feature)


def promote(
    current: dict[str, Any],
    candidate: dict[str, Any],
    *,
    min_features: int,
    max_additions: int,
    max_removals: int = 0,
) -> tuple[dict[str, Any], dict[str, Any]]:
    """Append-only: published fumi points are history and are never replaced or removed (2026-10-04 decision —
    articles up to fumi_baseline.json are final; later fixes go through fumi_overrides.json). Only candidate keys
    that are not published yet are added. `max_removals` is kept for CLI compatibility; nothing is removed."""
    current_features = current["features"]
    current_managed = [feature for feature in current_features if is_managed(feature)]
    if len(current_managed) < min_features:
        raise ValueError(
            f"current fumi subset has only {len(current_managed)} features; minimum is {min_features}"
        )

    candidate_keys: list[str] = []
    for feature in candidate["features"]:
        validate_candidate(feature)
        candidate_keys.append(source_key(feature))
    if len(candidate_keys) != len(set(candidate_keys)):
        raise ValueError("fumi candidate contains duplicate sourceKey values")

    current_keys = {source_key(feature) for feature in current_managed}
    if len(current_keys) != len(current_managed):
        raise ValueError("current fumi subset contains duplicate sourceKey values")
    additions = [feature for feature in candidate["features"] if source_key(feature) not in current_keys]
    if len(additions) > max_additions:
        raise ValueError(f"refusing {len(additions)} fumi additions; maximum is {max_additions}")

    output_features = [*current_features, *additions]
    nonempty_keys = [key for key in map(source_key, output_features) if key]
    if len(nonempty_keys) != len(set(nonempty_keys)):
        raise ValueError("promoted GeoJSON would contain duplicate feature IDs")

    result = {"type": "FeatureCollection", "features": output_features}
    report = {
        "currentFeatures": len(current_features),
        "currentFumiFeatures": len(current_managed),
        "candidateFumiFeatures": len(candidate["features"]),
        "added": len(additions),
        "removed": 0,
        "alreadyPublished": len(candidate["features"]) - len(additions),
        "promotedFeatures": len(output_features),
        "status": "validated",
    }
    return result, report


def main() -> int:
    parser = argparse.ArgumentParser(description="校验并发布 fumi 文章圣巡增量")
    parser.add_argument("--current", type=Path, required=True)
    parser.add_argument("--candidate", type=Path, required=True)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--report", type=Path)
    parser.add_argument("--min-features", type=int, default=700)
    parser.add_argument("--max-additions", type=int, default=50)
    parser.add_argument("--max-removals", type=int, default=10)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    try:
        result, report = promote(
            load(args.current),
            load(args.candidate),
            min_features=args.min_features,
            max_additions=args.max_additions,
            max_removals=args.max_removals,
        )
        if not args.dry_run:
            atomic_write(args.output or args.current, result)
        if args.report:
            atomic_write(args.report, report)
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return 0
    except (OSError, ValueError, json.JSONDecodeError) as error:
        print(f"promote_fumi_articles.py: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
