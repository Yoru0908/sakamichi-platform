import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const source=readFileSync(new URL('../../browser-extension/miguri-sync/background.js',import.meta.url),'utf8');
function harness(tabs=[],target='46log'){let click;const created=[],updated=[],queries=[];const store={get:async()=>({}),set:async()=>{},remove:async()=>{}};const chrome={storage:{local:store,session:store},alarms:{clear:async()=>{},onAlarm:{addListener(){}}},runtime:{onInstalled:{addListener(){}},onStartup:{addListener(){}},onMessage:{addListener(){}}},tabs:{onRemoved:{addListener(){}},query:async q=>{queries.push(q.url);return tabs;},create:async t=>created.push(t),update:async(id,change)=>updated.push({id,...change})},windows:{update:async()=>{}},action:{onClicked:{addListener(fn){click=fn;}}}};vm.runInNewContext(source.replace('const EDITION_TARGET = "46log";',`const EDITION_TARGET = "${target}";`),{chrome,importScripts(){},URL,Date,crypto:globalThis.crypto});return {click,created,updated,queries};}
test('toolbar destination is pinned to package edition, regardless of active site',async()=>{
 for(const target of ['46log','saka46log']) for(const url of ['https://saka46log.com/results','https://46log.com/miguri','https://saka46log.com.evil.invalid/import']){
  const h=harness([],target);await h.click({url});assert.equal(h.created[0].url,target==='46log'?'https://46log.com/miguri':'https://saka46log.com/import');assert.equal(h.updated.length,0);
 }
});
test('an existing real import tab is focused without forced reload; prefix lookalikes are not used',async()=>{
 const h=harness([{id:1,url:'https://saka46log.com/important'},{id:2,url:'https://saka46log.com/import?extensionImport=1',windowId:7}],'saka46log');await h.click({url:'https://saka46log.com/results'});assert.equal(h.updated[0].id,2);assert.equal(h.updated[0].url,undefined);assert.equal(h.created.length,0);
});
