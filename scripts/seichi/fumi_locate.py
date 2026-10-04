#!/usr/bin/env python3
"""Find a precise coordinate for a fumi spot that the article did not give and GSI could only place at town level.

The same steps a human takes (validated on the 2026-10-04 cleanup of 51 town-level points), tried in order:
  1. GSI with a cleaned address (labels such as 「住所:」 and building/floor parts removed) → only a lot-level hit
  2. OpenPOI (Overture Maps + food business licences, ~3.4M Japanese POIs, free) by name near the anchor → name check
  3. OpenStreetMap by facility name           → the hit's own name must match the query
  4. Wikidata by facility name (P625)          → same name check
  5. The official page linked next to the spot in the article (and its アクセス/map sub-pages) → embedded map coordinate
Every candidate must lie within RADIUS_M of the town-level anchor AND in the same municipality (GSI reverse geocoder),
its name must essentially equal the query (chain-store names such as 「ローソン 嵐山渡月橋店」 for 渡月橋 fail), and
proxies (bus stops, airport/area centroids) are refused. Linear places (roads, rivers, coasts, 「〇〇沿い」) are never moved:
a name match only gives an arbitrary point on the line. Validated 2026-10-05 against 163 article coordinates.
Results are cached per spot, so the 6-hourly cron makes external requests only for new spots.
"""

from __future__ import annotations

import json
import math
import re
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any, Callable

from fumi_geo import _query as gsi_query, precision

RADIUS_M = 6000
UA = "SakamichiTools-fumi-sync/1.0 (https://github.com/Yoru0908/sakamichi-platform)"
BROWSER_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120 Safari/537.36"
PROXY_TYPES = {"bus_stop", "platform", "aerodrome", "administrative", "city", "town", "village", "suburb", "quarter",
               "neighbourhood", "hamlet", "postcode", "station_area"}
SOCIAL = re.compile(r"instagram|twitter|x\.com|facebook|youtube|tiktok|livedoor|ameblo|sakurazaka46|keyakizaka46", re.I)
EMBED = [(re.compile(r"!3d(-?\d+\.\d+)!2d(-?\d+\.\d+)"), False), (re.compile(r"!2d(-?\d+\.\d+)!3d(-?\d+\.\d+)"), True),
         (re.compile(r"[?&;](?:q|ll|center|daddr)=(-?\d{2}\.\d{4,})(?:,|%2C)\s*(-?\d{3}\.\d{4,})"), False),
         (re.compile(r"@(-?\d{2}\.\d{4,}),(-?\d{3}\.\d{4,})"), False)]
# Large features: their point is a centroid, often far from where the photo was taken. OpenPOI/Wikidata give no extent,
# so such names are left to OSM, whose bounding box tells how far the centroid can be from any spot inside.
AREA_NAME = re.compile(r"(?:公園|庭園|緑地|広場|キャンパス|大学|空港|港|島|ランド|シー|霊園|牧場|動物園|植物園|遊園地|スキー場|ゴルフ\S*)$")
MAX_HALF_DIAGONAL_M = 300
STATION_TYPES = {"station", "train_station", "subway_entrance", "halt", "stop", "stop_position", "tram_stop"}
LINE_CLASSES = {"highway", "waterway", "railway"}
POINT_M = 60  # a hit for a shortened name (「嵐山公園」 for 「嵐山公園 中之島地区」) must be a building-sized object
SUBPAGE = re.compile(r"access|map|location|about|company|info|shop|アクセス|%E3%82%A2%E3%82%AF%E3%82%BB%E3%82%B9", re.I)
_last_call: dict[str, float] = {}


class Unavailable(Exception):
    """A lookup service did not answer: the spot is retried next run, nothing is cached."""


def metres(a: tuple[float, float], b: tuple[float, float]) -> float:
    return math.hypot((a[0] - b[0]) * 111_200, (a[1] - b[1]) * 111_320 * math.cos(math.radians(a[0])))


def compact(text: str) -> str:
    return re.sub(r"[\s・･/／\-ー()（）「」『』〜~、,.]+", "", unicodedata.normalize("NFKC", text or "")).lower()


def name_variants(name: str) -> list[str]:
    """「西日本鉄道天神大牟田線 西鉄柳川駅」→ 西鉄柳川駅; 「彫刻の森美術館 (THE HAKONE …)」→ 彫刻の森美術館; 「JR高崎駅」→ 高崎駅."""
    out = [name]
    for part in re.split(r"\s*[/／、]\s*", name):
        base = re.sub(r"\s*[（(].*$", "", part).strip()
        tokens = base.split()
        for v in [base, *(tokens[:1] + tokens[-1:])]:
            v = re.sub(r"^(?:JR|真言宗\S+?|浄土宗\S+?)\s*", "", v)
            out += [v, SUFFIX.sub("", v)]
    out += [v[:-1] for v in list(out) if v.endswith("駅")]
    return [v for v in dict.fromkeys(v.strip() for v in out) if searchable(v)]


