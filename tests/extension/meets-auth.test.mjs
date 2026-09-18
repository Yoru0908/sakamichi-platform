import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const apiSource=readFileSync(new URL('../../browser-extension/miguri-sync/meets-api.js',import.meta.url),'utf8');
const background=readFileSync(new URL('../../browser-extension/miguri-sync/background.js',import.meta.url),'utf8');
const API='https://ticket-api.fortunemeets.app/user/history2';
function apiHarness(status=200){
 const requests=[];const sandbox={URL,AbortController,Date,Math,setTimeout:(fn,ms)=>{if(ms<10000)queueMicrotask(fn);return 0;},clearTimeout(){},fetch:async(url,options={})=>{requests.push({url,options});if(url===API)return {status,ok:status===200,json:async()=>({results:[]})};assert.match(url,/^https:\/\/ticket\.fortunemeets\.app\/data\/(nogizaka46|sakurazaka46|hinatazaka46)\/fixture\/config.json$/);return {status:200,ok:true,json:async()=>({eventId:'fixture-event',applications:[]})};}};
 vm.runInNewContext(apiSource,sandbox);return {sync:sandbox.MiguriMeetsApi.sync,requests};
}
const campaignsByGroup={nogizaka46:['fixture'],sakurazaka46:['fixture'],hinatazaka46:['fixture']};
test('modern Meets API uses official Bearer header, only on fixed history endpoint, with no redirects',async()=>{
 const h=apiHarness();await h.sync({userId:'fixture-id',authMode:'bearer',accessToken:'fixture-token',campaignsByGroup});
 assert.equal(h.requests.filter(r=>r.url===API).length,3);
 for(const {url,options} of h.requests){if(url===API){assert.equal(options.headers.Authorization,'Bearer fixture-token');assert.equal(options.headers['x-user-id'],undefined);assert.equal(options.redirect,'error');}else assert.equal(options.headers,undefined);}
});
test('legacy storage compatibility retains old request headers without fabricating Bearer tokens',async()=>{
 const h=apiHarness();await h.sync({userId:'fixture-old',authMode:'legacy',campaignsByGroup});for(const r of h.requests.filter(r=>r.url===API)){assert.equal(r.options.headers['x-user-id'],'fixture-old');assert.equal(r.options.headers.Authorization,undefined);}
});
test('401 never downgrades modern auth to the legacy ID mechanism',async()=>{
 const h=apiHarness(401);await assert.rejects(h.sync({userId:'fixture',authMode:'bearer',accessToken:'fixture-token',campaignsByGroup}),e=>e.code==='LOGIN_REQUIRED');
 assert.equal(h.requests.filter(r=>r.url===API).length,1);assert.equal(h.requests.some(r=>r.options.headers?.['x-user-id']),false);
});
test('missing, malformed or injection-bearing credentials reject before any API fetch',async()=>{
 for(const accessToken of [undefined,'','x\r\ny','null','a'.repeat(16385)]){const h=apiHarness();await assert.rejects(h.sync({userId:'fixture',authMode:'bearer',accessToken,campaignsByGroup}),e=>e.code==='LOGIN_REQUIRED');assert.equal(h.requests.length,0);}
});
test('background only accepts credentials from the owned official top-frame job; never persists or relays them',async()=>{
 const session={miguriSyncJob:{id:'fixture-job',source:'fortunemeets',target:'46log',tabId:50,returnTabId:1}},local={},stored=[],relayed=[],calls=[];let listener;
 const storage=obj=>({get:async key=>({[key]:obj[key]}),set:async value=>{stored.push(value);Object.assign(obj,value);},remove:async key=>delete obj[key]});
 const chrome={storage:{session:storage(session),local:storage(local)},alarms:{clear:async()=>{},get:async()=>null,create:async()=>{},onAlarm:{addListener(){}}},runtime:{onInstalled:{addListener(){}},onStartup:{addListener(){}},onMessage:{addListener(fn){listener=fn;}}},tabs:{onRemoved:{addListener(){}},query:async()=>[],get:async()=>({url:'https://46log.com/miguri'}),sendMessage:async(_id,message)=>relayed.push(message)},action:{onClicked:{addListener(){}}}};
 vm.runInNewContext(background,{chrome,importScripts(){},URL,Date,console,crypto:globalThis.crypto,MiguriMeetsApi:{async sync(input){calls.push(input);await input.onProgress('synthetic progress','no private fields');return {records:[]};}},fetch(){throw Error('Unexpected site write');}});
 const message={type:'MIGURI46LOG_MEETS_API_SYNC',jobId:'fixture-job',userId:'fixture',authMode:'bearer',accessToken:'fixture-token',campaignsByGroup};
 const send=sender=>new Promise(resolve=>listener(message,sender,resolve));
 for(const sender of [{url:'https://evil.invalid/',frameId:0,tab:{id:50}},{url:'https://ticket.fortunemeets.app/nogizaka46/',frameId:1,tab:{id:50}},{url:'https://ticket.fortunemeets.app/nogizaka46/',frameId:0,tab:{id:51}}])assert.equal((await send(sender)).ok,false);
 assert.equal(calls.length,0);const result=await send({url:'https://ticket.fortunemeets.app/nogizaka46/42nd',frameId:0,tab:{id:50}});assert.equal(result.ok,true);assert.equal(calls[0].accessToken,'fixture-token');
 for(const value of [session,local,stored,relayed,result])assert.equal(JSON.stringify(value).includes('fixture-token'),false);
});
