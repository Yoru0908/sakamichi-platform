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
    'zh-CN': ('46log 咪咕力同步', '读取 forTUNE music / Meets 履历。支持46log与坂ログ；坂ログ保存和统计贡献分别确认。'),
    'ja': ('46log ミーグリ同期', 'forTUNE music / Meetsの応募履歴を読み込み。46log・坂ログに対応し、坂ログでは保存と統計協力を別々に確認します。'),
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
    # Byte parity, not just a promise that separate language copies are equivalent.
    with zipfile.ZipFile(output / reports[0]['file']) as zh, zipfile.ZipFile(output / reports[1]['file']) as ja:
        assert zh.namelist() == ja.namelist()
        for name in zh.namelist():
            if name != 'manifest.json':
                assert zh.read(name) == ja.read(name), name
        a, b = json.loads(zh.read('manifest.json')), json.loads(ja.read('manifest.json'))
        for value in (a, b):
            value.pop('name'); value.pop('description'); value['action'].pop('default_title')
        assert a == b, 'Language must not change capabilities, permissions, source versions or routing'
    (output / 'miguri-candidates.json').write_text(json.dumps({'packages': reports, 'runtimeIdentical': True}, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(reports, ensure_ascii=False, indent=2))

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', required=True, type=Path)
    parser.add_argument('--version', required=True, help='Explicit candidate version; this command never submits to the store')
    args = parser.parse_args()
    build(args.output.resolve(), args.version)
