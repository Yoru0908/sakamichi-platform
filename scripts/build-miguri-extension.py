#!/usr/bin/env python3
"""Build two presentation variants from one runtime. Does not publish a store listing."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import zipfile

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'browser-extension/miguri-sync'
BRANDS = {
    'zh-CN': ('46log 咪咕力同步', '仅供46log使用：读取 forTUNE music / Meets 履历。', '46log', 'https://46log.com/*'),
    'ja': ('坂ログ ミーグリ同期', '坂ログ専用：forTUNE musicの個別ミーグリ履歴を読み込み、確認後に保存します。', 'saka46log', 'https://saka46log.com/*'),
}
RUNTIME = ['background.js', 'bridge.js', 'official.js', 'meets-api.js']

def build(output: Path, version: str):
    if not re.fullmatch(r'(?:0|[1-9]\d{0,4})(?:\.(?:0|[1-9]\d{0,4})){0,3}', version) or any(int(p) > 65535 for p in version.split('.')) or not any(int(p) for p in version.split('.')):
        raise ValueError('Use a valid explicitly chosen Chrome version')
    output.mkdir(parents=True, exist_ok=True)
    base = json.loads((SOURCE / 'manifest.json').read_text())
    if 'key' in base or 'update_url' in base:
        raise ValueError('Do not clone a store identity into language candidates')
    files = {name: (SOURCE / name).read_bytes() for name in RUNTIME}
    files.update({f'icons/{p.name}': p.read_bytes() for p in sorted((SOURCE / 'icons').glob('*.png'))})
    reports = []
    marker = b'const EDITION_TARGET = "46log";'
    if files['background.js'].count(marker) != 1:
        raise ValueError('Missing unique edition guard in background.js')
    for locale, (name, description, target, site_match) in BRANDS.items():
        manifest = json.loads(json.dumps(base))
        manifest.update(name=name, description=description, version=version)
        manifest['action']['default_title'] = name
        allowed = {site_match, 'https://fortunemusic.jp/*'}
        if target == '46log':
            allowed.update({'https://api.46log.com/*', 'https://ticket.fortunemeets.app/*', 'https://ticket-api.fortunemeets.app/*'})
        manifest['host_permissions'] = sorted(allowed)
        manifest['content_scripts'][0]['matches'] = [site_match]
        if target == 'saka46log':
            manifest['content_scripts'][1]['matches'] = ['https://fortunemusic.jp/*']
        edition_files = {**files, 'background.js': files['background.js'].replace(marker, f'const EDITION_TARGET = "{target}";'.encode())}
        if target == 'saka46log':
            edition_files.pop('meets-api.js')
            edition_files['background.js'] = edition_files['background.js'].replace(b'importScripts("meets-api.js");', b'// Meets is not available in this edition.')
        contents = {'manifest.json': (json.dumps(manifest, ensure_ascii=False, indent=2) + '\n').encode(), **edition_files}
        path = output / f'miguri-sync-{version}-{locale}.zip'
        with zipfile.ZipFile(path, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
            for filename, data in sorted(contents.items()):
                info = zipfile.ZipInfo(filename, (2026, 9, 18, 0, 0, 0))
                info.compress_type = zipfile.ZIP_DEFLATED
                info.external_attr = 0o100644 << 16
                archive.writestr(info, data)
        reports.append({'locale': locale, 'file': path.name, 'version': version, 'published': False, 'bytes': path.stat().st_size, 'sha256': hashlib.sha256(path.read_bytes()).hexdigest()})
    # Same source, deliberately isolated site permissions and target checks.
    with zipfile.ZipFile(output / reports[0]['file']) as zh, zipfile.ZipFile(output / reports[1]['file']) as ja:
        a, b = json.loads(zh.read('manifest.json')), json.loads(ja.read('manifest.json'))
        assert a['content_scripts'][0]['matches'] == ['https://46log.com/*']
        assert b['content_scripts'][0]['matches'] == ['https://saka46log.com/*']
        assert 'https://46log.com/*' not in b['host_permissions']
        assert 'https://saka46log.com/*' not in a['host_permissions']
        assert b'const EDITION_TARGET = "46log";' in zh.read('background.js')
        assert b'const EDITION_TARGET = "saka46log";' in ja.read('background.js')
        assert 'meets-api.js' not in ja.namelist() and 'meets-api.js' in zh.namelist()
    (output / 'miguri-candidates.json').write_text(json.dumps({'packages': reports, 'runtimeIdentical': False}, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(reports, ensure_ascii=False, indent=2))

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', required=True, type=Path)
    parser.add_argument('--version', required=True, help='Explicit candidate version; this command never submits to the store')
    args = parser.parse_args()
    build(args.output.resolve(), args.version)
