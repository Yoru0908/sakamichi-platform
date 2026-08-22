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

ROOT = Path(__file__).resolve().parents[2]
BASE_URL = "http://blog.livedoor.jp/fumichen2"
PROVIDER = "fumi Diary 2号店"
FOURTH_MEMBERS = (
    "山川宇衣", "佐藤愛桜", "浅井恋乃未", "稲熊ひな", "勝又春",
    "中川智尋", "松本和子", "目黒陽色", "山田桃実",
)
DEFAULT_TAGS = ["櫻坂46", *FOURTH_MEMBERS]
# Keep this ordered: member/tag arrays are persisted in GeoJSON and must not
# change between processes merely because Python randomizes set iteration.
SAKURAZAKA_MEMBERS = (
    "森田ひかる", "田村保乃", "藤吉夏鈴", "守屋麗奈", "山﨑天", "大園玲",
    "武元唯衣", "松田里奈", "井上梨名", "増本綺良", "大沼晶保", "幸阪茉里乃",
    "小池美波", "遠藤光莉",
    "的野美青", "山下瞳月", "谷口愛季", "村井優", "中嶋優月", "小島凪紗",
    "村山美羽", "遠藤理子", "小田倉麗奈", "石森璃花", "向井純葉",
    *FOURTH_MEMBERS,
)
ARTICLE_RE = re.compile(r"/archives/(\d+)\.html(?:$|[?#])")
PREFECTURES = (
    "北海道|青森県|岩手県|宮城県|秋田県|山形県|福島県|茨城県|栃木県|群馬県|埼玉県|"
    "千葉県|東京都|神奈川県|新潟県|富山県|石川県|福井県|山梨県|長野県|岐阜県|静岡県|"
    "愛知県|三重県|滋賀県|京都府|大阪府|兵庫県|奈良県|和歌山県|鳥取県|島根県|岡山県|"
    "広島県|山口県|徳島県|香川県|愛媛県|高知県|福岡県|佐賀県|長崎県|熊本県|大分県|"
    "宮崎県|鹿児島県|沖縄県"
)
POSTAL_RE = re.compile(r"(?:住所\s*[:：]\s*)?〒\s*\d{3}-?\d{4}\s*(.+)")
PREFECTURE_ADDRESS_RE = re.compile(
    rf"((?:{PREFECTURES}).{{0,40}}(?:市|区|町|村|郡).*[0-9０-９一二三四五六七八九十])"
)
COORD_RE = re.compile(r"(?:座標\s*[:：]?\s*)?([2-4]\d(?:\.\d+)?)\s*[,，、\s]\s*(1[2-5]\d(?:\.\d+)?)")
URL_RE = re.compile(r"^(?:https?://|www\.)", re.I)
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


def clean_address(line: str) -> str | None:
    text = re.sub(r"\s+", " ", line).strip()
    match = POSTAL_RE.search(text) or PREFECTURE_ADDRESS_RE.search(text)
    if not match:
        return None
    value = match.group(1).strip()
    value = re.split(r"\s+(?:座標|※|https?://)", value, maxsplit=1)[0].strip()
    return value.rstrip("。") or None


def inline_place_name(line: str, address: str) -> str | None:
    prefix = line.split(address, 1)[0]
    prefix = re.sub(r"(?:住所\s*[:：]\s*)?〒\s*\d{3}-?\d{4}\s*$", "", prefix).strip(" ：:")
    return prefix if 1 < len(prefix) <= 80 and not URL_RE.match(prefix) else None


def meaningful_name(lines: list[str], index: int, title: str) -> str:
    for candidate in reversed(lines[max(0, index - 7):index]):
        value = candidate.strip(" ：:・")
        if not value or value.startswith("〒") or URL_RE.match(value) or clean_address(value) or COORD_RE.search(value):
            continue
        if value in SAKURAZAKA_MEMBERS or value in {"住所", "撮影場所", "不明", "私道", "ダンスシーン", "他"}:
            continue
        if value.startswith(("説明", "※", "歌唱メンバー", "ちなみに")):
            continue
        if any(mark in value for mark in ("。", "！", "？", "!", "?", "：", ":")):
            continue
        if len(value) <= 60 and re.search(r"[A-Za-z0-9ぁ-んァ-ヶ一-龯]", value):
            return value
    return title


