#!/usr/bin/env python3
"""Validate and promote the 清水ひなた public My Maps snapshot.

Legacy production rows do not have stable source keys, so the first promotion
matches them by name, coordinates and description to retain mirrored R2 images.
Future manually curated/non-source rows are preserved outside the managed subset.
"""

from __future__ import annotations

import argparse
import json
import math
import sys
import tempfile
import urllib.parse
from collections import defaultdict
from pathlib import Path
from typing import Any

MAP_ID = "14Otcijw10dc-Fyu1P-q-BygLgiLK2sQ"
KEY_PREFIX = f"mymaps:{MAP_ID}:"
SOURCE_URL = f"https://www.google.com/maps/d/viewer?mid={MAP_ID}"
LABEL = "清水ひなた 日向坂46聖地マイマップ"
R2_HOST = "pub-6d7574c4452b41519ab8adf1541d7f9e.r2.dev"
COLOR = "#5BC2AE"


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


def is_managed(feature: dict[str, Any]) -> bool:
    props = feature.get("properties") or {}
    source = props.get("source") or {}
    key = str(props.get("sourceKey") or props.get("id") or "")
    return (
        key.startswith(KEY_PREFIX)
        or source.get("mapId") == MAP_ID
        or LABEL in str(props.get("sourceLabel") or "")
        or LABEL in str(source.get("provider") or "")
    )


def match_key(feature: dict[str, Any]) -> tuple[str, float, float]:
    props = feature.get("properties") or {}
    lng, lat = coordinates(feature)
    return str(props.get("name", "")).strip(), round(lng, 6), round(lat, 6)


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


def normalise_candidate(
    feature: dict[str, Any],
    previous: dict[str, Any] | None,
) -> tuple[dict[str, Any], int]:
    props = feature.setdefault("properties", {})
    source = props.setdefault("source", {})
    layer = str(source.get("layer") or props.get("category") or "その他").strip()
    key = str(props.get("sourceKey") or "")
    if not key.startswith(KEY_PREFIX) or props.get("id") != key:
        raise ValueError(f"unexpected source key: {key or '<missing>'}")

    source_images = list(props.get("images") or [])
    previous_images = list((previous or {}).get("properties", {}).get("images") or [])
    previous_backed_images = [
        url for url in previous_images
        if R2_HOST in url or url.startswith("/api/proxy-image?url=")
    ]
    direct_images = [
        url for url in source_images
        if "mymaps.usercontent.google.com" not in url
    ]
    google_images = [
        url for url in source_images
        if "mymaps.usercontent.google.com" in url
    ]
    # Google rotates hosted-image URLs. Preserve existing R2/proxy URLs by
    # position so unchanged source data does not produce an empty Git commit.
    retained_backed_images = previous_backed_images[:len(google_images)]
    new_google_images = google_images[len(retained_backed_images):]
    proxied_images = [
        "/api/proxy-image?url=" + urllib.parse.quote(url, safe="")
        for url in new_google_images
    ]
    props["images"] = unique(direct_images + retained_backed_images + proxied_images)
    props.pop("fingerprint", None)

    props["category"] = layer
    props["subcategory"] = layer
    props["categoryColor"] = COLOR
    props["sceneTitle"] = props.get("sceneTitle") or props.get("name", "")
    props["sourceLabel"] = LABEL
    props["sourceUrl"] = SOURCE_URL
    props["referenceUrl"] = SOURCE_URL
    props["tags"] = unique(["日向坂46", layer, *list(props.get("tags") or [])])
    props["members"] = list(props.get("members") or [])
    source.update({
        "provider": LABEL,
        "url": SOURCE_URL,
        "mapId": MAP_ID,
        "layer": layer,
        "tags": props["tags"],
        "name": props.get("name", ""),
        "group": "日向坂46",
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
    return feature, len(proxied_images)


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
    preserved = [feature for feature in current_features if not is_managed(feature)]
    candidate_features = candidate["features"]
    if len(candidate_features) < min_features:
        raise ValueError(f"candidate has only {len(candidate_features)} features; minimum is {min_features}")

    current_by_key: dict[tuple[str, float, float], list[dict[str, Any]]] = defaultdict(list)
    for feature in current_managed:
        current_by_key[match_key(feature)].append(feature)
    used_by_key: dict[tuple[str, float, float], set[int]] = defaultdict(set)

    output_managed: list[dict[str, Any]] = []
    matched = proxied_images = 0
    for feature in candidate_features:
        key = match_key(feature)
        previous = choose_previous(feature, current_by_key.get(key, []), used_by_key[key])
        if previous is not None:
            matched += 1
        normalised, proxied = normalise_candidate(feature, previous)
        output_managed.append(normalised)
        proxied_images += proxied

    additions = len(candidate_features) - matched
    removals = len(current_managed) - matched
    if additions > max_additions:
        raise ValueError(f"refusing {additions} additions; maximum is {max_additions}")
    if removals > max_removals:
        raise ValueError(f"refusing {removals} removals; maximum is {max_removals}")

    source_keys = [str(row.get("properties", {}).get("sourceKey", "")) for row in output_managed]
    if "" in source_keys or len(source_keys) != len(set(source_keys)):
        raise ValueError("candidate contains missing or duplicate sourceKey values")
    for feature in output_managed:
        coordinates(feature)
        for image in feature.get("properties", {}).get("images", []):
            if (
                R2_HOST not in image
                and "img.youtube.com" not in image
                and not image.startswith("/api/proxy-image?url=")
            ):
                raise ValueError(f"unsupported image URL reached production: {image}")

    result = {"type": "FeatureCollection", "features": [*preserved, *output_managed]}
    report = {
        "currentFeatures": len(current_features),
        "preservedNonSourceFeatures": len(preserved),
        "currentSourceFeatures": len(current_managed),
        "candidateFeatures": len(candidate_features),
        "matched": matched,
        "added": additions,
        "removed": removals,
        "newSourceImagesUsingProxy": proxied_images,
        "promotedFeatures": len(result["features"]),
        "status": "validated",
    }
    return result, report


def main() -> int:
    parser = argparse.ArgumentParser(description="校验并发布清水ひなた My Maps 增量")
    parser.add_argument("--current", type=Path, required=True)
    parser.add_argument("--candidate", type=Path, required=True)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--report", type=Path)
    parser.add_argument("--min-features", type=int, default=3500)
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
        print(f"promote_shimizu_hinata.py: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
