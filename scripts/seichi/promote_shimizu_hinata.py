#!/usr/bin/env python3
"""Validate and promote the 清水ひなた public My Maps snapshot.

Source keys are content hashes, not stable placemark IDs. Reconcile exact scenes
and evidence-backed renames, retain deletions/moves for review, and drain safe
additions within a per-run limit. Non-source rows and mirrored images survive.
"""

from __future__ import annotations

import argparse
import copy
import json
import math
import sys
import tempfile
import urllib.parse
from collections import defaultdict
from datetime import datetime, timezone
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

    # Never mutate caller snapshots: dry runs and repeated reconciliation must agree.
    candidate_features = copy.deepcopy(candidate_features)
    incoming_keys = [str(f.get("properties", {}).get("sourceKey", "")) for f in candidate_features]
    if "" in incoming_keys or len(incoming_keys) != len(set(incoming_keys)):
        raise ValueError("candidate contains missing or duplicate sourceKey values")
    for row, key in zip(candidate_features, incoming_keys):
        source = row.get("properties", {}).get("source", {})
        if not key.startswith(KEY_PREFIX) or source.get("mapId") != MAP_ID:
            raise ValueError("candidate has unexpected source identity")
    if max_additions < 1 or max_removals < 0:
        raise ValueError("max-additions must be positive and max-removals non-negative")
    # The source's KML exports no stable placemark identifier. Its sourceKey is
    # content-derived, so it cannot prove that a moved/renamed row is a new place.
    def props(row):
        return row.get("properties", {})

    def layer(row):
        return props(row).get("source", {}).get("layer") or props(row).get("category", "")

    def note(row):
        return str(props(row).get("sceneNote", "")).strip()

    def describe(row):
        return {"sourceKey": props(row).get("sourceKey", props(row).get("id")),
                "name": props(row).get("name"), "coordinates": list(coordinates(row)),
                "layer": layer(row), "sceneNote": note(row)}

    old_by_exact = defaultdict(list)
    for i, row in enumerate(current_managed):
        old_by_exact[match_key(row)].append(i)
    used = set()
    matches = {}
    # Match unchanged rows first, before identifying changed rows. This avoids
    # stealing an old row from an exact match later in the source ordering.
    for j, row in enumerate(candidate_features):
        choices = [i for i in old_by_exact[match_key(row)] if i not in used
                   and note(current_managed[i]) == note(row)]
        choices.sort(key=lambda i: layer(current_managed[i]) != layer(row))
        if choices:
            matches[j] = choices[0]
            used.add(choices[0])
    # Description edits may reuse an exact place only after all exact scene
    # matches have claimed their row. New scenes cannot steal older scene IDs.
    remaining_by_exact = defaultdict(list)
    for j, row in enumerate(candidate_features):
        if j not in matches:
            remaining_by_exact[match_key(row)].append(j)
    for key, incoming in remaining_by_exact.items():
        choices = [i for i in old_by_exact[key] if i not in used]
        if len(incoming) == 1 and len(choices) == 1:
            matches[incoming[0]] = choices[0]
            used.add(choices[0])

    # Per-run additions may drain a backlog only while the source is recognisably
    # the same map. A replacement/truncated feed must not creep into production.
    if len(current_managed) >= 100 and len(matches) < len(current_managed) * 0.9:
        raise ValueError("source continuity below 90%; refusing bulk source replacement")
    unmatched = [j for j in range(len(candidate_features)) if j not in matches]
    possible = {}
    for j in unmatched:
        row = candidate_features[j]
        possible[j] = [i for i, old in enumerate(current_managed) if i not in used
                       and layer(old) == layer(row)
                       and (props(old).get("name") == props(row).get("name")
                            or coordinates(old) == coordinates(row)
                            or (note(old) and note(old) == note(row)))]
    reverse = defaultdict(list)
    for j, choices in possible.items():
        for i in choices:
            reverse[i].append(j)

    output_managed = []
    review = []
    deferred_rows = []
    matched = len(matches)
    renamed = moved = additions = deferred = proxied_images = 0
    for j, feature in enumerate(candidate_features):
        previous = current_managed[matches[j]] if j in matches else None
        if previous is None and possible.get(j):
            choices = possible[j]
            old = current_managed[choices[0]]
            unambiguous = len(choices) == 1 and len(reverse[choices[0]]) == 1
            if (unambiguous and coordinates(old) == coordinates(feature)
                    and note(old) and note(old) == note(feature)):
                previous = old
                used.add(choices[0])
                matched += 1
                renamed += 1
            else:
                moved += int(unambiguous and coordinates(old) != coordinates(feature))
                review.append({"reason": "source-change-needs-review",
                               "candidate": describe(feature),
                               "previous": [describe(current_managed[i]) for i in choices]})
                continue
        if previous is None:
            # Limit writes per run, not total backlog size: a healthy source
            # catches up over successive runs without disabling the guard.
            if additions >= max_additions:
                deferred += 1
                deferred_rows.append(describe(feature))
                continue
            additions += 1
        normalised, proxied = normalise_candidate(feature, previous)
        # Public IDs are referenced by shared routes/bookmarks. Keep identity
        # across a confirmed rename while recording the new sourceKey honestly.
        if previous is not None:
            normalised["properties"]["id"] = props(previous).get("id", props(normalised)["id"])
        output_managed.append(normalised)
        proxied_images += proxied

    retained = [row for i, row in enumerate(current_managed) if i not in used]
    for i, row in enumerate(current_managed):
        if i not in used and not reverse.get(i):
            review.append({"reason": "source-missing-needs-review", "previous": [describe(row)]})
    # Source deletion is never automatically approved. max_removals remains
    # accepted for runner compatibility; actual removals are always zero.
    removals = 0
    output_managed.extend(copy.deepcopy(retained))

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
        "renamed": renamed,
        "coordinateChangesHeld": moved,
        "retainedPendingReview": len(retained),
        "deferredAdditions": deferred,
        "deferredAdds": deferred_rows,
        "review": review,
        "removalPolicy": "retain-until-reviewed",
        "newSourceImagesUsingProxy": proxied_images,
        "promotedFeatures": len(result["features"]),
        "status": "validated-with-pending" if review or deferred else "validated",
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
        report["validatedAt"] = datetime.now(timezone.utc).isoformat()
        report["stage"] = "promote"
        if not args.dry_run:
            atomic_write(args.output or args.current, result)
        if args.report:
            atomic_write(args.report, report)
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return 0
    except (OSError, ValueError, json.JSONDecodeError) as error:
        if args.report:
            atomic_write(args.report, {"status": "failed", "stage": "promote",
                                      "failedAt": datetime.now(timezone.utc).isoformat(),
                                      "error": str(error)})
        print(f"promote_shimizu_hinata.py: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
