#!/usr/bin/env python3
"""Hold back new fumi spots that need a human, notify once, publish the rest.

Runs between sync_fumi_articles.py (candidate) and promote_fumi_articles.py. A candidate spot is held when:
  - no-name     the crawler found no line that names it (it never publishes a sentence or title as a label)
  - coarse      its coordinate is a town-level GSI fallback (「奥瀬」 for 蔦温泉: 7 km off)
  - duplicate   within DUP_M of, or at the same address as, a point of the 山川宇衣 curated map; or the same name as
                another spot of the same article. Neighbouring shops in one article and other articles at the same
                place (one pin per article) are normal: a leave-one-out run over the latest 40 articles held 28% / 30%
                of genuinely new spots when those counted as duplicates too.
  - changed     its article already has published points but not this key (keys hash article|address|coordinate, so
                a parser change would otherwise re-add a published article as new pins next to the old ones)
Jev (TypeSafe) adds a second opinion — same place? / which category? — to the notice. It decides only one thing: an
article the rules could not classify (fallback Vlog・企画 / その他企画, ~1 in 368) takes Jev's category at ≥ JEV_SURE.
fumi_overrides.json (in git) is how a held spot is released or dropped:
  {"fumi-article:…": {"action": "publish", "name": "…", "lat": 35.1, "lng": 139.1}}   name/lat/lng optional
  {"fumi-article:…": {"action": "skip"}}
Spots the crawler could not place at all (no coordinate, GSI no match) are listed from the crawl report as
"no-coordinate" (notice only — key unresolved:<article id>:<address>; GSI network errors are retried next run).
Each held key is notified once (state under SEICHI_RUNTIME_DIR), so the 6-hourly cron does not repeat itself.
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
FALLBACK = ("Vlog・企画", "その他企画")
# Held-spot notices go to the owner privately, not to the shared alert group (2026-10-05).
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


def nearest_published(feature: dict, published: list[dict], same_name: list[dict]) -> tuple[float, dict] | None:
    here, address = feature["geometry"]["coordinates"], compact(feature["properties"].get("address"))
    best = None
    for other in published:
        dist = metres(here, other["geometry"]["coordinates"])
        same_address = address and re.search(r"\d", address) and address == compact(other["properties"].get("address"))
        if (dist <= DUP_M or same_address) and (best is None or dist < best[0]):
            best = (dist, other)
    for other in same_name:
        dist = metres(here, other["geometry"]["coordinates"])
        if best is None or dist < best[0]:
            best = (dist, other)
    return best


def reasons_for(feature: dict, published: list[dict], same_name: list[dict] = ()) -> tuple[list[str], dict | None]:
    props, reasons = feature["properties"], []
    if not str(props.get("name") or "").strip():
        reasons.append("no-name")
    if props.get("coordPrecision") == "town":
        reasons.append("coarse")
    dup = nearest_published(feature, published, list(same_name))
    if dup:
        reasons.append("duplicate")
    return reasons, ({"distance": round(dup[0]), "name": dup[1]["properties"].get("name"), "id": dup[1]["properties"].get("id")} if dup else None)


def apply_override(feature: dict, override: dict) -> None:
    props = feature["properties"]
    if override.get("name"):
        props["name"] = props["source"]["name"] = override["name"]
    if isinstance(override.get("lat"), (int, float)) and isinstance(override.get("lng"), (int, float)):
        feature["geometry"]["coordinates"] = [override["lng"], override["lat"]]
        props.update(coordSource="override", coordPrecision="exact")


def jev(questions: dict[str, dict]) -> dict[str, dict]:
    """One batched TypeSafe call; any failure → no opinions (the notice goes out without them)."""
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
    except Exception as exc:  # the review must not fail because the second opinion is unavailable
        print(f"fumi_review: Jev call failed: {exc}", file=sys.stderr)
        return {}


def reclassify(feature: dict, category: str) -> None:
    props = feature["properties"]
    props.update(category=category, subcategory=category, categoryColor=CATEGORY_COLORS[category])
    props["classification"].update(category=category, subcategory=category, method="jev")


def second_opinions(held: list[dict], candidates: list[dict]) -> list[dict]:
    """Attach Jev's P(same place) to held duplicates; return articles whose rule category Jev confidently disputes."""
    questions: dict[str, dict] = {}
    for i, item in enumerate(held):
        if item["duplicate"]:
            questions[f"d{i}"] = {"type": "noul", "instructions": {
                "new_spot": {"name": item["name"], "address": item["address"]},
                "existing_spot": {"name": item["duplicate"]["name"]}, "distance_m": item["duplicate"]["distance"],
                "question": "Do `new_spot` and `existing_spot` refer to the same real-world place?"}}
    articles = list({f["properties"]["sourceUrl"]: f["properties"] for f in candidates}.items())
    for j, (_, props) in enumerate(articles):
        questions[f"c{j}"] = {"type": "choice", "criteria": CATEGORIES, "instructions": {
            "article_title": props["sceneTitle"], "question": "What kind of content are the locations in this article from?"}}
    answers = jev(questions)
    for i, item in enumerate(held):
        if f"d{i}" in answers:
            item["duplicate"]["jevSame"] = round(answers[f"d{i}"].get("noul", 0), 2)
    doubts = []
    for j, (url, props) in enumerate(articles):
        answer = answers.get(f"c{j}") or {}
        if answer.get("choice") not in CATEGORIES or answer["choice"] == props["category"] or answer.get("confidence", 0) < JEV_SURE:
            continue
        if (props["category"], props["subcategory"]) == FALLBACK:
            for feature in candidates:
                if feature["properties"]["sourceUrl"] == url:
                    reclassify(feature, answer["choice"])
            continue
        doubts.append({"key": f"category:{url}", "url": url, "title": props["sceneTitle"], "rule": props["category"],
                       "jev": answer["choice"], "confidence": round(answer["confidence"], 2)})
    return doubts


