#!/usr/bin/env python3
"""Build a facts-only release-date lookup from the public Sony discography API.
No runtime scraping, artwork copying or changes to managed location data.
Requires an explicit cache directory; bounded cache and at most 3 concurrent requests.
"""
import argparse
import concurrent.futures
import datetime
import json
import re
import time
import urllib.request
from pathlib import Path

BASE = 'https://www.sonymusic.co.jp/json/v2/artist/'
GROUPS = {'sakurazaka46': '櫻坂46', 'hinatazaka46': '日向坂46', 'keyakizaka46': '欅坂46'}

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--cache-dir', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    args.cache_dir.mkdir(parents=True, exist_ok=True)
    def fetch(path):
        cache = args.cache_dir / (path.replace('/', '_') + '.json')
        if cache.exists():
            return json.loads(cache.read_text())
        files = list(args.cache_dir.glob('*.json'))
        if len(files) >= 400 or sum(p.stat().st_size for p in files) > 50_000_000:
            raise RuntimeError('Cache limit reached; use a fresh explicit cache directory')
        time.sleep(0.35)
        req = urllib.request.Request(BASE + path, headers={'User-Agent': 'SeichiReleaseCatalog/1.0'})
        with urllib.request.urlopen(req, timeout=35) as response:
            text = response.read(2_000_001).decode()
        if len(text) > 2_000_000: raise ValueError('Oversize response')
        # JSONP wrapper only; never execute third-party JavaScript.
        payload = json.loads(text[text.index('(') + 1:text.rindex(')')])
        cache.write_text(json.dumps(payload, ensure_ascii=False))
        return payload
    records = []
    jobs = []
    for artist in GROUPS:
        seen = set()
        for start in (0, 100, 200, 300):
            rows = fetch(f'{artist}/discography/start/{start}/count/100')['items']
            if not rows: break
            fresh = [r for r in rows if r['representative_goods_number'] not in seen]
            if not fresh: break
            for row in fresh:
                code = row['representative_goods_number']
                seen.add(code)
                if row['type'] in ['シングル', 'アルバム']:
                    jobs.append((artist, code))
            if len(rows) < 100: break
        else:
            raise RuntimeError('Discography pagination cap reached')
    def detail(job):
        artist, code = job
        item = fetch(f'{artist}/discography/{code}')['items']
        date = item['release_date'].replace('.', '-')
        datetime.date.fromisoformat(date)
        tracks = []
        for disc in item.get('discs', []):
            # Disc 2+ can be concerts/bonus films, not first-release song dates.
            if disc.get('disc_number') != 1: continue
            for track in disc.get('contents', []):
                title = track['title'].strip()
                if not title or re.search(r'off.?vocal|instrumental|overture|karaoke', title, re.I): continue
                tracks.append({'group': GROUPS[artist], 'title': title, 'date': date,
                               'sourceUrl': f'https://www.sonymusic.co.jp/artist/{artist}/discography/{code}'})
        return tracks
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        for i, tracks in enumerate(pool.map(detail, jobs), 1):
            records.extend(tracks)
            if i % 20 == 0: print(f'Validated {i}/{len(jobs)} editions', flush=True)
    earliest = {}
    for item in records:
        key = (item['group'], item['title'])
        if key not in earliest or item['date'] < earliest[key]['date']: earliest[key] = item
    output = {'dateBasis': 'Earliest catalogued CD song release within the artist discography; NOT MV upload or filming date.',
              'source': 'Sony Music official public discography',
              'tracks': sorted(earliest.values(), key=lambda x: (x['group'], x['date'], x['title']))}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(output, ensure_ascii=False, indent=2) + '\n')
    print('Saved', len(output['tracks']), 'release facts from', len(jobs), 'editions')

if __name__ == '__main__': main()
