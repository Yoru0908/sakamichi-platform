import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = fileURLToPath(new URL('../../', import.meta.url));
const dir = mkdtempSync(join(tmpdir(), 'miguri-editions-'));
execFileSync('python3', [join(root, 'scripts/build-miguri-extension.py'), '--output', dir, '--version', '1.1.18']);
  for (const [locale, own, other, ownId, otherId] of [
    ['zh-CN', '46log', 'saka46log', 1, 2],
    ['ja', 'saka46log', '46log', 2, 1],
  ]) {
    test(`${locale} is bound to ${own}: manifest, sender, toolbar and auto policy`, async () => {
      const zip = join(dir, `miguri-sync-1.1.18-${locale}.zip`);
      const read = name => execFileSync('unzip', ['-p', zip, name]).toString();
      const manifest = JSON.parse(read('manifest.json'));
      const ownHost = own === '46log' ? 'https://46log.com/*' : 'https://saka46log.com/*';
      const otherHost = other === '46log' ? 'https://46log.com/*' : 'https://saka46log.com/*';
      assert.deepEqual(manifest.content_scripts[0].matches, [ownHost]);
      assert(manifest.host_permissions.includes(ownHost));
      assert(!manifest.host_permissions.includes(otherHost));
      if (locale === 'ja') {
        assert(!manifest.host_permissions.some(host => host.includes('fortunemeets')));
        assert.deepEqual(manifest.content_scripts[1].matches, ['https://fortunemusic.jp/*']);
      }
      const tabs = new Map([[1, { id: 1, url: 'https://46log.com/miguri' }], [2, { id: 2, url: 'https://saka46log.com/import' }]]);
      const created = [], session = {}, local = {};
      let receive, click;
      const store = obj => ({ get: async key => ({ [key]: obj[key] }), set: async data => Object.assign(obj, data), remove: async key => { delete obj[key]; } });
      const chrome = {
        storage: { session: store(session), local: store(local) },
        alarms: { clear: async () => {}, get: async () => null, create: async () => {}, onAlarm: { addListener() {} } },
        runtime: { onInstalled: { addListener() {} }, onStartup: { addListener() {} }, onMessage: { addListener(fn) { receive = fn; } } },
        tabs: { get: async id => tabs.get(id), query: async () => [], create: async spec => { created.push(spec); return { ...spec, id: 3 }; }, update: async () => {}, sendMessage: async () => {}, onRemoved: { addListener() {} } },
        action: { onClicked: { addListener(fn) { click = fn; } }, setTitle: async () => {}, setBadgeText: async () => {}, setBadgeBackgroundColor: async () => {} },
        windows: { update: async () => {} },
      };
      vm.runInNewContext(read('background.js'), { chrome, importScripts() {}, URL, crypto: globalThis.crypto, Date, console, fetch: async () => { throw Error('No external fetch'); } });
      const send = (id, message, frameId = 0) => new Promise(resolve => receive(message, { url: tabs.get(id).url, frameId, tab: { id } }, resolve));
      assert.equal((await send(otherId, { type: 'MIGURI46LOG_START', source: 'fortunemusic' })).ok, false);
      assert.equal((await send(ownId, { type: 'MIGURI46LOG_START', source: 'fortunemusic' }, 1)).ok, false);
      assert.equal((await send(ownId, { type: 'MIGURI46LOG_START', source: 'fortunemusic' })).ok, true);
      assert.equal(session.miguriSyncJob.target, own);
      assert.equal((await send(otherId, { type: 'MIGURI46LOG_TAKE_RESULT' })).ok, false);
      if (locale === 'ja') assert.equal((await send(ownId, { type: 'MIGURI46LOG_RUN_AUTO' })).ok, false);
      await click(tabs.get(otherId));
      assert.equal(created.at(-1).url, own === '46log' ? 'https://46log.com/miguri' : 'https://saka46log.com/import');
    });
  }
process.on('exit', () => rmSync(dir, { recursive: true, force: true }));
