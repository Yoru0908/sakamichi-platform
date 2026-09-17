#!/usr/bin/env python3
"""Offline comparison of a public SakuMap spots_list snapshot. No network or cron.
Only explicitly reviewed public venue IDs may be published. Existing maps are read-only.
"""
import argparse
import json
import math
import re
import unicodedata
from pathlib import Path

SOURCE = 'https://buddies46.stars.ne.jp/satellite/sakumap/'
REVIEWED_IDS = {319, 307, 221, 90, 58, 369, 289, 125, 351, 349, 343, 342, 341, 340, 132, 134, 162, 306, 100, 243}

def normalized(value):
    return re.sub(r'[\W_]+', '', unicodedata.normalize('NFKC', value or '').lower())

def distance(a, b):
    lng, lat = a
    lng2, lat2 = b
    value = math.sin(math.radians(lat2-lat)/2)**2 + math.cos(math.radians(lat))*math.cos(math.radians(lat2))*math.sin(math.radians(lng2-lng)/2)**2
    return 6371000 * 2 * math.asin(min(1, math.sqrt(value)))

def compare(spots, existing):
    rows = []
    for spot in spots:
        point = [float(spot['lng']), float(spot['lat'])]
        if not all(math.isfinite(v) for v in point) or not (-180 <= point[0] <= 180 and -90 <= point[1] <= 90):
            raise ValueError('Invalid coordinates: ' + str(spot['id']))
        name = normalized(spot['title'])
        nearest = min(existing, key=lambda f: distance(point, f['geometry']['coordinates'][:2]))
        meters = distance(point, nearest['geometry']['coordinates'][:2])
        same = [f for f in existing if normalized(f['properties']['name']) == name]
        status = 'candidate'
        if same:
            gap = min(distance(point, f['geometry']['coordinates'][:2]) for f in same)
            status = 'same-name-coordinate-review' if gap > 200 else 'existing-name'
        elif meters <= 50:
            status = 'near-existing-review'  # proximity is not proof of duplication
        elif meters <= 250:
            status = 'nearby-review'
        rows.append({'id': spot['id'], 'name': spot['title'], 'status': status,
                     'sourceUrl': SOURCE + '?spot=' + str(spot['id']),
                     'nearest': {'name': nearest['properties']['name'], 'meters': round(meters)},
                     'prefecture': spot.get('prefecture', '')})
    return rows

def feature(spot, member_names):
    key = 'sakumap:' + str(spot['id'])
    videos = [video for video in spot.get('youtube_video_ids', []) if re.fullmatch(r'[\w-]{11}', video)]
    tags = [str(tag) for tag in spot.get('tags', [])]
    summary = str(spot.get('summary', ''))
    category = 'SakuMap 補足'
    return {'type': 'Feature', 'geometry': {'type': 'Point', 'coordinates': [float(spot['lng']), float(spot['lat'])]},
            'properties': {'id': key, 'sourceKey': key, 'name': spot['title'],
                'category': category, 'subcategory': summary or '公開スポット', 'categoryColor': '#a855f7',
                'address': spot.get('address', ''), 'prefecture': spot.get('prefecture', ''),
                'sceneTitle': summary, 'sceneNote': 'SakuMap の公開投稿を参考に補足。撮影・訪問の関係は出典参照（独立した映像検証は未実施）。',
                'sourceLabel': 'SakuMap（ひろまめ。／公開投稿）', 'sourceUrl': SOURCE + '?spot=' + str(spot['id']),
                'referenceUrl': 'https://www.youtube.com/watch?v=' + videos[0] if videos else SOURCE + '?spot=' + str(spot['id']),
                'tags': tags, 'members': [tag.replace(' ', '').replace('　', '') for tag in tags if normalized(tag) in member_names],
                'images': [],
                'source': {'provider': 'SakuMap', 'url': SOURCE + '?spot=' + str(spot['id']), 'name': spot['title'], 'tags': tags},
                'classification': {'category': category, 'method': 'public-source-reviewed-location', 'status': 'source-referenced'}}}

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--snapshot', type=Path, required=True)
    parser.add_argument('--maps-dir', type=Path, required=True)
    parser.add_argument('--report', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    payload = json.loads(args.snapshot.read_text())
    assert payload.get('ok') is True
    spots = payload['data']
    assert 1 <= len(spots) <= 5000 and len({s['id'] for s in spots}) == len(spots)
    existing = []
    for path in sorted(args.maps_dir.glob('*.geojson')):
        if path.name.startswith(('sakumap-', 'japan-prefectures')):
            continue
        for f in json.loads(path.read_text())['features']:
            if f['geometry']['type'] == 'Point': existing.append(f)
    rows = compare(spots, existing)
    member_file = args.maps_dir.parent / 'data/member-images.json'
    member_names = {normalized(name) for name in json.loads(member_file.read_text())['images']}
    selected = []
    for spot, row in zip(spots, rows):
        if spot['id'] not in REVIEWED_IDS: continue
        if row['status'] != 'candidate':
            raise ValueError(f"Reviewed ID {spot['id']} now overlaps existing data: {row}")
        selected.append(feature(spot, member_names))
    assert len(selected) == len(REVIEWED_IDS)
    counts = {status: sum(row['status'] == status for row in rows) for status in sorted({row['status'] for row in rows})}
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps({'source': SOURCE, 'sourceCount': len(spots), 'comparisonCounts': counts,
        'warning': 'Name/proximity matching is advisory, not verified duplication. Only reviewed public venues published; no source photos copied.',
        'importedIds': sorted(REVIEWED_IDS), 'rows': rows}, ensure_ascii=False, indent=2) + '\n')
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps({'type': 'FeatureCollection', 'features': sorted(selected, key=lambda f: f['properties']['id'])}, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'counts': counts, 'published': len(selected)}, ensure_ascii=False))

if __name__ == '__main__': main()
