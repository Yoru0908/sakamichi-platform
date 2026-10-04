#!/usr/bin/env python3
"""Decide every new fumi spot automatically, publish the rest, and send the owner a once-per-spot FYI.

Runs between sync_fumi_articles.py (candidate) and promote_fumi_articles.py. Names and coordinates are already as good
as the crawler can make them (place_extract + fumi_locate: Jev-ranked names, OpenPOI/OSM/Wikidata/official-site
coordinates, municipality anchors, position names for unnamed spots). Decisions, no human step:
  - same place as a 山川宇衣 curated point (within DUP_M or same lot address) → skipped when Jev says it is the same
    place (≥ JEV_SAME) or one name contains the other; published otherwise. Jev down → the spot waits for the next run.
  - same name as a nearer-than-DUP_M spot of the same article → skipped (one pin per place; a road crossing several
    entries, e.g. 第一京浜国道 ×5, is several places).
  - its article already has published points but not this key → skipped silently (keys hash
    article|address|coordinate; a parser change must not re-add a published article as new pins).
  - everything else, including town-level coordinates the lookup could not improve, is published.
Jev also classifies articles the rules could not (fallback Vlog・企画 / その他企画) at ≥ JEV_SURE.
fumi_overrides.json still applies first ({"<key>": {"action": "skip"}} or "publish" with optional name/lat/lng).
"""

from __future__ import annotations

import argparse
import json
import math
import os
import re
import sys
import unicodedata
import urllib.request
from pathlib import Path
from typing import Any

from job_alert import send
from sync_fumi_articles import CATEGORY_COLORS

DUP_M = 150.0
JEV_URL = "https://api.typesafe.ai/v1/systemone"
JEV_SURE = 0.8
JEV_SAME = 0.5
FALLBACK = ("Vlog・企画", "その他企画")
# FYI notices go to the owner privately, not to the shared alert group (2026-10-05).
REVIEW_QQ = os.environ.get("SEICHI_REVIEW_QQ", "314389463")
RUNTIME_DIR = Path(os.environ.get("SEICHI_RUNTIME_DIR", "/vol1/seichi-sync"))
JEV_ENV = Path(os.environ.get("SEICHI_TYPESAFE_ENV", str(RUNTIME_DIR / "secrets" / "typesafe.env")))
CATEGORIES = {
    "MV・楽曲": "Filming location of a music video (MV/PV), single jacket, or song-related visual",
    "個人PV": "Filming location of a member's individual PV (個人PV)",
    "雑誌・グラビア": "Photo shoot location for a magazine, gravure, photobook or published photo set",
    "Blog・MSG": "Location of a photo in a member's own blog post, SNS post, message app or greeting card",
    "Vlog・企画": "Location of a vlog, YouTube channel episode (櫻坂チャンネル), camp or travel project video",
    "番組・イベント": "Location of a TV/radio programme, livestream, event, collaboration or location shoot for a show",
}


def load(path: Path, default: Any) -> Any:
    if not path.exists():
        return default
    with path.open(encoding="utf-8") as handle:
        return json.load(handle)