def clean_content_title(title: str) -> str:
    value = re.sub(r"^\d{4}[.年]\d{1,2}[.月]\d{1,2}日?\s*", "", title).strip()
    value = value.replace("櫻坂46", "", 1).strip()
    for member in SAKURAZAKA_MEMBERS:
        value = value.replace(member, "")
    return value.strip(" 、,&　")


def classify(title: str, tags: Iterable[str] = ()) -> tuple[str, str]:
    quoted = re.search(r"[「『](.+?)[」』]", title)
    project = quoted.group(1).strip() if quoted else ""
    source_tags_value = set(tags)
    if "個人PV" in title:
        return "個人PV", project or "個人PV"
    if any(word in title for word in ("PV撮影", "MV撮影", "ジャケット写真")):
        return "MV・楽曲", project or "MV・楽曲"
    if any(word in title for word in ("blog", "ブログ", "グリーティングカード")):
        return "Blog・MSG", "公式Blog・写真"
    if any(word in title for word in (
        "週刊", "B.L.T", "BLT", "BOMB", "FLASH", "CanCam", "non-no", "ViVi",
        "EX大衆", "アップトゥボーイ", "グラビア", "IDOL AND READ", "Top Yell",
        "20±SWEET", "blt graph", "写真撮影場所",
    )):
        publication = clean_content_title(title).split("写真撮影場所", 1)[0].strip()
        return "雑誌・グラビア", publication[:60] or "雑誌・グラビア"
    if "Vlog" in title:
        return "Vlog・企画", "四期生Vlog" if "四期生Vlog" in title else "Vlog"
    if "四期生合宿" in title:
        return "Vlog・企画", "四期生合宿"
    if "ソロキャンプ" in title:
        return "Vlog・企画", "ソロキャンプ"
    if "櫻坂チャンネル" in source_tags_value or "櫻坂チャンネル" in title:
        return "Vlog・企画", project or "櫻坂チャンネル"
    if any(word in title for word in (
        "テレビ", "番組", "生配信", "イベント", "サクコイ", "そこ曲がったら", "ちょこさく",
        "ラヴィット", "ロケ地", "撮影場所", "収録場所", "出張リポート",
    )) or project:
        return "番組・イベント", project or "番組・イベント"
    return "Vlog・企画", "その他企画"


def parse_locations(article: Article, html: str) -> list[dict[str, Any]]:
    soup = BeautifulSoup(html, "html.parser")
    body = soup.select_one(".article-body-inner") or soup.select_one(".article-body")
    if body is None:
        return []
    title_node = soup.select_one("h2.article-title")
    title = title_node.get_text(" ", strip=True) if title_node else article.title
    lines = unique(part.strip() for part in body.get_text("\n", strip=True).splitlines())
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

    addresses: list[dict[str, Any]] = []
    coordinates: list[tuple[int, float, float]] = []
    for index, line in enumerate(lines):
        address = clean_address(line)
        if address:
            addresses.append({"index": index, "address": address})
        for match in COORD_RE.finditer(line):
            coordinates.append((index, float(match.group(1)), float(match.group(2))))

    spots: list[dict[str, Any]] = []
    consumed_coordinates: set[int] = set()
    for position, item in enumerate(addresses):
        start = item["index"]
        end = addresses[position + 1]["index"] if position + 1 < len(addresses) else len(lines)
        coord_index = next(
            (i for i, coord in enumerate(coordinates) if i not in consumed_coordinates and start <= coord[0] < end),
            None,
        )
        if coord_index is None:
            coord_index = next(
                (i for i, coord in enumerate(coordinates) if i not in consumed_coordinates and 0 <= start - coord[0] <= 2),
                None,
            )
        lat = lng = None
        if coord_index is not None:
            consumed_coordinates.add(coord_index)
            _, lat, lng = coordinates[coord_index]
        context = " ".join(lines[max(0, start - 3):min(len(lines), end)])[:400]
        if any(term in context for term in PRIVATE_TERMS):
            continue
        spots.append({
            "name": inline_place_name(lines[start], item["address"]) or meaningful_name(lines, start, title),
            "address": item["address"],
            "lat": lat,
            "lng": lng,
        })

    for index, (_, lat, lng) in enumerate(coordinates):
        if index in consumed_coordinates:
            continue
        line_index = coordinates[index][0]
        context = " ".join(lines[max(0, line_index - 3):line_index + 2])[:400]
        if any(term in context for term in PRIVATE_TERMS):
            continue
        spots.append({
            "name": meaningful_name(lines, line_index, title),
            "address": "",
            "lat": lat,
            "lng": lng,
        })

    deduped: dict[str, dict[str, Any]] = {}
    for spot in spots:
        key = spot["address"] or f"{spot['lat']:.6f},{spot['lng']:.6f}"
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