def searchable(variant: str) -> bool:
    """Not a line (road/river/coast: any point on it matches) and not a bare branch name (「紅葉谷店」)."""
    return len(compact(variant)) >= 2 and not LINEAR.search(variant) and not re.fullmatch(r"\S{1,4}店", variant)


SUFFIX = re.compile(r"(?:[東西南北]口|正門|入口|前|付近|横|地区|周辺|エリア|の展望台|の階段)$")
LINEAR = re.compile(r"(?:通り|通|道|街道|線|川|沿い|ロード|遊歩道|海岸|浜|堤|土手|河川敷|並木|商店街|横丁|電車|鉄道|ライン|路)$")


def same_name(found: str, wanted: str) -> bool:
    a, b = compact(found), compact(wanted)
    if not a or not b:
        return False
    if b.endswith("駅") and b[:-1] == a:
        return True
    return (a in b or b in a) and min(len(a), len(b)) / max(len(a), len(b)) >= 0.8


def municipality(where: tuple[float, float]) -> str:
    """Municipality code; "" outside Japan. Raises Unavailable when the reverse geocoder does not answer."""
    body = _http(f"https://mreversegeocoder.gsi.go.jp/reverse-geocoder/LonLatToAddress?lat={where[0]}&lon={where[1]}")
    if not body.startswith("{"):
        raise Unavailable("GSI reverse geocoder")
    return (json.loads(body).get("results") or {}).get("muniCd", "")


def cleaned_addresses(address: str) -> list[str]:
    text = unicodedata.normalize("NFKC", address)
    text = re.sub(r"^(\S+?[都道府県])\s*(?:住所|所在地)\s*[:：]\s*", r"\1", text)
    text = re.sub(r"^(?:住所|所在地)\s*[:：]\s*", "", text)
    lot = re.match(r"^(.*?\d+(?:[-ー−]\d+)*)", text)
    return [v for v in dict.fromkeys([text, lot.group(1) if lot else text]) if v != address]


def _http(url: str, browser: bool = False) -> str:
    """Body, or "" for a definite miss (4xx). API outages raise Unavailable; an official site (browser=True) that is
    down just counts as a miss, so one dead shop page cannot keep a spot undecided forever."""
    request = urllib.request.Request(url, headers={"User-Agent": BROWSER_UA if browser else UA, "Accept-Language": "ja"})
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            return response.read().decode("utf-8", "ignore")
    except urllib.error.HTTPError as error:
        if browser or (400 <= error.code < 500 and error.code != 429):
            return ""
        raise Unavailable(f"{error.code} {url[:60]}") from error
    except Exception as error:
        if browser:
            return ""
        raise Unavailable(f"{error} {url[:60]}") from error


def _paced(host: str) -> None:
    """Nominatim and Wikidata allow about one request per second."""
    wait = 1.1 - (time.monotonic() - _last_call.get(host, 0.0))
    if wait > 0:
        time.sleep(wait)
    _last_call[host] = time.monotonic()


def _nominatim(query: str) -> list[dict[str, Any]]:
    _paced("nominatim")
    body = _http("https://nominatim.openstreetmap.org/search?format=json&limit=8&countrycodes=jp&namedetails=1&q=" + urllib.parse.quote(query))
    return json.loads(body) if body.startswith("[") else []


def by_gsi(spot: dict[str, Any], anchor: tuple[float, float]) -> tuple[tuple[float, float], str] | None:
    for address in cleaned_addresses(spot.get("address") or ""):
        hit = gsi_query(address)
        if hit and precision(hit["title"]) == "lot" and metres((hit["lat"], hit["lng"]), anchor) <= RADIUS_M:
            return (hit["lat"], hit["lng"]), f"gsi {hit['title']}"
    return None


def by_openpoi(spot: dict[str, Any], anchor: tuple[float, float]) -> tuple[tuple[float, float], str] | None:
    for query in name_variants(spot.get("name") or "")[:3]:
        params = urllib.parse.urlencode({"q": query, "center": f"{anchor[1]},{anchor[0]}", "radius": RADIUS_M, "limit": 5})
        body = _http("https://api.openpoiapi.com/v1/search?" + params)
        items = json.loads(body).get("results", []) if body.startswith("{") else []
        for item in items:
            where = (item.get("lat"), item.get("lng"))
            if AREA_NAME.search(compact(item.get("name", ""))):
                continue
            if None in where or not same_name(item.get("name", ""), query) or metres(where, anchor) > RADIUS_M:
                continue
            return where, f"openpoi {item.get('source')} {item.get('name')}"
    return None


