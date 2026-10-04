#!/usr/bin/env python3
"""Line-level rules for fumi articles: what is an address, a coordinate, a place name, and which coordinate
belongs to which address. Tuned on all ~370 fumi articles (2026-10-04): mis-paired address/coordinate 10 → 5
(the rest are photo spots inside a large facility), Jev-judged non-place labels 14% → 9%; a spot without a usable
name gets "" and is held for review instead of being published with a sentence or title as its label."""

from __future__ import annotations

import re

from fumi_members import SAKURAZAKA_MEMBERS

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
# Lines that are never a place name: sentences/profiles (punctuation), article titles and section labels.
# Not a label: prices, polite verb endings, route narration (「…て、」), dangling 「、」, dates, emoji,
# leading particles/time words, bare postcodes and overseas addresses (Taiwan 「…路…號」, Korean 「…특별시…」).
NOT_NAME_RE = re.compile(
    r"\d[\d,]*円|(?:ました|です|ます)$|て、|、$|^\d{1,2}月\d{1,2}日|[\U0001F000-\U0001FAFF\u263A]"
    r"|^の(?=[ァ-ヶ一-龯])|^(?:今日|昨日|明日|今回|今年|今度)"
    r"|^[\d\s\-]+$|^\d{3}\s?\S*[市縣區]|[路街巷段]\S*\d+號|[가-힣]+(?:시|구|로|길)\s?\d"
)
CONTINUATION_PREFIXES = ("前", "横", "裏", "付近", "沿い", "/", "／")
NOT_NAME_MARKS = ("。", "！", "？", "!", "?", "：", ":")
# Narration that the author moved on to another place: a coordinate after it is not the address above it.
TITLE_LIKE_RE = re.compile(r"撮影場所$|を撮影$|収録場所$|^\d{4}[.年]|^episode\b|^(?:blog|vlog)$|\d+歳$", re.I)
# A name cut out of a sentence must end like a noun (「交差点を渡したら」「何故ここ」 do not).
NOUN_END_RE = re.compile(r"[一-龯々〆ァ-ヶーA-Za-z0-9)）」』]$")
# 「代々木公園に到着しました。」 → 代々木公園 (an optional leading 「今日は」/「そして、」 is dropped).
ARRIVAL_PLACE_RE = re.compile(r"(?:^.*[は、])?([^、。！？!?]{2,30}?)(?:に|へ)(?:到着|着きました|来ました|来ています|やってきました|やって来ました)")


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


def name_like(value: str, title: str) -> bool:
    """A line that can be a pin label: not narration, a title, a profile/member line, a URL or a section label."""
    if not value or URL_RE.match(value) or value.startswith(("説明", "※", "歌唱メンバー", "ちなみに")):
        return False
    if value in {"住所", "撮影場所", "不明", "私道", "ダンスシーン", "他"} or value == title or TITLE_LIKE_RE.search(value):
        return False
    if mentions_member(value) or any(mark in value for mark in NOT_NAME_MARKS) or NOT_NAME_RE.search(value):
        return False
    if value.count("(") > value.count(")") or value.count("（") > value.count("）"):
        return False
    return 2 <= len(value) <= 60 and bool(re.search(r"[A-Za-z0-9ぁ-んァ-ヶ一-龯]", value))


def derived_name_ok(value: str, title: str) -> bool:
    return name_like(value, title) and bool(NOUN_END_RE.search(value))


def mentions_member(value: str) -> bool:
    compact = re.sub(r"\s+", "", value)
    return any(member in compact for member in SAKURAZAKA_MEMBERS)