def geocode(spots: list[dict[str, Any]], cache_path: Path, delay: float) -> tuple[int, int]:
    cache: dict[str, Any] = load_json(cache_path, {})
    resolved = failed = 0
    last_request = 0.0
    for spot in spots:
        if spot["lat"] is not None and spot["lng"] is not None:
            continue
        address = spot["address"]
        cached = cache.get(address)
        if cached is None:
            wait = max(0.0, delay - (time.monotonic() - last_request))
            if wait:
                time.sleep(wait)
            url = "https://msearch.gsi.go.jp/address-search/AddressSearch?q=" + urllib.parse.quote(address)
            try:
                request = urllib.request.Request(url, headers={"User-Agent": "SakamichiTools fumi sync/1.0"})
                with urllib.request.urlopen(request, timeout=20) as response:
                    data = json.load(response)
                last_request = time.monotonic()
                cached = data[0]["geometry"]["coordinates"] if data else False
            except (OSError, urllib.error.URLError, KeyError, ValueError, json.JSONDecodeError):
                cached = False
            cache[address] = cached
        if cached:
            spot["lng"], spot["lat"] = float(cached[0]), float(cached[1])
            resolved += 1
        else:
            failed += 1
    atomic_write(cache_path, cache)
    return resolved, failed


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
    parser.add_argument("--max-pages", type=int, default=100)
    parser.add_argument("--max-articles", type=int, default=0, help="调试上限；0=不限")
    parser.add_argument("--cache-dir", type=Path, default=ROOT / ".tmp/fumi-cache")
    parser.add_argument("--request-delay", type=float, default=0.35)
    parser.add_argument("--geocode-delay", type=float, default=0.15)
    parser.add_argument("--no-geocode", action="store_true")
    parser.add_argument("--refresh", action="store_true")
    parser.add_argument("--output", type=Path, default=ROOT / ".tmp/fumi-supplement.geojson")
    parser.add_argument("--report", type=Path, default=ROOT / ".tmp/fumi-supplement-report.json")
    parser.add_argument("--merge-target", type=Path, help="原子更新目标 GeoJSON")
    args = parser.parse_args()

    try:
        tags = args.tags or DEFAULT_TAGS
        fetcher = Fetcher(args.cache_dir, args.request_delay, args.refresh)
        articles = crawl_articles(fetcher, tags, args.cutoff_article_id, args.max_pages)
        if args.max_articles:
            articles = articles[-args.max_articles:]
        print(f"unique articles: {len(articles)}", flush=True)
        spots: list[dict[str, Any]] = []
        failures: list[dict[str, str]] = []
        for index, article in enumerate(articles, 1):
            try:
                html = fetcher.get(article.url, f"articles/{article.article_id}.html")
                spots.extend(parse_locations(article, html))
            except RuntimeError as error:
                failures.append({"url": article.url, "error": str(error)})
            if index % 25 == 0 or index == len(articles):
                print(f"parsed {index}/{len(articles)} articles -> {len(spots)} location candidates", flush=True)

        geocoded = geocode_failed = 0
        if not args.no_geocode:
            geocoded, geocode_failed = geocode(spots, args.cache_dir / "gsi-geocode.json", args.geocode_delay)
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
            "fetchFailures": failures,
        }
        atomic_write(args.report, report)
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return 0 if not failures else 2
    except (OSError, RuntimeError, ValueError, json.JSONDecodeError) as error:
        print(f"sync_fumi_articles.py: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
