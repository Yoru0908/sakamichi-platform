#!/usr/bin/env python3
"""Category/subcategory of a fumi article from its title and tags (split out of sync_fumi_articles.py)."""

from __future__ import annotations

import re
from typing import Iterable

from fumi_members import SAKURAZAKA_MEMBERS


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
