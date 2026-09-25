#!/usr/bin/env python3
"""Build two identically capable, Music-only presentation variants. Never submits to a store."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import zipfile

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'browser-extension/miguri-sync'
BRANDS = {
    'zh-CN': ('46log 咪咕力同步', '读取 forTUNE music 履历；支持 46log 和坂ログ。'),
    'ja': ('坂ログ ミーグリ同期', 'forTUNE musicの応募履歴を読み込み。46logと坂ログの両方に対応します。'),
}
RUNTIME = ['background.js', 'bridge.js', 'official.js']
SITES = ['https://46log.com/*', 'https://saka46log.com/*']
HOSTS = set(SITES + ['https://api.46log.com/*', 'https://fortunemusic.jp/*'])

def build(output: Path, version: str):
    if not re.fullmatch(r'(?:0|[1-9]\d{0,4})(?:\.(?:0|[1-9]\d{0,4})){0,3}', version) or any(int(p) > 65535 for p in version.split('.')) or not any(int(p) for p in version.split('.')):
        raise ValueError('Use a valid explicitly chosen Chrome version')
    output.mkdir(parents=True, exist_ok=True)
    base = json.loads((SOURCE / 'manifest.json').read_text())
    if 'key' in base or 'update_url' in base:
        raise ValueError('Do not clone a store identity into language candidates')
    if set(base['host_permissions']) != HOSTS or base['content_scripts'][0]['matches'] != SITES or base['content_scripts'][1]['matches'] != ['https://fortunemusic.jp/*']:
        raise ValueError('Both sites and Music-only access must match the reviewed source manifest')
    files = {name: (SOURCE / name).read_bytes() for name in RUNTIME}
    files.update({f'icons/{p.name}': p.read_bytes() for p in sorted((SOURCE / 'icons').glob('*.png'))})
    reports = []
    for locale, (name, description) in BRANDS.items():
        manifest = json.loads(json.dumps(base))
        manifest.update(name=name, description=description, version=version)
        manifest['action']['default_title'] = name
        contents = {'manifest.json': (json.dumps(manifest, ensure_ascii=False, indent=2) + '\n').encode(), **files}
        path = output / f'miguri-sync-{version}-{locale}.zip'
        with zipfile.ZipFile(path, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
            for filename, data in sorted(contents.items()):
                info = zipfile.ZipInfo(filename, (2026, 9, 18, 0, 0, 0))
                info.compress_type = zipfile.ZIP_DEFLATED
                info.external_attr = 0o100644 << 16
                archive.writestr(info, data)
        reports.append({'locale': locale, 'file': path.name, 'version': version, 'published': False, 'bytes': path.stat().st_size, 'sha256': hashlib.sha256(path.read_bytes()).hexdigest()})
    with zipfile.ZipFile(output / reports[0]['file']) as zh, zipfile.ZipFile(output / reports[1]['file']) as ja:
        assert zh.namelist() == ja.namelist()
        for filename in zh.namelist():
            if filename != 'manifest.json':
                assert zh.read(filename) == ja.read(filename), filename
        a, b = json.loads(zh.read('manifest.json')), json.loads(ja.read('manifest.json'))
        for manifest in (a, b):
            assert set(manifest['host_permissions']) == HOSTS
            assert manifest['content_scripts'][0]['matches'] == SITES
            assert manifest['content_scripts'][1]['matches'] == ['https://fortunemusic.jp/*']
            manifest.pop('name'); manifest.pop('description'); manifest['action'].pop('default_title')
        assert a == b, 'Language must not change permissions, capabilities or routing'
        assert 'meets-api.js' not in zh.namelist()
    (output / 'miguri-candidates.json').write_text(json.dumps({'packages': reports, 'runtimeIdentical': True}, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(reports, ensure_ascii=False, indent=2))

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', required=True, type=Path)
    parser.add_argument('--version', required=True, help='Explicit candidate version; this command never submits to the store')
    args = parser.parse_args()
    build(args.output.resolve(), args.version)
