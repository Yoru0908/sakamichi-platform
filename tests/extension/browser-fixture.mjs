// Real Chromium MV3 loading, synthetic pages/API only. Never opens a user's browser profile.
import { createRequire } from 'node:module';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=process.env.SAKA_TEST_ROOT;
if(!root)throw Error('SAKA_TEST_ROOT must point to the isolated site test project');
const {chromium}=createRequire(path.join(root,'package.json'))('@playwright/test');
const report={checkedAt:new Date().toISOString(),kind:'MV3 browser fixture, not real-account acceptance',editions:[]};
for(const locale of ['zh-CN','ja']){
 const extension=path.join(root,'artifacts/extension-fixture',locale),profile=await mkdtemp(path.join(root,'artifacts/extension-profile-'));
 let context;
 try{
  context=await chromium.launchPersistentContext(profile,{channel:'chromium',headless:true,args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]});
  for(const page of context.pages())if(page.url()==='about:blank')await page.close();
  const unexpected=[];
  await context.route('https://**/*',async route=>{
   const url=new URL(route.request().url());let html='<!doctype html><html><head><meta charset="utf-8"></head><body>Isolated extension fixture</body></html>';
   if(['46log.com','saka46log.com'].includes(url.hostname))return route.fulfill({contentType:'text/html',body:html});
   if(url.hostname==='ticket.fortunemeets.app'){html='<html><body>'+['nogizaka46','sakurazaka46','hinatazaka46'].map(group=>`<a href="/${group}/fixture/">fixture campaign</a>`).join('')+'</body></html>';return route.fulfill({contentType:'text/html',body:html});}
   if(url.hostname==='fortunemusic.jp'){
    html=url.pathname.includes('apply_detail')?'<html><body><table><thead><tr><th>商品名</th><th>応募数</th><th>当選数</th></tr></thead><tbody><tr><td>田村 保乃【10/18 第3部】Fixture</td><td class="tdQua">7個</td><td class="tdQua">2個</td></tr></tbody></table></body></html>':'<html><body><div class="tblHist"><table><tbody><tr><td><a href="/mypage/apply_detail/1/">fixture</a></td><td>2026/09/18</td><td class="tdEvent">櫻坂46 Fixture 第1次</td><td class="tdDraw">当選</td></tr></tbody></table></div></body></html>';
    return route.fulfill({contentType:'text/html',body:html});
   }
   unexpected.push(url.origin);return route.abort('blockedbyclient');
  });
  await context.addInitScript(()=>{
   window.__extensionMessages=[];window.addEventListener('message',event=>{if(event.source===window&&['46log-miguri-extension','saka46log-miguri-extension'].includes(event.data?.source))window.__extensionMessages.push(event.data);});
   if(location.hostname==='ticket.fortunemeets.app'&&!localStorage.getItem('__fixture_seeded')){localStorage.setItem('__fixture_seeded','1');localStorage.setItem('lscache-userId',JSON.stringify('fixture-user'));localStorage.setItem('lscache-accessToken',JSON.stringify('fixture-token'));}
  });
  const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');
  await worker.evaluate(()=>{
   globalThis.__apiAudit=[];globalThis.__fixtureCreated=[];
   // Attach fixture routing before navigating extension-created tabs.
   const create=chrome.tabs.create.bind(chrome.tabs);
   chrome.tabs.create=async spec=>{const tab=await create({...spec,url:'about:blank'});globalThis.__fixtureCreated.push({id:tab.id,url:spec.url});return tab;};
   globalThis.fetch=async(url,options={})=>{
    if(String(url).startsWith('https://ticket.fortunemeets.app/data/')){
     const item={id:'fixture-prize',date:'2026年10月18日',part:'第1部'};
     const config={eventId:'fixture-event',eventName:'Synthetic test',applications:[{awards:[{name:'オンラインミート',serialCount:1,applyTable:[item]}]}]};
     return new Response(JSON.stringify(config),{headers:{'Content-Type':'application/json'}});
    }
    if(String(url)==='https://ticket-api.fortunemeets.app/user/history2'){
     const bearer=options.headers?.Authorization==='Bearer fixture-token',legacy=options.headers?.['x-user-id']==='fixture-legacy';if(!bearer&&!legacy)throw Error('Wrong fixture auth method');
     globalThis.__apiAudit.push({bearer,legacy,redirect:options.redirect});
     return new Response(JSON.stringify({results:[{prizeId:'fixture-prize',prizeInfo:{members:['テスト用メンバー']},count:2,result:'落選'}]}),{headers:{'Content-Type':'application/json'}});
    }
    throw Error('Unexpected extension network call');
   };
  });
  async function send(page,type,extra={}){await page.evaluate(({type,extra})=>window.postMessage({source:location.hostname==='saka46log.com'?'saka46log-miguri-page':'46log-miguri-page',type,...extra},location.origin),{type,extra});}
  async function start(page,source){const born=context.waitForEvent('page');await send(page,'START',{syncSource:source});const tab=await born;await page.waitForFunction(()=>window.__extensionMessages.some(m=>m.type==='STARTED'));const created=await worker.evaluate(()=>globalThis.__fixtureCreated.at(-1));assert(created);await tab.goto(created.url);}
  async function connect(page,url){await page.goto(url);await send(page,'PING');await page.waitForFunction(()=>window.__extensionMessages.some(m=>m.type==='PONG'));return page.evaluate(()=>window.__extensionMessages.find(m=>m.type==='PONG'));}
  async function receive(page,url){await page.waitForURL(url,{timeout:20000});await send(page,'TAKE_RESULT');await page.waitForFunction(()=>window.__extensionMessages.some(m=>m.type==='RESULT'));return page.evaluate(()=>window.__extensionMessages.find(m=>m.type==='RESULT').payload);}
  const old=await context.newPage();const pong=await connect(old,'https://46log.com/miguri');assert.equal(pong.version,'1.1.16');await start(old,'fortunemeets');
  const meets=await receive(old,'https://46log.com/miguri?extensionImport=1');assert.equal(meets.version,1);assert.equal(meets.records.length,3);assert.equal(JSON.stringify(meets).includes('fixture-token'),false);
  const safe=await worker.evaluate(async()=>{const session=await chrome.storage.session.get(null),local=await chrome.storage.local.get(null);return !JSON.stringify({session,local}).includes('fixture-token');});assert(safe);
  await worker.evaluate(()=>chrome.storage.session.clear());
  const saka=await context.newPage();const spong=await connect(saka,'https://saka46log.com/import');assert(spong.capabilities.includes('saka-lottery-v2'));await start(saka,'fortunemusic');
  const music=await receive(saka,'https://saka46log.com/import?extensionImport=1');assert.equal(music.target,'saka46log');assert.equal(music.version,2);assert.equal(music.records.length,1);assert.equal(music.records[0].won,2);assert.equal(music.autoContinue,false);
  await send(saka,'ACK_RESULT',{completedAt:music.completedAt});await worker.evaluate(()=>chrome.storage.session.clear());
  const official=context.pages().find(page=>page.url().startsWith('https://ticket.fortunemeets.app/'));
  await official.evaluate(()=>{localStorage.removeItem('lscache-userId');localStorage.removeItem('lscache-accessToken');localStorage.setItem('lscache-id',JSON.stringify('fixture-legacy'));});
  await old.goto('https://46log.com/miguri');await start(old,'fortunemeets');const legacy=await receive(old,'https://46log.com/miguri?extensionImport=1');assert.equal(legacy.records.length,3);
  const audit=await worker.evaluate(()=>globalThis.__apiAudit);assert.equal(audit.filter(r=>r.bearer).length,3);assert.equal(audit.filter(r=>r.legacy).length,3);assert(audit.every(r=>r.redirect==='error'));
  assert.deepEqual(unexpected,[]);
  report.editions.push({locale,version:pong.version,oldSiteMeetsBearer:true,oldSiteMeetsLegacy:true,newSiteMusic:true,receiptsAndCapabilities:true,credentialsNotPersistedOrInResult:safe,apiCalls:audit.length,realAccountAccess:false});
 }finally{await context?.close();await rm(profile,{recursive:true,force:true});}
}
await writeFile(path.join(root,'artifacts/extension-browser-check.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
