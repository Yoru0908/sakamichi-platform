#!/usr/bin/env python3
"""GSI address geocoding for the fumi crawler, recording how precise each hit is.

GSI falls back to the town when it cannot place the lot: 「青森県十和田市奥瀬蔦野湯1」 returns 「青森県十和田市奥瀬」,
7 km from 蔦温泉. A hit whose matched title has no number is therefore only town-level ("town") and must not be
published as a pin without a human check; a hit that matched a lot/block number is "lot".
"""

from __future__ import annotations

import json
import re
import tempfile
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

GSI_URL = "https://msearch.gsi.go.jp/address-search/AddressSearch?q="


def precision(title: str) -> str:
    return "lot" if re.search(r"\d", unicodedata.normalize("NFKC", title or "")) else "town"


def _load(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    with path.open(encoding="utf-8") as handle:
        return json.load(handle)


def _save(path: Path, value: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=path.parent, delete=False) as handle:
        json.dump(value, handle, ensure_ascii=False, indent=2)
        temporary = Path(handle.name)
    temporary.replace(path)


def _query(address: str) -> dict[str, Any] | bool | None:
    """Hit → dict; GSI has no match → False (cached); network/parse error → None (not cached, retried next run)."""
    request = urllib.request.Request(GSI_URL + urllib.parse.quote(address), headers={"User-Agent": "SakamichiTools fumi sync/1.0"})
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            data = json.load(response)
    except (OSError, urllib.error.URLError, ValueError, json.JSONDecodeError):
        return None
    if not data:
        return False
    lng, lat = data[0]["geometry"]["coordinates"]
    return {"lng": float(lng), "lat": float(lat), "title": data[0].get("properties", {}).get("title", "")}


def geocode(spots: list[dict[str, Any]], cache_path: Path, delay: float) -> tuple[int, int]:
    """Fill lat/lng of spots without article coordinates. Returns (resolved, failed); town-level hits count as resolved
    but carry coordPrecision="town". Cache entries written before precision was recorded (bare [lng, lat]) are re-queried."""
    cache = _load(cache_path)
    resolved = failed = 0
    last_request = 0.0
    for spot in spots:
        if spot["lat"] is not None and spot["lng"] is not None:
            continue
        address = spot["address"]
        hit = cache.get(address)
        if hit is None or isinstance(hit, list):
            wait = max(0.0, delay - (time.monotonic() - last_request))
            if wait:
                time.sleep(wait)
            hit = _query(address)
            last_request = time.monotonic()
            if hit is not None:
                cache[address] = hit
        if hit:
            spot.update(lat=hit["lat"], lng=hit["lng"], coordSource="gsi", coordPrecision=precision(hit["title"]))
            resolved += 1
        else:
            failed += 1
    _save(cache_path, cache)
    return resolved, failed
