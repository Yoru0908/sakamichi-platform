#!/usr/bin/env python3
"""同步公开 Google My Maps KML，保留来源 Layer，并生成增量 diff。"""

from __future__ import annotations

import argparse
import hashlib
import html
import json
import re
import sys
import tempfile
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
CONFIG = HERE / "mymaps_sources.json"
OVERRIDES = HERE / "mymaps_overrides.json"
STATE_DIR = ROOT / ".tmp" / "mymaps-sync-state"
KML_NS = "http://www.opengis.net/kml/2.2"
IMAGE_RE = re.compile(r"<img[^>]+src=[\"']([^\"']+)[\"']", re.I)
URL_IMAGE_RE = re.compile(r"https?://[^\s\"'<>]+\.(?:jpe?g|png|gif|webp)(?:\?[^\s\"'<>]*)?", re.I)
TAG_RE = re.compile(r"<[^>]+>")


def load_json(path: Path, default: Any) -> Any:
    if not path.exists():
        return default
    with path.open(encoding="utf-8") as handle:
        return json.load(handle)


def fetch_kml(map_id: str, timeout: int) -> bytes:
    url = f"https://www.google.com/maps/d/kml?mid={map_id}&forcekml=1"
    request = urllib.request.Request(url, headers={"User-Agent": "SakamichiTools My Maps Sync/1.0"})
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            if response.status != 200:
                raise RuntimeError(f"HTTP {response.status}")
            body = response.read()
    except urllib.error.HTTPError as error:
        raise RuntimeError(f"HTTP {error.code}") from error
    except urllib.error.URLError as error:
        raise RuntimeError(f"network error: {error.reason}") from error
    if b"<kml" not in body[:4096].lower():
        preview = body[:160].decode("utf-8", errors="replace").replace("\n", " ")
        raise RuntimeError(f"response is not KML, possibly private/login page: {preview}")
    return body


def text(element: ET.Element | None) -> str:
    return (element.text or "").strip() if element is not None else ""


def child(element: ET.Element, name: str) -> ET.Element | None:
    return element.find(f"{{{KML_NS}}}{name}")


def child_text(element: ET.Element, name: str) -> str:
    return text(child(element, name))


def clean_html(value: str) -> str:
    return re.sub(r"\s+", " ", TAG_RE.sub(" ", html.unescape(value))).strip()


def image_urls(value: str) -> list[str]:
    decoded = html.unescape(value)
    urls = IMAGE_RE.findall(decoded) + URL_IMAGE_RE.findall(decoded)
    return list(dict.fromkeys(urls))


def point(placemark: ET.Element) -> tuple[float, float] | None:
    point_element = child(placemark, "Point")
    coordinates = child_text(point_element, "coordinates") if point_element is not None else ""
    if not coordinates:
        return None
    values = coordinates.split()[0].split(",")
    if len(values) < 2:
        return None
    try:
        return float(values[1]), float(values[0])
    except ValueError:
        return None


def source_key(map_id: str, layer: str, name: str, coordinates: tuple[float, float]) -> str:
    identity = f"{map_id}|{layer.strip()}|{name.strip()}|{coordinates[0]:.5f},{coordinates[1]:.5f}"
    return f"mymaps:{map_id}:{hashlib.sha256(identity.encode()).hexdigest()[:20]}"


def fingerprint(feature: dict[str, Any]) -> str:
    props = feature["properties"]
    stable = {
        "name": props.get("name", ""),
        "note": props.get("sceneNote", ""),
        "layer": props.get("source", {}).get("layer", ""),
        "tags": props.get("source", {}).get("tags", []),
        "imageCount": len(props.get("images", [])),
        "nonMyMapsImages": [
            url for url in props.get("images", [])
            if "mymaps.usercontent.google.com" not in url
        ],
        "classification": props.get("classification", {}),
        "members": props.get("members", []),
        "coordinates": feature["geometry"]["coordinates"],
    }
    payload = json.dumps(stable, ensure_ascii=False, sort_keys=True).encode()
    return hashlib.sha256(payload).hexdigest()