def by_osm(spot: dict[str, Any], anchor: tuple[float, float]) -> tuple[tuple[float, float], str] | None:
    for query in name_variants(spot.get("name") or ""):
        for hit in _nominatim(query):
            found = (hit.get("namedetails") or {}).get("name") or hit.get("display_name", "").split(",")[0]
            where = (float(hit["lat"]), float(hit["lon"]))
            if hit.get("type") in PROXY_TYPES or not same_name(found, query) or metres(where, anchor) > RADIUS_M:
                continue
            if not _osm_fits(hit, query, compact(query) != compact(full_name(spot))):
                continue
            return where, f"osm {hit.get('class')}/{hit.get('type')} {found}"
    return None


def full_name(spot: dict[str, Any]) -> str:
    return re.sub(r"\s*[（(].*$", "", spot.get("name") or "").strip()


def _osm_fits(hit: dict[str, Any], query: str, shortened: bool) -> bool:
    """Refuse centroids that are not the photo spot: big areas, lines, and objects of the wrong kind."""
    size = _half_diagonal(hit)
    station = hit.get("type") in STATION_TYPES
    if size > MAX_HALF_DIAGONAL_M or station != query.endswith("駅"):
        return False  # a big area's centroid, or 「戸越公園」 the station for 戸越公園 the park
    if hit.get("class") in LINE_CLASSES and not station:
        return False  # 「花のみち」 footway: any point on the line matches
    if shortened and size > POINT_M:
        return False
    return not (AREA_NAME.search(compact(query)) and size < 20)  # 「豊洲ぐるり公園」 the bicycle rental, not the park


def _half_diagonal(hit: dict[str, Any]) -> float:
    box = [float(v) for v in hit.get("boundingbox") or []]
    return metres((box[0], box[2]), (box[1], box[3])) / 2 if len(box) == 4 else 0.0


def by_wikidata(spot: dict[str, Any], anchor: tuple[float, float]) -> tuple[tuple[float, float], str] | None:
    for query in name_variants(spot.get("name") or "")[:3]:
        _paced("wikidata")
        body = _http("https://www.wikidata.org/w/api.php?action=wbsearchentities&format=json&language=ja&limit=5&search=" + urllib.parse.quote(query))
        for entity in (json.loads(body).get("search", []) if body.startswith("{") else []):
            if not same_name(entity.get("label", ""), query) or AREA_NAME.search(compact(entity.get("label", ""))):
                continue
            _paced("wikidata")
            data = _http(f"https://www.wikidata.org/wiki/Special:EntityData/{entity['id']}.json")
            claims = json.loads(data).get("entities", {}).get(entity["id"], {}).get("claims", {}) if data.startswith("{") else {}
            for claim in claims.get("P625", [])[:1]:
                value = claim["mainsnak"].get("datavalue", {}).get("value", {})
                where = (value.get("latitude"), value.get("longitude"))
                if None not in where and metres(where, anchor) <= RADIUS_M:
                    return where, f"wikidata {entity['id']} {entity.get('label')}"
    return None


def _embedded(page: str, anchor: tuple[float, float]) -> tuple[float, float] | None:
    for pattern, lng_first in EMBED:
        for a, b in pattern.findall(page):
            where = (float(b), float(a)) if lng_first else (float(a), float(b))
            if metres(where, anchor) <= RADIUS_M:
                return where
    return None


def by_site(spot: dict[str, Any], anchor: tuple[float, float]) -> tuple[tuple[float, float], str] | None:
    url = spot.get("siteUrl") or ""
    if not url or SOCIAL.search(url) or AREA_NAME.search(compact(full_name(spot))):
        return None
    page = _http(url, browser=True)
    title = compact(" ".join(re.findall(r"<title[^>]*>(.*?)</title>", page, re.S | re.I)))
    if not any(compact(v) in title for v in name_variants(spot.get("name") or "")):
        return None  # the link next to the spot is not this place's own site (a shrine page for a nearby street)
    found = _embedded(page, anchor)
    if found:
        return found, f"site {url}"
    links = [urllib.parse.urljoin(url, link) for link in re.findall(r'href="([^"#]+)"', page) if SUBPAGE.search(link)]
    for sub in list(dict.fromkeys(links))[:10]:
        found = _embedded(_http(sub, browser=True), anchor)
        if found:
            return found, f"site {sub}"
    return None


