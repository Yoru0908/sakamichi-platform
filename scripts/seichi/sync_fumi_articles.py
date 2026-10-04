#!/usr/bin/env python3
"""Incrementally crawl fumi Diary articles and merge verified public locations.

The Google My Maps maintained by fumi currently stops before Sakurazaka's fourth
class. This synchronizer uses article tags as the source of truth, extracts
postal addresses/explicit coordinates, geocodes addresses with Japan GSI's
address search, and writes deterministic GeoJSON features.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable

from bs4 import BeautifulSoup

from fumi_classify import classify
from fumi_members import FOURTH_MEMBERS, SAKURAZAKA_MEMBERS
from fumi_geo import geocode
from fumi_locate import resolve
from place_extract import JevScorer, extract

ROOT = Path(__file__).resolve().parents[2]
BASE_URL = "http://blog.livedoor.jp/fumichen2"
PROVIDER = "fumi Diary 2号店"
DEFAULT_TAGS = ["櫻坂46", *FOURTH_MEMBERS]
ARTICLE_RE = re.compile(r"/archives/(\d+)\.html(?:$|[?#])")
PRIVATE_TERMS = ("個人宅", "自宅", "実家", "住宅のため非公開", "住所非公開")
CATEGORY_COLORS = {
    "MV・楽曲": "#e11d48",
    "Vlog・企画": "#0891b2",
    "個人PV": "#059669",
    "雑誌・グラビア": "#7c3aed",
    "Blog・MSG": "#f59e0b",
    "番組・イベント": "#2563eb",
    "その他": "#64748b",
}


@dataclass(frozen=True)
class Article:
    article_id: int
    url: str
    title: str
    discovered_tags: tuple[str, ...]


class Fetcher:
    def __init__(self, cache_dir: Path, delay: float, refresh: bool = False) -> None:
        self.cache_dir = cache_dir
        self.delay = max(0.0, delay)
        self.refresh = refresh
        self.last_request = 0.0

    def get(self, url: str, cache_name: str, retries: int = 3, use_cache: bool = True) -> str:
        path = self.cache_dir / cache_name
        if path.exists() and not self.refresh and use_cache:
            return path.read_text(encoding="utf-8", errors="ignore")
        path.parent.mkdir(parents=True, exist_ok=True)
        error: Exception | None = None
        for attempt in range(retries):
            wait = self.delay - (time.monotonic() - self.last_request)
            if wait > 0:
                time.sleep(wait)
            request = urllib.request.Request(url, headers={
                "User-Agent": "SakamichiTools fumi sync/1.0 (+public location archive)",
            })
            try:
                with urllib.request.urlopen(request, timeout=30) as response:
                    body = response.read().decode("utf-8", errors="ignore")
                self.last_request = time.monotonic()
                path.write_text(body, encoding="utf-8")
                return body
            except (OSError, urllib.error.URLError) as exc:
                error = exc
                self.last_request = time.monotonic()
                time.sleep(1.0 * (attempt + 1))
        raise RuntimeError(f"failed to fetch {url}: {error}")


def unique(values: Iterable[str]) -> list[str]:
    return list(dict.fromkeys(value.strip() for value in values if value and value.strip()))


def article_id(url: str) -> int | None:
    match = ARTICLE_RE.search(url)
    return int(match.group(1)) if match else None


def crawl_tag(fetcher: Fetcher, tag: str, cutoff: int, max_pages: int) -> list[Article]:
    result: list[Article] = []
    encoded = urllib.parse.quote(tag)
    for page in range(1, max_pages + 1):
        suffix = "" if page == 1 else f"?p={page}"
        url = f"{BASE_URL}/tag/{encoded}{suffix}"
        # Tag indexes are mutable and must be refreshed on every synchronization;
        # article pages remain cached because their archive URLs are immutable.
        html = fetcher.get(
            url,
            f"tags/{hashlib.sha1(tag.encode()).hexdigest()[:12]}-{page}.html",
            use_cache=False,
        )
        soup = BeautifulSoup(html, "html.parser")
        page_articles: list[Article] = []
        for heading in soup.select("h2.article-title"):
            link = heading.find("a", href=True)
            if link is None:
                continue
            href = urllib.parse.urljoin(BASE_URL, link["href"])
            aid = article_id(href)
            if aid is None:
                continue
            page_articles.append(Article(aid, href, link.get_text(" ", strip=True), (tag,)))
        if not page_articles:
            break
        result.extend(item for item in page_articles if item.article_id > cutoff)
        # Tag pages are newest-first; once an entire page is at/below cutoff,
        # later pages cannot contain incremental articles.
        if cutoff and all(item.article_id <= cutoff for item in page_articles):
            break
        if soup.select_one(".pager li.next a") is None:
            break
    return result


def crawl_articles(fetcher: Fetcher, tags: list[str], cutoff: int, max_pages: int) -> list[Article]:
    merged: dict[int, Article] = {}
    for tag in tags:
        rows = crawl_tag(fetcher, tag, cutoff, max_pages)
        print(f"tag {tag}: {len(rows)} incremental articles", flush=True)
        for row in rows:
            previous = merged.get(row.article_id)
            discovered = unique((*previous.discovered_tags, tag)) if previous else [tag]
            merged[row.article_id] = Article(row.article_id, row.url, row.title, tuple(discovered))
    return sorted(merged.values(), key=lambda item: item.article_id)


def source_tags(soup: BeautifulSoup, discovered: Iterable[str]) -> list[str]:
    # Restrict this selector to article metadata. Selecting every /tag/ link also
    # captures the sidebar tag cloud and incorrectly assigns every idol to every point.
    metadata = [link.get_text(" ", strip=True) for link in soup.select(".article-tags a[href*='/tag/']")]
    return unique((*metadata, *discovered))


def parse_locations(article: Article, html: str, scorer: JevScorer | None = None) -> list[dict[str, Any]]:
    soup = BeautifulSoup(html, "html.parser")
    body = soup.select_one(".article-body-inner") or soup.select_one(".article-body")
    if body is None:
        return []
    title_node = soup.select_one("h2.article-title")
    title = title_node.get_text(" ", strip=True) if title_node else article.title
    # Keep repeated lines: dropping them shifts which coordinate follows which address.
    lines = [part.strip() for part in body.get_text("\n", strip=True).splitlines() if part.strip()]
    body_text = " ".join(lines)
    tags = source_tags(soup, article.discovered_tags)
    members = [tag for tag in tags if tag in SAKURAZAKA_MEMBERS]
    members.extend(member for member in SAKURAZAKA_MEMBERS if member in title and member not in members)
    if "歌唱メンバー" in body_text:
        members.extend(member for member in SAKURAZAKA_MEMBERS if member in body_text and member not in members)
    members = unique(members)
    generation_tags = ["四期生"] if any(member in FOURTH_MEMBERS for member in members) else []
    tags = unique((*tags, *generation_tags, *members))
    category, subcategory = classify(title, tags)

    spots: list[dict[str, Any]] = []
    for spot in extract(lines, title, scorer.score(lines, title) if scorer else {}):
        at, text = spot.pop("anchor"), spot.pop("lines")
        if any(term in " ".join(text[max(0, at - 3):at + 3])[:400] for term in PRIVATE_TERMS):
            continue
        exact = spot["lat"] is not None
        spots.append({**spot, "coordSource": "article" if exact else "", "coordPrecision": "exact" if exact else ""})

    deduped: dict[tuple[Any, ...], dict[str, Any]] = {}
    for spot in spots:
        key = (spot["name"], spot["address"], spot["lat"], spot["lng"])
        if key not in deduped:
            deduped[key] = spot
    date_node = soup.select_one(".article-date")
    date = date_node.get_text(" ", strip=True) if date_node else ""
    result = []
    for index, spot in enumerate(deduped.values(), 1):
        result.append({
            **spot,
            "articleId": article.article_id,
            "articleTitle": title,
            "articleUrl": article.url,
            "date": date,
            "category": category,
            "subcategory": subcategory,
            "tags": tags,
            "members": members,
            "position": index,
        })
    return result


def load_json(path: Path, default: Any) -> Any:
    if not path.exists():
        return default
    with path.open(encoding="utf-8") as handle:
        return json.load(handle)


def atomic_write(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=path.parent, delete=False) as handle:
        json.dump(value, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
        temporary = Path(handle.name)
    temporary.replace(path)


def to_feature(spot: dict[str, Any]) -> dict[str, Any] | None:
    if spot["lat"] is None or spot["lng"] is None:
        return None
    identity = f"{spot['articleId']}|{spot['address']}|{spot['lat']:.6f}|{spot['lng']:.6f}"
    source_key = f"fumi-article:{hashlib.sha256(identity.encode()).hexdigest()[:20]}"
    source_tags_value = unique(spot["tags"])
    props = {
        "id": source_key,
        "sourceKey": source_key,
        "name": spot["name"],
        "category": spot["category"],
        "subcategory": spot["subcategory"],
        "categoryColor": CATEGORY_COLORS[spot["category"]],
        "address": spot["address"],
        "sceneTitle": spot["articleTitle"],
        "sceneNote": f"{PROVIDER} の公開記事に掲載されたロケ地。{spot['address']}".strip(),
        "sourceLabel": PROVIDER,
        "sourceUrl": spot["articleUrl"],
        "referenceUrl": spot["articleUrl"],
        "tags": source_tags_value,
        "images": [],
        "members": unique(spot["members"]),
        "source": {
            "provider": PROVIDER,
            "url": spot["articleUrl"],
            "mapId": "",
            "layer": spot["articleTitle"],
            "tags": source_tags_value,
            "name": spot["name"],
            "group": "櫻坂46",
        },
        "classification": {
            "category": spot["category"],
            "subcategory": spot["subcategory"],
            "method": "source-article",
            "status": "source",
        },
        "classificationCandidates": {"members": [], "projects": [], "contentTypes": []},
        "coordSource": spot.get("coordSource", ""),
        "coordPrecision": spot.get("coordPrecision", ""),
        **({"nameSource": spot["nameSource"]} if spot.get("nameSource") else {}),
    }
    return {
        "type": "Feature",
        "geometry": {"type": "Point", "coordinates": [spot["lng"], spot["lat"]]},
        "properties": props,
    }


def merge_features(target: dict[str, Any], supplements: list[dict[str, Any]]) -> dict[str, Any]:
    base = [
        feature for feature in target.get("features", [])
        if not str(feature.get("properties", {}).get("sourceKey", "")).startswith("fumi-article:")
        and not str(feature.get("properties", {}).get("id", "")).startswith("fumi-article:")
    ]
    seen = {
        (
            round(feature["geometry"]["coordinates"][0], 5),
            round(feature["geometry"]["coordinates"][1], 5),
            feature.get("properties", {}).get("sourceUrl", ""),
        )
        for feature in base
    }
    for feature in supplements:
        key = (
            round(feature["geometry"]["coordinates"][0], 5),
            round(feature["geometry"]["coordinates"][1], 5),
            feature["properties"].get("sourceUrl", ""),
        )
        if key not in seen:
            base.append(feature)
            seen.add(key)
    return {"type": "FeatureCollection", "features": base}


def main() -> int:
    parser = argparse.ArgumentParser(description="增量同步 fumi Diary 的櫻坂46公开ロケ地")
    parser.add_argument("--tag", action="append", dest="tags", help="抓取标签，可重复")
    parser.add_argument("--cutoff-article-id", type=int, default=58499744, help="仅抓取更大的文章 ID；0=全量")
    parser.add_argument("--baseline", type=Path, help="fumi_baseline.json：其 articleId 及以前的文章是已定稿的历史，不再抓取")
    parser.add_argument("--max-pages", type=int, default=100)
    parser.add_argument("--max-articles", type=int, default=0, help="调试上限；0=不限")
    parser.add_argument("--cache-dir", type=Path, default=ROOT / ".tmp/fumi-cache")
    parser.add_argument("--request-delay", type=float, default=0.35)
    parser.add_argument("--geocode-delay", type=float, default=0.15)
    parser.add_argument("--no-geocode", action="store_true")
    parser.add_argument("--jev-env", type=Path, default=Path(os.environ.get("SEICHI_TYPESAFE_ENV", "/vol1/seichi-sync/secrets/typesafe.env")),
                        help="TYPESAFE_API_KEY env file；没有则地名按版面规则选（不调用 Jev）")
    parser.add_argument("--refresh", action="store_true")
    parser.add_argument("--output", type=Path, default=ROOT / ".tmp/fumi-supplement.geojson")
    parser.add_argument("--report", type=Path, default=ROOT / ".tmp/fumi-supplement-report.json")
    parser.add_argument("--merge-target", type=Path, help="原子更新目标 GeoJSON")
    args = parser.parse_args()

    try:
        tags = args.tags or DEFAULT_TAGS
        if args.baseline:
            args.cutoff_article_id = max(args.cutoff_article_id, int(load_json(args.baseline, {}).get("articleId", 0)))
        fetcher = Fetcher(args.cache_dir, args.request_delay, args.refresh)
        articles = crawl_articles(fetcher, tags, args.cutoff_article_id, args.max_pages)
        if args.max_articles:
            articles = articles[-args.max_articles:]
        print(f"unique articles: {len(articles)}", flush=True)
        scorer = JevScorer(args.cache_dir / "jev-place-names.json", args.jev_env)
        spots: list[dict[str, Any]] = []
        failures: list[dict[str, str]] = []
        for index, article in enumerate(articles, 1):
            try:
                html = fetcher.get(article.url, f"articles/{article.article_id}.html")
                spots.extend(parse_locations(article, html, scorer))
            except RuntimeError as error:
                failures.append({"url": article.url, "error": str(error)})
            if index % 25 == 0 or index == len(articles):
                print(f"parsed {index}/{len(articles)} articles -> {len(spots)} location candidates", flush=True)

        scorer.save()
        geocoded = geocode_failed = 0
        resolved = {"anchored": 0, "located": 0, "named": 0, "deferred": 0}
        if not args.no_geocode:
            geocoded, geocode_failed = geocode(spots, args.cache_dir / "gsi-geocode.json", args.geocode_delay)
            resolved = resolve(spots, args.cache_dir / "place-locate.json")
        features = [feature for spot in spots if (feature := to_feature(spot)) is not None]
        output = {"type": "FeatureCollection", "features": features}
        atomic_write(args.output, output)
        if args.merge_target:
            target = load_json(args.merge_target, {"type": "FeatureCollection", "features": []})
            merged = merge_features(target, features)
            atomic_write(args.merge_target, merged)
            print(f"merged {len(features)} supplements -> {args.merge_target} ({len(merged['features'])} total)")
        report = {
            "tags": tags,
            "cutoffArticleId": args.cutoff_article_id,
            "articles": len(articles),
            "locationCandidates": len(spots),
            "features": len(features),
            "unresolved": len(spots) - len(features),
            "geocoded": geocoded,
            "geocodeFailed": geocode_failed,
            "resolved": resolved,
            # Either one means this run's names/coordinates are provisional; the cron does not publish it.
            "locateDeferred": resolved["deferred"],
            "jevFailed": scorer.failed,
            "fetchFailures": failures,
            "unresolvedSpots": [
                {"name": spot["name"], "address": spot["address"], "articleUrl": spot["articleUrl"], "title": spot.get("articleTitle", "")}
                for spot in spots if spot["lat"] is None or spot["lng"] is None
            ],
        }
        atomic_write(args.report, report)
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return 0 if not failures else 2
    except (OSError, RuntimeError, ValueError, json.JSONDecodeError) as error:
        print(f"sync_fumi_articles.py: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