def write(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    tmp.replace(path)


def metres(a: list[float], b: list[float]) -> float:
    return math.hypot((a[1] - b[1]) * 111_200, (a[0] - b[0]) * 111_320 * math.cos(math.radians(a[1])))


def compact(text: Any) -> str:
    return re.sub(r"[\s・/\-()（）「」]+", "", unicodedata.normalize("NFKC", str(text or ""))).lower()


def near_curated(feature: dict, curated: list[dict]) -> tuple[float, dict] | None:
    here, address = feature["geometry"]["coordinates"], compact(feature["properties"].get("address"))
    best = None
    for other in curated:
        dist = metres(here, other["geometry"]["coordinates"])
        same_address = address and re.search(r"\d", address) and address == compact(other["properties"].get("address"))
        if (dist <= DUP_M or same_address) and (best is None or dist < best[0]):
            best = (dist, other)
    return best


def contains(a: Any, b: Any) -> bool:
    a, b = compact(a), compact(b)
    return bool(a and b and (a in b or b in a))


def apply_override(feature: dict, override: dict) -> None:
    props = feature["properties"]
    if override.get("name"):
        props["name"] = props["source"]["name"] = override["name"]
    if isinstance(override.get("lat"), (int, float)) and isinstance(override.get("lng"), (int, float)):
        feature["geometry"]["coordinates"] = [override["lng"], override["lat"]]
        props.update(coordSource="override", coordPrecision="exact")


def jev(questions: dict[str, dict]) -> dict[str, dict] | None:
    """One batched TypeSafe call. No key → {} (rules only); API failure → None (the caller defers what needs it)."""
    key = os.environ.get("TYPESAFE_API_KEY") or next(
        (line.split("=", 1)[1].strip() for line in (JEV_ENV.read_text().splitlines() if JEV_ENV.exists() else []) if line.startswith("TYPESAFE_API_KEY=")),
        "",
    )
    if not key or not questions:
        return {}
    body = {"state": {"task": "Review new spots for a map of 櫻坂46 filming locations"}, "model": "jev-latest", "questions": questions}
    request = urllib.request.Request(JEV_URL, data=json.dumps(body).encode(), headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            return json.load(response).get("answers", {})
    except Exception as exc:
        print(f"fumi_review: Jev call failed: {exc}", file=sys.stderr)
        return None


def reclassify(feature: dict, category: str) -> None:
    props = feature["properties"]
    props.update(category=category, subcategory=category, categoryColor=CATEGORY_COLORS[category])
    props["classification"].update(category=category, subcategory=category, method="jev")


def ask_jev(dups: list[tuple[dict, dict]], candidates: list[dict]) -> tuple[dict, list]:
    questions: dict[str, dict] = {}
    for i, (feature, other) in enumerate(dups):
        questions[f"d{i}"] = {"type": "noul", "instructions": {
            "new_spot": {"name": feature["properties"].get("name"), "address": feature["properties"].get("address")},
            "existing_spot": {"name": other["properties"].get("name"), "address": other["properties"].get("address")},
            "distance_m": round(metres(feature["geometry"]["coordinates"], other["geometry"]["coordinates"])),
            "question": "Do `new_spot` and `existing_spot` refer to the same real-world place?"}}
    articles = list({f["properties"]["sourceUrl"]: f["properties"] for f in candidates}.items())
    for j, (_, props) in enumerate(articles):
        questions[f"c{j}"] = {"type": "choice", "criteria": CATEGORIES, "instructions": {
            "article_title": props["sceneTitle"], "question": "What kind of content are the locations in this article from?"}}
    return jev(questions), articles


def classify_fallbacks(answers: dict, articles: list, candidates: list[dict]) -> None:
    for j, (url, props) in enumerate(articles):
        answer = answers.get(f"c{j}") or {}
        if (props["category"], props["subcategory"]) != FALLBACK or answer.get("choice") not in CATEGORIES:
            continue
        if answer["choice"] != props["category"] and answer.get("confidence", 0) >= JEV_SURE:
            for feature in candidates:
                if feature["properties"]["sourceUrl"] == url:
                    reclassify(feature, answer["choice"])


def unresolved(crawl_report: dict) -> list[dict]:
    rows = []
    for spot in crawl_report.get("unresolvedSpots", []):
        article = re.search(r"archives/(\d+)", spot.get("articleUrl", ""))
        rows.append({"key": f"unresolved:{article.group(1) if article else '?'}:{spot.get('address', '')}", "decision": "no-coordinate",
                     "name": spot.get("name", ""), "address": spot.get("address", ""), "url": spot.get("articleUrl")})
    return rows


def article_of(feature: dict) -> str:
    match = re.search(r"archives/(\d+)", str(feature["properties"].get("sourceUrl") or ""))
    return match.group(1) if match else ""


def row(feature: dict, decision: str, note: str = "") -> dict:
    props = feature["properties"]
    return {"key": props["id"], "decision": decision, "note": note, "name": props.get("name") or "", "address": props.get("address") or "",
            "precision": props.get("coordPrecision"), "named": props.get("nameSource") == "position", "url": props.get("sourceUrl")}


def review(candidate: dict, current: dict, curated: dict, overrides: dict) -> tuple[dict, list[dict]]:
    """→ (features to publish, decision rows for every new key). Already-published keys pass through silently."""
    published: dict[str, set[str]] = {}
    for feature in current["features"]:
        if str(feature["properties"].get("id", "")).startswith("fumi-article:"):
            published.setdefault(article_of(feature), set()).add(feature["properties"]["id"])
    fresh, keep, rows = [], [], []
    for feature in candidate["features"]:
        key, override = feature["properties"]["id"], overrides.get(feature["properties"]["id"]) or {}
        if override.get("action") == "skip":
            continue
        apply_override(feature, override)
        if key in published.get(article_of(feature), ()) or override.get("action") == "publish":
            keep.append(feature)
        elif article_of(feature) not in published:  # else: a re-keyed spot of a published article, dropped silently
            fresh.append(feature)
    dups = [(f, hit[1]) for f in fresh if (hit := near_curated(f, curated.get("features", [])))]
    answers, articles = ask_jev(dups, fresh) if fresh else ({}, [])
    classify_fallbacks(answers or {}, articles, fresh)
    same = {id(f): (other, (answers or {}).get(f"d{i}", {}).get("noul")) for i, (f, other) in enumerate(dups)}
    for feature in fresh:
        decision, note = decide(feature, same.get(id(feature)), keep, answers is None)
        rows.append(row(feature, decision, note))
        if decision == "published":
            keep.append(feature)
    return {"type": "FeatureCollection", "features": keep}, rows


def decide(feature: dict, curated_hit: tuple[dict, float | None] | None, kept: list[dict], jev_down: bool) -> tuple[str, str]:
    props = feature["properties"]
    twin = next((f for f in kept if f["properties"].get("sourceUrl") == props.get("sourceUrl") and props.get("name")
                 and compact(f["properties"].get("name")) == compact(props.get("name"))
                 and metres(f["geometry"]["coordinates"], feature["geometry"]["coordinates"]) <= DUP_M), None)
    if twin:
        return "skipped", "同一文章同名同地"
    if not curated_hit:
        return "published", ""
    other, p_same = curated_hit
    label = f"手工图「{other['properties'].get('name')}」"
    if contains(props.get("name"), other["properties"].get("name")) or (p_same or 0) >= JEV_SAME:
        return "skipped", f"与{label}是同一地点"
    if p_same is None and jev_down:
        return "deferred", f"靠近{label}，Jev 暂不可用，下轮再判"
    return "published", f"靠近{label}但不是同一地点"


LABELS = {"published": "已发布", "skipped": "已跳过", "deferred": "待下轮", "no-coordinate": "查不到坐标"}


def notice(rows: list[dict]) -> str:
    count = {d: sum(r["decision"] == d for r in rows) for d in LABELS}
    head = "，".join(f"{LABELS[d]} {n}" for d, n in count.items() if n)
    lines = [f"【fumi 新地点】{head}"]
    for n, item in enumerate(rows[:20], 1):
        flags = [f for f, on in (("町名级坐标", item.get("precision") == "town"), ("按位置命名", item.get("named"))) if on]
        extra = "；".join(filter(None, [item.get("note"), *flags]))
        lines.append(f"{n}. [{LABELS[item['decision']]}] {item['name'] or '(无名)'} | {item['address'] or '-'}"
                     + (f"\n   {extra}" if extra else "") + f"\n   {item['url']}")
    if len(rows) > 20:
        lines.append(f"…另 {len(rows) - 20} 件见 reports/fumi-review-latest.json")
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description="自动判定 fumi 新地点（发布/跳过）并私聊通知")
    parser.add_argument("--candidate", type=Path, required=True)
    parser.add_argument("--current", type=Path, required=True)
    parser.add_argument("--curated", type=Path, required=True, help="山川宇衣 手工图 yamakawa-ui.geojson")
    parser.add_argument("--overrides", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--report", type=Path, required=True)
    parser.add_argument("--crawl-report", type=Path, help="sync_fumi_articles.py report (lists spots without coordinates)")
    parser.add_argument("--state", type=Path, default=RUNTIME_DIR / "state" / "fumi-review-notified.json")
    args = parser.parse_args()

    candidate = load(args.candidate, {"features": []})
    overrides = load(args.overrides, {})
    kept, rows = review(candidate, load(args.current, {"features": []}), load(args.curated, {"features": []}), overrides)
    rows += [r for r in unresolved(load(args.crawl_report, {}) if args.crawl_report else {}) if r["key"] not in overrides]
    write(args.output, kept)
    write(args.report, {"candidate": len(candidate["features"]), "kept": len(kept["features"]), "decisions": rows})
    notified = set(load(args.state, []))
    fresh = [r for r in rows if r["key"] not in notified and r["decision"] != "deferred"]
    if fresh and send(notice(fresh), user_id=REVIEW_QQ):
        write(args.state, sorted(notified | {r["key"] for r in fresh}))
    print(json.dumps({"candidate": len(candidate["features"]), "kept": len(kept["features"]),
                      "decisions": {d: sum(r["decision"] == d for r in rows) for d in LABELS}, "notified": len(fresh)}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