STEPS: list[Callable[[dict[str, Any], tuple[float, float]], tuple[tuple[float, float], str] | None]] = [by_gsi, by_openpoi, by_osm, by_wikidata, by_site]


def find(spot: dict[str, Any], anchor: tuple[float, float]) -> tuple[tuple[float, float], str] | None:
    """First step whose answer is in the anchor's municipality; None for linear places or when nothing qualifies."""
    if not name_variants(spot.get("name") or ""):
        return None
    home = municipality(anchor)
    if not home:
        return None  # without a municipality there is nothing to check a hit against
    for step in STEPS:
        result = step(spot, anchor)
        if result and municipality(result[0]) == home:
            return result
    return None


MUNICIPALITY = re.compile(r"^(.+?[都道府県].+?(?:郡.+?[町村]|[市区町村]))")
UNNAMED_TYPES = {"road", "highway", "residential", "house", "yes", "parking", "footway", "path", "service"}


def town_anchor(address: str) -> dict[str, Any] | None:
    """GSI hit for the address cut back to its municipality (「愛知県名古屋市中区栄3丁目…（非公開）」→ 名古屋市中区)."""
    for query in [*cleaned_addresses(address), *(m.group(1) for m in [MUNICIPALITY.match(unicodedata.normalize("NFKC", address))] if m)]:
        hit = gsi_query(query)
        if hit is None:
            raise Unavailable("GSI address search")
        if hit:
            return hit
    return None


def name_here(where: tuple[float, float]) -> str:
    """A label for a spot the article left unnamed: the named OSM object within 40 m, else 「<町丁目>付近」."""
    _paced("nominatim")
    body = _http(f"https://nominatim.openstreetmap.org/reverse?format=json&zoom=18&namedetails=1&lat={where[0]}&lon={where[1]}")
    hit = json.loads(body) if body.startswith("{") else {}
    name = (hit.get("namedetails") or {}).get("name") or hit.get("name") or ""
    if name and hit.get("type") not in UNNAMED_TYPES and metres(where, (float(hit["lat"]), float(hit["lon"]))) <= 40:
        return name
    body = _http(f"https://mreversegeocoder.gsi.go.jp/reverse-geocoder/LonLatToAddress?lat={where[0]}&lon={where[1]}")
    if not body.startswith("{"):
        raise Unavailable("GSI reverse geocoder")
    town = (json.loads(body).get("results") or {}).get("lv01Nm", "").strip()
    return f"{town}付近" if town and town != "－" else ""


def _anchor(spot: dict[str, Any], cache: dict[str, Any]) -> bool:
    if spot.get("lat") is not None or not spot.get("address"):
        return False
    hit = town_anchor(spot["address"])
    if hit:
        spot.update(lat=hit["lat"], lng=hit["lng"], coordSource="gsi", coordPrecision="town")
    return bool(hit)


def _locate(spot: dict[str, Any], cache: dict[str, Any]) -> bool:
    if spot.get("coordPrecision") != "town" or spot.get("lat") is None:
        return False
    key = f"{spot.get('name')}|{spot.get('address')}"
    if key not in cache:
        found = find(spot, (spot["lat"], spot["lng"]))
        cache[key] = {"lat": found[0][0], "lng": found[0][1], "via": found[1]} if found else False
    hit = cache[key]
    if hit:
        spot.update(lat=hit["lat"], lng=hit["lng"], coordSource="lookup", coordPrecision="exact", coordVia=hit["via"])
    return bool(hit)


def _name(spot: dict[str, Any], cache: dict[str, Any]) -> bool:
    if spot.get("name") or spot.get("lat") is None:
        return False
    key = f"@{spot['lat']:.6f},{spot['lng']:.6f}"
    if key not in cache:
        cache[key] = name_here((spot["lat"], spot["lng"]))
    if cache[key]:
        spot.update(name=cache[key], nameSource="position")
    return bool(cache[key])


def resolve(spots: list[dict[str, Any]], cache_path: Path) -> dict[str, int]:
    """After GSI geocoding: anchor spots GSI could not place at their municipality, look up precise coordinates for
    town-level ones, and name unnamed ones from their position. An outage leaves the spot as is and counts as deferred."""
    cache = json.loads(cache_path.read_text(encoding="utf-8")) if cache_path.exists() else {}
    stats = {"anchored": 0, "located": 0, "named": 0, "deferred": 0}
    for spot in spots:
        try:
            for label, step in (("anchored", _anchor), ("located", _locate), ("named", _name)):
                stats[label] += step(spot, cache)
        except Unavailable:
            stats["deferred"] += 1
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    cache_path.write_text(json.dumps(cache, ensure_ascii=False, indent=1), encoding="utf-8")
    return stats
