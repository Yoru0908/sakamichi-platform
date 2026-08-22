#!/usr/bin/env python3
"""Validate and promote the staged overseas My Maps GeoJSON.

The source KML may contain Google-hosted images that cannot be safely hotlinked.
For unchanged placemarks this promoter retains the already mirrored R2 images;
new source images are reported and omitted until they are mirrored separately.
"""

from __future__ import annotations

import argparse
import json
import math
import tempfile
import urllib.parse
from collections import defaultdict
from pathlib import Path
from typing import Any

R2_HOST = "pub-6d7574c4452b41519ab8adf1541d7f9e.r2.dev"
SOURCE_URL = "https://www.google.com/maps/d/viewer?mid=16UuI7FsZ44eye0vxkXhEnBNu44I2NqE"
PROVIDER = "FULL of Sakurazaka46 OVERSEA Map"
COLOR = "#3b82f6"


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


def unique(values: list[str]) -> list[str]:
    return list(dict.fromkeys(value for value in values if value))


def coordinates(feature: dict[str, Any]) -> tuple[float, float]:
    geometry = feature.get("geometry") or {}
    values = geometry.get("coordinates") or []
    if geometry.get("type") != "Point" or len(values) < 2:
        raise ValueError("only Point features are supported")
    lng, lat = float(values[0]), float(values[1])
    if not math.isfinite(lng) or not math.isfinite(lat) or not (-180 <= lng <= 180 and -90 <= lat <= 90):
        raise ValueError(f"invalid coordinates: {values}")
    return lng, lat


def match_key(feature: dict[str, Any]) -> tuple[str, float, float]:
    props = feature.get("properties") or {}
    lng, lat = coordinates(feature)
    return str(props.get("name", "")).strip(), round(lng, 6), round(lat, 6)


def source_layer(feature: dict[str, Any]) -> str:
    props = feature.get("properties") or {}
    return str((props.get("source") or {}).get("layer") or props.get("category") or "海外").strip()


def normalise_candidate(
    feature: dict[str, Any],
    previous: dict[str, Any] | None,
) -> tuple[dict[str, Any], int]:
    props = feature.setdefault("properties", {})
    layer = source_layer(feature)
    source_images = list(props.get("images") or [])
    previous_images = list((previous or {}).get("properties", {}).get("images") or [])
    retained_images = [url for url in previous_images if R2_HOST in url]
    direct_r2_images = [url for url in source_images if R2_HOST in url]
    source_non_r2 = [url for url in source_images if R2_HOST not in url]
    # Existing images stay on R2. Newly introduced My Maps images use the
    # same-origin proxy until the next optional R2 mirror pass.
    new_source_images = source_non_r2[len(retained_images):]
    proxied_images = [
        "/api/proxy-image?url=" + urllib.parse.quote(url, safe="")
        for url in new_source_images
    ]
    props["images"] = unique(retained_images + direct_r2_images + proxied_images)
    proxied = len(proxied_images)
    props.pop("fingerprint", None)

    props["category"] = layer
    props["subcategory"] = layer
    props["categoryColor"] = COLOR
    props["sceneTitle"] = props.get("sceneTitle") or props.get("name", "")
    props["sourceLabel"] = PROVIDER
    props["sourceUrl"] = SOURCE_URL
    props["referenceUrl"] = SOURCE_URL
    props["tags"] = unique(["海外", layer, *list(props.get("tags") or [])])
    props["members"] = list(props.get("members") or [])
    source = props.setdefault("source", {})
    source.update({
        "provider": PROVIDER,
        "url": SOURCE_URL,
        "mapId": "16UuI7FsZ44eye0vxkXhEnBNu44I2NqE",
        "layer": layer,
        "tags": props["tags"],
        "name": props.get("name", ""),
    })
    props["classification"] = {
        "category": layer,
        "subcategory": layer,
        "method": "source-layer",
        "status": "source",
    }
    props.setdefault("classificationCandidates", {
        "members": [], "projects": [], "contentTypes": [],
    })
    return feature, proxied


def choose_previous(
    candidate: dict[str, Any],
    rows: list[dict[str, Any]],
    used: set[int],
) -> dict[str, Any] | None:
    note = str(candidate.get("properties", {}).get("sceneNote", ""))
    for index, row in enumerate(rows):
        if index not in used and str(row.get("properties", {}).get("sceneNote", "")) == note:
            used.add(index)
            return row
    for index, row in enumerate(rows):
        if index not in used:
            used.add(index)
            return row
    return None


def promote(
    current: dict[str, Any],
    candidate: dict[str, Any],
    *,
    min_features: int,
    max_additions: int,
    max_removals: int,
) -> tuple[dict[str, Any], dict[str, Any]]:
    current_features = current["features"]
    candidate_features = candidate["features"]
    if len(candidate_features) < min_features:
        raise ValueError(f"candidate has only {len(candidate_features)} features; minimum is {min_features}")

    current_by_key: dict[tuple[str, float, float], list[dict[str, Any]]] = defaultdict(list)
    for feature in current_features:
        current_by_key[match_key(feature)].append(feature)
    used_by_key: dict[tuple[str, float, float], set[int]] = defaultdict(set)

    output_features: list[dict[str, Any]] = []
    matched = proxied_images = 0
    candidate_keys: list[tuple[str, float, float]] = []
    for feature in candidate_features:
        key = match_key(feature)
        candidate_keys.append(key)
        previous = choose_previous(feature, current_by_key.get(key, []), used_by_key[key])
        if previous is not None:
            matched += 1
        normalised, proxied = normalise_candidate(feature, previous)
        proxied_images += proxied
        output_features.append(normalised)

    additions = len(candidate_features) - matched
    removals = len(current_features) - matched
    if additions > max_additions:
        raise ValueError(f"refusing {additions} additions; maximum is {max_additions}")
    if removals > max_removals:
        raise ValueError(f"refusing {removals} removals; maximum is {max_removals}")

    source_keys = [str(row.get("properties", {}).get("sourceKey", "")) for row in output_features]
    if "" in source_keys or len(source_keys) != len(set(source_keys)):
        raise ValueError("candidate contains missing or duplicate sourceKey values")
    for feature in output_features:
        coordinates(feature)
        for image in feature.get("properties", {}).get("images", []):
            if R2_HOST not in image and not image.startswith("/api/proxy-image?url="):
                raise ValueError(f"unsupported image URL reached production: {image}")

    result = {"type": "FeatureCollection", "features": output_features}
    report = {
        "currentFeatures": len(current_features),
        "candidateFeatures": len(candidate_features),
        "matched": matched,
        "added": additions,
        "removed": removals,
        "newSourceImagesUsingProxy": proxied_images,
        "status": "validated",
    }
    return result, report


def main() -> int:
    parser = argparse.ArgumentParser(description="校验并发布海外 My Maps 增量")
    parser.add_argument("--current", type=Path, required=True)
    parser.add_argument("--candidate", type=Path, required=True)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--report", type=Path)
    parser.add_argument("--min-features", type=int, default=100)
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
        print(f"promote_oversea_mymaps.py: {error}", file=__import__("sys").stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