def unresolved(crawl_report: dict) -> list[dict]:
    rows = []
    for spot in crawl_report.get("unresolvedSpots", []):
        article = re.search(r"archives/(\d+)", spot.get("articleUrl", ""))
        rows.append({"key": f"unresolved:{article.group(1) if article else '?'}:{spot.get('address', '')}", "reasons": ["no-coordinate"],
                     "name": spot.get("name", ""), "address": spot.get("address", ""), "lat": None, "lng": None,
                     "url": spot.get("articleUrl"), "title": spot.get("title"), "duplicate": None})
    return rows


def article_of(feature: dict) -> str:
    match = re.search(r"archives/(\d+)", str(feature["properties"].get("sourceUrl") or ""))
    return match.group(1) if match else ""


def review(candidate: dict, current: dict, curated: dict, overrides: dict) -> tuple[dict, list[dict], list[dict]]:
    """Revisits of places from other articles in the combined map are not held; re-parsed published articles are."""
    published: dict[str, set[str]] = {}
    for feature in current["features"]:
        if str(feature["properties"].get("id", "")).startswith("fumi-article:"):
            published.setdefault(article_of(feature), set()).add(feature["properties"]["id"])
    keep, held = [], []
    for feature in candidate["features"]:
        key = feature["properties"]["id"]
        override = overrides.get(key) or {}
        if override.get("action") == "skip":
            continue
        apply_override(feature, override)
        name = compact(feature["properties"].get("name"))
        same_name = [f for f in keep if name and f["properties"].get("sourceUrl") == feature["properties"].get("sourceUrl")
                     and compact(f["properties"].get("name")) == name]
        reasons, dup = reasons_for(feature, curated.get("features", []), same_name)
        if key in published.get(article_of(feature), ()):
            keep.append(feature)
            continue
        if article_of(feature) in published:
            reasons.append("changed")
        if override.get("action") == "publish" or not reasons:
            keep.append(feature)
            continue
        props = feature["properties"]
        held.append({"key": key, "reasons": reasons, "name": props.get("name") or "", "address": props.get("address") or "",
                     "lat": feature["geometry"]["coordinates"][1], "lng": feature["geometry"]["coordinates"][0],
                     "url": props.get("sourceUrl"), "title": props.get("sceneTitle"), "duplicate": dup})
    doubts = second_opinions(held, candidate["features"])
    return {"type": "FeatureCollection", "features": keep}, held, doubts


LABELS = {"no-name": "取不到地名", "coarse": "坐标只到町名", "duplicate": "疑似重复", "no-coordinate": "查不到坐标", "changed": "已发布文章解析结果变化"}


def notice(items: list[dict], doubts: list[dict]) -> str:
    lines = [f"【fumi 新地点待确认】{len(items)} 件未发布" + (f"，{len(doubts)} 篇分类存疑" if doubts else "")]
    for n, item in enumerate(items[:15], 1):
        why = "・".join(LABELS[r] for r in item["reasons"])
        where = f"{item['lat']:.6f},{item['lng']:.6f}" if item["lat"] is not None else "-"
        line = f"{n}. [{why}] {item['name'] or '(无名)'} | {item['address'] or '-'} | {where}"
        if item.get("duplicate"):
            dup = item["duplicate"]
            same = f"，Jev 同一地点 {dup['jevSame']}" if "jevSame" in dup else ""
            line += f"\n   与已有「{dup['name']}」相距 {dup['distance']}m{same}"
        lines.append(f"{line}\n   {item['url']}\n   key: {item['key']}")
    if len(items) > 15:
        lines.append(f"…另 {len(items) - 15} 件见 reports/fumi-review-latest.json")
    for doubt in doubts:
        lines.append(f"分类存疑：{doubt['title']}\n   规则 {doubt['rule']} / Jev {doubt['jev']} {doubt['confidence']}（已按规则发布）\n   {doubt['url']}")
    if items:
        lines.append("放行/跳过：scripts/seichi/fumi_overrides.json 写 {\"<key>\": {\"action\": \"publish\"}}（可附 name/lat/lng）或 \"skip\"")
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description="扣下需人工确认的 fumi 新地点并通知")
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
    kept, held, doubts = review(candidate, load(args.current, {"features": []}), load(args.curated, {"features": []}), overrides)
    held += [row for row in unresolved(load(args.crawl_report, {}) if args.crawl_report else {}) if row["key"] not in overrides]
    write(args.output, kept)
    write(args.report, {"candidate": len(candidate["features"]), "kept": len(kept["features"]), "held": held, "categoryDoubts": doubts})
    notified = set(load(args.state, []))
    fresh = [item for item in held if item["key"] not in notified]
    fresh_doubts = [doubt for doubt in doubts if doubt["key"] not in notified]
    if (fresh or fresh_doubts) and send(notice(fresh, fresh_doubts), user_id=REVIEW_QQ):
        write(args.state, sorted(notified | {item["key"] for item in fresh + fresh_doubts}))
    print(json.dumps({"candidate": len(candidate["features"]), "kept": len(kept["features"]), "held": len(held),
                      "notified": len(fresh) + len(fresh_doubts)}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
