// Real Chromium MV3 loading with synthetic first-party Music pages only; never uses a personal profile.
import { createRequire } from 'node:module';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=process.env.SAKA_TEST_ROOT;
if(!root)throw Error('SAKA_TEST_ROOT must point to the isolated site test project');
const {chromium}=createRequire(path.join(root,'package.json'))('@playwright/test');
const report={kind:'synthetic Chromium MV3 Music-only fixture, not real-account acceptance',editions:[]};
for(const locale of ['zh-CN','ja']){
 const extension=path.join(root,'artifacts/extension-fixture',locale),profile=await mkdtemp(path.join(root,'artifacts/extension-profile-'));
 let context;
 try{
  context=await chromium.launchPersistentContext(profile,{channel:'chromium',headless:true,args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]});
  for(const page of context.pages())if(page.url()==='about:blank')await page.close();
  const unexpected=[];
  await context.route('https://**/*',route=>{
   const url=new URL(route.request().url());let html='<html><body>Synthetic site</body></html>';
   if(['46log.com','saka46log.com'].includes(url.hostname))return route.fulfill({contentType:'text/html',body:html});
   if(url.hostname==='fortunemusic.jp'){
    html=url.pathname.includes('apply_detail')?'<html><body><table><thead><tr><th>商品名</th><th>応募数</th><th>当選数</th></tr></thead><tbody><tr><td>田村 保乃【10/18 第3部】Fixture</td><td class="tdQua">7個</td><td class="tdQua">2個</td></tr></tbody></table></body></html>':'<html><body><div class="tblHist"><table><tbody><tr><td><a href="/mypage/apply_detail/1/">fixture</a></td><td>2026/09/18</td><td class="tdEvent">櫻坂46 Fixture 第1次</td><td class="tdDraw">当選</td></tr></tbody></table></div></body></html>';
    return route.fulfill({contentType:'text/html',body:html});
   }
   unexpected.push(url.origin);return route.abort('blockedbyclient');
  });
  await context.addInitScript(()=>{window.__extensionMessages=[];window.addEventListener('message',event=>{if(event.source===window&&['46log-miguri-extension','saka46log-miguri-extension'].includes(event.data?.source))window.__extensionMessages.push(event.data);});});
  const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');
  await worker.evaluate(()=>{globalThis.__fixtureCreated=[];const create=chrome.tabs.create.bind(chrome.tabs);chrome.tabs.create=async spec=>{const tab=await create({...spec,url:'about:blank'});globalThis.__fixtureCreated.push(spec.url);return tab;};});
  async function send(page,type,extra={}){await page.evaluate(({type,extra})=>window.postMessage({source:location.hostname==='saka46log.com'?'saka46log-miguri-page':'46log-miguri-page',type,...extra},location.origin),{type,extra});}
  async function connect(page,url){await page.goto(url);await send(page,'PING');await page.waitForFunction(()=>window.__extensionMessages.some(m=>m.type==='PONG'));return page.evaluate(()=>window.__extensionMessages.find(m=>m.type==='PONG'));}
  for(const [site,url,version] of [['46log','https://46log.com/miguri',1],['saka46log','https://saka46log.com/import',2]]){
   const page=await context.newPage();const pong=await connect(page,url);assert.equal(pong.version,'1.1.18');
   const born=context.waitForEvent('page');await send(page,'START',{syncSource:'fortunemusic'});const official=await born;
   await page.waitForFunction(()=>window.__extensionMessages.some(m=>m.type==='STARTED'));
   const target=await worker.evaluate(()=>globalThis.__fixtureCreated.at(-1));assert.equal(target,'https://fortunemusic.jp/mypage/apply_list/');await official.goto(target);
   await page.waitForURL(`${url}?extensionImport=1`,{timeout:20000});await send(page,'TAKE_RESULT');await page.waitForFunction(()=>window.__extensionMessages.some(m=>m.type==='RESULT'));
   const result=await page.evaluate(()=>window.__extensionMessages.find(m=>m.type==='RESULT').payload);
   assert.equal(result.target,site);assert.equal(result.version,version);assert.equal(result.autoContinue,false);assert.equal(result.next,'done');assert.equal(result.records.length,1);
   if(site==='saka46log')assert.equal(result.records[0].won,2);
   await send(page,'ACK_RESULT',{completedAt:result.completedAt});await page.waitForTimeout(100);
   assert.equal((await worker.evaluate(async()=>chrome.storage.session.get('miguriSyncResult'))).miguriSyncResult,undefined);
   await page.close();
  }
  assert.deepEqual(unexpected,[],'No Meets or unknown network requests');
  report.editions.push({locale,supportedSites:['46log','saka46log'],source:'fortunemusic',realAccountAccess:false});
 }finally{await context?.close();await rm(profile,{recursive:true,force:true});}
}
console.log(JSON.stringify(report,null,2));
