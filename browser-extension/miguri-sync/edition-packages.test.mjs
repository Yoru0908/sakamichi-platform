import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = fileURLToPath(new URL('../../', import.meta.url));
const dir = mkdtempSync(join(tmpdir(), 'miguri-music-editions-'));
process.on('exit', () => rmSync(dir, { recursive: true, force: true }));
execFileSync('python3', [join(root, 'scripts/build-miguri-extension.py'), '--output', dir, '--version', '1.1.18']);
const read = (locale, name) => execFileSync('unzip', ['-p', join(dir, `miguri-sync-1.1.18-${locale}.zip`), name]).toString();

test('both editions ship identical Music-only runtime and identical two-site permissions', () => {
  const a = JSON.parse(read('zh-CN', 'manifest.json'));
  const b = JSON.parse(read('ja', 'manifest.json'));
  for (const manifest of [a,b]) {
    assert.deepEqual(manifest.content_scripts[0].matches, ['https://46log.com/*', 'https://saka46log.com/*']);
    assert.deepEqual(manifest.content_scripts[1].matches, ['https://fortunemusic.jp/*']);
    assert(!manifest.host_permissions.some(host => host.includes('fortunemeets')));
  }
  for (const name of ['background.js', 'bridge.js', 'official.js']) assert.equal(read('zh-CN', name), read('ja', name));
  assert(!read('ja', 'background.js').includes('importScripts("meets-api.js")'));
});

for (const locale of ['zh-CN','ja']) test(`${locale} supports both sites and refuses Meets`, async () => {
  const tabs = new Map([[1, { id:1, url:'https://46log.com/miguri' }], [2, { id:2, url:'https://saka46log.com/import' }]]);
  const session={}, local={}, created=[]; let receive, click;
  const store = obj => ({ get: async key => ({[key]:obj[key]}),set:async data=>Object.assign(obj,data),remove:async key=>{delete obj[key];} });
  const chrome = { storage:{session:store(session),local:store(local)}, alarms:{clear:async()=>{},get:async()=>null,create:async()=>{},onAlarm:{addListener(){}}},runtime:{onInstalled:{addListener(){}},onStartup:{addListener(){}},onMessage:{addListener(fn){receive=fn;}}},tabs:{get:async id=>tabs.get(id),query:async()=>[],create:async spec=>{const tab={...spec,id:50+created.length};created.push(tab);tabs.set(tab.id,tab);return tab;},update:async()=>{},sendMessage:async()=>{},onRemoved:{addListener(){}}},action:{onClicked:{addListener(fn){click=fn;}},setTitle:async()=>{},setBadgeText:async()=>{},setBadgeBackgroundColor:async()=>{}},windows:{update:async()=>{}} };
  vm.runInNewContext(read(locale,'background.js'),{chrome,URL,crypto:globalThis.crypto,Date,console,fetch:async()=>{throw Error('Unexpected network call');}});
  const send = (id,message,frameId=0) => new Promise(resolve=>receive(message,{url:tabs.get(id).url,frameId,tab:{id}},resolve));
  for (const id of [1,2]) {
    assert.equal((await send(id,{type:'MIGURI46LOG_START',source:'fortunemeets'})).ok,false);
    assert.equal((await send(id,{type:'MIGURI46LOG_START',source:'fortunemusic'},1)).ok,false);
    assert.equal((await send(id,{type:'MIGURI46LOG_START',source:'fortunemusic'})).ok,true);
    assert.equal(session.miguriSyncJob.target,id===1?'46log':'saka46log');
    assert.equal((await send(session.miguriSyncJob.tabId,{type:'MIGURI46LOG_MEETS_API_SYNC'})).ok,false);
    await chrome.storage.session.remove('miguriSyncJob');
    await click(tabs.get(id));
    assert.equal(created.at(-1).url,id===1?'https://46log.com/miguri':'https://saka46log.com/import');
  }
});