def make_feature(source: dict[str, Any], layer: str, placemark: ET.Element) -> dict[str, Any] | None:
    coordinates = point(placemark)
    if coordinates is None:
        return None
    name = child_text(placemark, "name") or "未命名地点"
    description = child_text(placemark, "description")
    platform = source.get("platform") or {}
    source_id = source_key(source["mapId"], layer, name, coordinates)
    category = platform.get("category") or layer or source.get("label", "")
    subcategory = platform.get("subcategory") or layer
    tags = list(source.get("tags") or [])
    properties = {
        "id": source_id,
        "sourceKey": source_id,
        "name": name,
        "category": category,
        "subcategory": subcategory,
        "categoryColor": platform.get("categoryColor", "#666666"),
        "address": "",
        "sceneTitle": "",
        "sceneNote": clean_html(description),
        "sourceLabel": source.get("label", source.get("provider", "")),
        "sourceUrl": source.get("sourceUrl", ""),
        "referenceUrl": source.get("sourceUrl", ""),
        "tags": tags,
        "images": image_urls(description),
        "members": [],
        "source": {
            "provider": source.get("provider", ""),
            "url": source.get("sourceUrl", ""),
            "mapId": source.get("mapId", ""),
            "layer": layer,
            "tags": tags,
            "name": name,
        },
        "classification": {
            "category": category,
            "subcategory": subcategory,
            "method": "manual" if platform else "source-layer",
            "status": "reviewed" if platform else "unreviewed",
        },
        "classificationCandidates": {"members": [], "projects": [], "contentTypes": []},
    }
    feature = {
        "type": "Feature",
        "geometry": {"type": "Point", "coordinates": [coordinates[1], coordinates[0]]},
        "properties": properties,
    }
    properties["fingerprint"] = fingerprint(feature)
    return feature


def disambiguate_source_keys(features: list[dict[str, Any]]) -> None:
    """Keep IDs unique when a source intentionally contains stacked placemarks."""
    groups: dict[str, list[dict[str, Any]]] = {}
    for feature in features:
        groups.setdefault(feature["properties"]["sourceKey"], []).append(feature)
    for base_key, rows in groups.items():
        if len(rows) < 2:
            continue
        used: set[str] = set()
        for index, feature in enumerate(rows, 1):
            props = feature["properties"]
            identity = json.dumps({
                "note": props.get("sceneNote", ""),
                "images": props.get("images", []),
            }, ensure_ascii=False, sort_keys=True)
            suffix = hashlib.sha256(identity.encode()).hexdigest()[:10]
            candidate = f"{base_key}:{suffix}"
            if candidate in used:
                candidate = f"{candidate}:{index}"
            used.add(candidate)
            props["id"] = candidate
            props["sourceKey"] = candidate


def parse_kml(body: bytes, source: dict[str, Any]) -> tuple[dict[str, Any], list[str]]:
    try:
        root = ET.fromstring(body)
    except ET.ParseError as error:
        raise RuntimeError(f"invalid KML XML: {error}") from error
    features: list[dict[str, Any]] = []
    skipped: list[str] = []

    def walk(element: ET.Element, folders: list[str]) -> None:
        for item in list(element):
            kind = item.tag.rsplit("}", 1)[-1]
            if kind == "Folder":
                name = child_text(item, "name")
                walk(item, folders + ([name] if name else []))
            elif kind == "Placemark":
                layer = "/".join(folders)
                feature = make_feature(source, layer, item)
                if feature:
                    features.append(feature)
                else:
                    skipped.append(f"{layer}/{child_text(item, 'name')}".strip("/"))
            elif kind not in {"name", "description", "Style", "Schema"}:
                walk(item, folders)

    walk(root, [])
    disambiguate_source_keys(features)
    for feature in features:
        feature["properties"]["fingerprint"] = fingerprint(feature)
    return {"type": "FeatureCollection", "features": features}, skipped


def apply_overrides(data: dict[str, Any], overrides: dict[str, Any]) -> None:
    for feature in data["features"]:
        props = feature["properties"]
        override = overrides.get(props.get("sourceKey"))
        if not isinstance(override, dict):
            continue
        classification = props.setdefault("classification", {})
        for field in ("category", "subcategory", "method", "status"):
            if field in override:
                classification[field] = override[field]
        for field in ("category", "subcategory"):
            if field in override:
                props[field] = override[field]
        if "members" in override:
            props["members"] = list(override["members"] or [])
            classification.update(method="manual", status="reviewed")


