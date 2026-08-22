#!/usr/bin/env python3
"""Validate and promote the staged fumi article supplement.

The crawler emits a complete snapshot of all fumi article features after the
configured cutoff. This promoter replaces only that managed subset while
preserving every My Maps and manually curated feature in the target GeoJSON.
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
SOURCE_URL_PREFIXES = (
    "http://blog.livedoor.jp/fumichen2/archives/",
    "https://blog.livedoor.jp/fumichen2/archives/",
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
    max_removals: int,
) -> tuple[dict[str, Any], dict[str, Any]]:
    current_features = current["features"]
    current_managed = [feature for feature in current_features if is_managed(feature)]
    base = [feature for feature in current_features if not is_managed(feature)]
    candidate_features = candidate["features"]

    if len(candidate_features) < min_features:
        raise ValueError(
            f"fumi candidate has only {len(candidate_features)} features; minimum is {min_features}"
        )

    candidate_keys: list[str] = []
    for feature in candidate_features:
        validate_candidate(feature)
        candidate_keys.append(source_key(feature))
    if len(candidate_keys) != len(set(candidate_keys)):
        raise ValueError("fumi candidate contains duplicate sourceKey values")

    current_by_key = {source_key(feature): feature for feature in current_managed}
    if len(current_by_key) != len(current_managed):
        raise ValueError("current fumi subset contains duplicate sourceKey values")
    candidate_by_key = dict(zip(candidate_keys, candidate_features))

    current_keys = set(current_by_key)
    staged_keys = set(candidate_by_key)
    additions = len(staged_keys - current_keys)
    removals = len(current_keys - staged_keys)
    changed = sum(
        current_by_key[key] != candidate_by_key[key]
        for key in current_keys & staged_keys
    )
    if additions > max_additions:
        raise ValueError(f"refusing {additions} fumi additions; maximum is {max_additions}")
    if removals > max_removals:
        raise ValueError(f"refusing {removals} fumi removals; maximum is {max_removals}")

    output_features = [*base, *candidate_features]
    all_keys = [source_key(feature) for feature in output_features]
    nonempty_keys = [key for key in all_keys if key]
    if len(nonempty_keys) != len(set(nonempty_keys)):
        raise ValueError("promoted GeoJSON would contain duplicate feature IDs")

    result = {"type": "FeatureCollection", "features": output_features}
    report = {
        "currentFeatures": len(current_features),
        "preservedNonFumiFeatures": len(base),
        "currentFumiFeatures": len(current_managed),
        "candidateFumiFeatures": len(candidate_features),
        "added": additions,
        "removed": removals,
        "changed": changed,
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
