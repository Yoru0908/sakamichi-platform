#!/usr/bin/env python3
"""Generic place extraction from a Japanese location-list article: structure finds anchors, Jev ranks names.

Not tied to one blog: an anchor is a Japanese address line or a coordinate line; the text lines above an anchor
(up to WINDOW, stopping at the previous anchor) and two generic reductions of each — the head before 「、」 and the X
of 「Xに来ました/Xで撮影」 — are its name candidates. Generic Japanese filters (fumi_names.name_like: sentences,
prices, dates, emoji, people, address lines) drop impossible candidates; Jev (TypeSafe) is asked, per anchor and
candidate *in context*, "is this the name of the place this anchor refers to?", and the nearest valid line gets a
layout prior (a list entry's name usually sits right above its address). Jev's absolute scores are unreliable for
unknown small places (「south」 0.03 next to its own studio address), so only its ranking is used.

Without Jev (no key / API down) every score is 0 and the nearest valid line wins — the old rule parser's behaviour.
Full-corpus comparison with the rule parser (368 articles, 2026-10-05): empty names 45 → 35, address/coordinate
mis-pairs > 1 km 5 → 4, curated-name ground truth 21/34 both; of the 22 changed names almost all were improvements
(「家康の湯、JR熱海駅前にある足湯」→「家康の湯」, 「出演者」→「三崎漁港」, empty →「宮島口旅客ターミナル」).
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import sys
import urllib.request
from pathlib import Path
from typing import Any

from fumi_names import (ARRIVAL_PLACE_RE, CONTINUATION_PREFIXES, COORD_RE, POSTAL_RE, PREFECTURE_ADDRESS_RE, TITLE_LIKE_RE,
                        URL_RE, clean_address, derived_name_ok, inline_place_name, name_like)

WINDOW = 7
PRIOR = 0.4
MIN_OTHER = 0.1
JEV_URL = "https://api.typesafe.ai/v1/systemone"
MARK = re.compile(r"^[\s📍📌🏠🚩★☆●○◆◇■□▶▷→・\-*#]+|[\s\U0001F000-\U0001FAFF☀-➿]+$")
NARRATION = re.compile(r"^(?:.*?[はで、])?(.{2,30}?)(?:前)?(?:で撮影|に到着|に着きました|に来ました|へ移動|を通過)")
QUESTION = ("Is `candidate` the name of the specific place that `anchor` (an address or a GPS coordinate in a filming-location "
            "blog) refers to — a usable map-pin label such as a facility, shop, station, park, road, building or a precise "
            "spot (「〇〇前」「〇〇の階段」)? `nearby_lines` are the article lines around the anchor, nearest last. Answer no if "
            "the candidate is a sentence, a caption about what is in the photo, an article title, a person, a date or a "
            "price, or if it names a different place than the anchor.")


def join_continuations(lines: list[str]) -> list[str]:
    """「橫濱媽祖廟」+「前 / 南門シルクロード」 (a link split the label) → one line. Keeps every other line as is."""
    out: list[str] = []
    for line in lines:
        if out and line.startswith(CONTINUATION_PREFIXES) and kind(out[-1]) == "text":
            out[-1] += line
        else:
            out.append(line)
    return out


def kind(line: str) -> str:
    if COORD_RE.search(line):
        return "coord"
    if POSTAL_RE.search(line) or PREFECTURE_ADDRESS_RE.match(line):
        return "address"
    return "url" if URL_RE.match(line) else "text"


def above(kinds: list[str], i: int) -> list[int]:
    """Text lines above anchor i, nearest first, stopping at the previous anchor."""
    out = []
    for j in range(i - 1, max(i - 1 - WINDOW, -1), -1):
        if kinds[j] in ("coord", "address"):
            break
        if kinds[j] == "text":
            out.append(j)
    return out


def variants(line: str) -> list[str]:
    line = MARK.sub("", line).strip()
    out = [line]
    head = re.split(r"[、。，]|,\s", line)[0].strip()
    if 2 <= len(head) < len(line):
        out.append(head)
    for pattern in (NARRATION, ARRIVAL_PLACE_RE):
        match = pattern.search(line)
        if match:
            out.append(match.group(1).strip())
    return [v for v in dict.fromkeys(out) if 2 <= len(v) <= 60]


def question_key(anchor: str, candidate: str) -> str:
    """Includes the prompt, so a reworded QUESTION is re-asked instead of reusing answers to a different question."""
    return hashlib.sha1(f"{QUESTION}\x00{anchor}\x00{candidate}".encode()).hexdigest()[:16]


class Article:
    """Lines of one article with their anchor kinds and the valid name candidates of every anchor."""

    def __init__(self, lines: list[str], title: str):
        self.title = title
        self.lines = join_continuations(lines)
        self.kinds = [kind(line) for line in self.lines]

    def candidates(self, i: int) -> list[tuple[int, int, str]]:
        """(distance rank, line index, text) of every valid candidate for anchor i."""
        out = []
        for rank, j in enumerate(above(self.kinds, i)):
            if self.lines[j] == self.title:
                continue
            whole = MARK.sub("", self.lines[j]).strip()
            if TITLE_LIKE_RE.search(whole):
                continue  # a profile / title / date line yields no name, not even its head (「立教大学2年生、19歳」)
            out += [(rank, j, v) for v in variants(self.lines[j])
                    if (name_like(v, self.title) if v == whole else derived_name_ok(v, self.title))]
        return out

    def questions(self) -> dict[str, dict[str, Any]]:
        out = {}
        for i, k in enumerate(self.kinds):
            if k not in ("coord", "address"):
                continue
            for _, _, v in self.candidates(i):
                out[question_key(self.lines[i], v)] = {"type": "noul", "instructions": {
                    "anchor": self.lines[i], "nearby_lines": self.lines[max(0, i - 5):i], "candidate": v,
                    "article_title": self.title, "question": QUESTION}}
        return out

    def name(self, i: int, scores: dict[str, float]) -> str:
        cands = self.candidates(i)
        if not cands:
            return ""
        nearest = min(rank for rank, _, _ in cands)
        best: tuple[float, str] | None = None
        for rank, _, v in cands:
            jev = scores.get(question_key(self.lines[i], v), 0.0)
            if rank != nearest and jev < MIN_OTHER:
                continue
            value = jev + (PRIOR if rank == nearest else 0.0) - 0.02 * rank
            if best is None or value > best[0]:
                best = (value, v)
        return best[1] if best else ""

    def site_url(self, i: int) -> str:
        """The link of this entry: a URL line among the three above the anchor, not past the previous anchor."""
        for j in range(i - 1, max(i - 4, -1), -1):
            if self.kinds[j] in ("coord", "address"):
                return ""
            if self.kinds[j] == "url":
                return self.lines[j]
        return ""


def extract(lines: list[str], title: str, scores: dict[str, float]) -> list[dict[str, Any]]:
    """Spots {name, address, lat, lng, siteUrl, anchor} in article order (addresses first, then lone coordinates)."""
    art = Article(lines, title)
    kinds, text = art.kinds, art.lines
    spots, used = [], set()
    for i, k in enumerate(kinds):
        if k != "address":
            continue
        end = next((x for x in range(i + 1, len(text)) if kinds[x] == "address"), len(text))
        coord = next((x for x in range(i + 1, end) if kinds[x] == "coord" and x not in used), None)
        if coord is not None:
            own = art.name(coord, scores)
            if own and any(own in text[j] for j in range(i + 1, coord) if kinds[j] == "text"):
                coord = None  # a newly named place sits between the address and this coordinate
        lat = lng = None
        if coord is not None:
            used.add(coord)
            match = COORD_RE.search(text[coord])
            lat, lng = float(match.group(1)), float(match.group(2))
        address = clean_address(text[i]) or ""
        spots.append({"name": inline_place_name(text[i], address) or art.name(i, scores), "address": address,
                      "lat": lat, "lng": lng, "siteUrl": art.site_url(i), "anchor": i, "lines": text})
    for i, k in enumerate(kinds):
        if k == "coord" and i not in used:
            match = COORD_RE.search(text[i])
            spots.append({"name": art.name(i, scores), "address": "", "lat": float(match.group(1)),
                          "lng": float(match.group(2)), "siteUrl": "", "anchor": i, "lines": text})
    return spots


class JevScorer:
    """Batched, cached TypeSafe noul answers. No key → no scores (layout rule); an API error sets `failed`."""

    def __init__(self, cache_path: Path, env_path: Path | None = None):
        self.cache_path = cache_path
        self.scores: dict[str, float] = json.loads(cache_path.read_text()) if cache_path.exists() else {}
        self.key = os.environ.get("TYPESAFE_API_KEY") or self._key_from(env_path)
        self.failed = False  # set on an API error: this run's names are layout fallbacks and must not be published

    @staticmethod
    def _key_from(env_path: Path | None) -> str:
        if not env_path or not env_path.exists():
            return ""
        return next((line.split("=", 1)[1].strip() for line in env_path.read_text().splitlines()
                     if line.startswith("TYPESAFE_API_KEY=")), "")

    def score(self, lines: list[str], title: str) -> dict[str, float]:
        pending = {k: q for k, q in Article(lines, title).questions().items() if k not in self.scores}
        keys = list(pending)
        for n in range(0, len(keys) if self.key else 0, 40):
            chunk = keys[n:n + 40]
            body = {"state": {"task": "Name the places in a Japanese filming-location blog article"}, "model": "jev-latest",
                    "questions": {f"q{x}": pending[k] for x, k in enumerate(chunk)}}
            request = urllib.request.Request(JEV_URL, data=json.dumps(body).encode(),
                                             headers={"Authorization": f"Bearer {self.key}", "Content-Type": "application/json"})
            try:
                with urllib.request.urlopen(request, timeout=240) as response:
                    answers = json.load(response).get("answers", {})
            except Exception as exc:  # naming falls back to the layout rule; the crawl itself must not fail
                print(f"place_extract: Jev call failed: {exc}", file=sys.stderr)
                self.failed = True
                break
            for q, answer in answers.items():
                self.scores[chunk[int(q[1:])]] = answer.get("noul", 0.0)
        return self.scores

    def save(self) -> None:
        self.cache_path.parent.mkdir(parents=True, exist_ok=True)
        self.cache_path.write_text(json.dumps(self.scores))