def diff(previous: dict[str, Any], current: dict[str, Any]) -> dict[str, list[str] | dict[str, int]]:
    old = previous.get("features", {})
    new = {f["properties"]["sourceKey"]: f["properties"]["fingerprint"] for f in current["features"]}
    added = sorted(set(new) - set(old))
    removed = sorted(set(old) - set(new))
    changed = sorted(key for key in set(old) & set(new) if old[key] != new[key])
    return {
        "added": added,
        "changed": changed,
        "removed": removed,
        "counts": {"added": len(added), "changed": len(changed), "removed": len(removed)},
    }


def atomic_write(path: Path, value: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=path.parent, delete=False) as handle:
        json.dump(value, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
        temporary = Path(handle.name)
    temporary.replace(path)


def main() -> int:
    parser = argparse.ArgumentParser(description="同步公开 Google My Maps KML")
    parser.add_argument("--source", help="配置文件 source id")
    parser.add_argument("--map-id", help="一次性同步的 Google My Maps mid")
    parser.add_argument("--name", help="一次性 source 名称")
    parser.add_argument("--output", help="GeoJSON 输出路径")
    parser.add_argument("--state-dir", help="状态目录")
    parser.add_argument("--overrides", help="人工 overrides JSON")
    parser.add_argument("--save-raw", action="store_true")
    parser.add_argument("--raw-dir", help="原始 KML 目录")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--timeout", type=int, default=30)
    args = parser.parse_args()
    try:
        config = load_json(CONFIG, {"sources": []})
        source = next((item for item in config.get("sources", []) if item.get("id") == args.source), None)
        if source is None and args.map_id:
            source = {
                "id": args.name or args.map_id,
                "label": args.name or args.map_id,
                "provider": args.name or "公开 Google My Maps",
                "mapId": args.map_id,
                "sourceUrl": f"https://www.google.com/maps/d/viewer?mid={args.map_id}",
            }
        if source is None:
            raise ValueError("请指定 --source 或 --map-id")
        output = Path(args.output or source.get("output", f".tmp/mymaps-sync/{source['id']}.geojson"))
        if not output.is_absolute():
            output = ROOT / output
        state_dir = Path(args.state_dir) if args.state_dir else STATE_DIR
        if not state_dir.is_absolute():
            state_dir = ROOT / state_dir
        state_path = state_dir / f"{source['id']}.json"
        body = fetch_kml(source["mapId"], args.timeout)
        if args.save_raw:
            raw_dir = Path(args.raw_dir or ".tmp/mymaps-raw")
            if not raw_dir.is_absolute():
                raw_dir = ROOT / raw_dir
            raw_dir.mkdir(parents=True, exist_ok=True)
            (raw_dir / f"{source['id']}.kml").write_bytes(body)
        current, skipped = parse_kml(body, source)
        overrides = load_json(Path(args.overrides) if args.overrides else OVERRIDES, {"overrides": {}})
        apply_overrides(current, overrides.get("overrides", {}))
        for feature in current["features"]:
            feature["properties"]["fingerprint"] = fingerprint(feature)
        previous = load_json(state_path, {})
        report = diff(previous, current)
        print(f"Source: {source.get('label', source['id'])}")
        print(f"Features: added={report['counts']['added']} changed={report['counts']['changed']} removed={report['counts']['removed']}")
        print(f"Skipped non-point placemarks: {len(skipped)}")
        if args.dry_run:
            return 0
        atomic_write(output, current)
        atomic_write(state_path, {
            "sourceId": source["id"],
            "mapId": source["mapId"],
            "featureCount": len(current["features"]),
            "features": {f["properties"]["sourceKey"]: f["properties"]["fingerprint"] for f in current["features"]},
        })
        print(f"Wrote: {output}")
        return 0
    except (OSError, ValueError, RuntimeError, json.JSONDecodeError) as error:
        print(f"sync_mymaps_sources.py: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
