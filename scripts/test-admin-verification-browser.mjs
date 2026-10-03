// Every /api request is intercepted. No real admin session or production user write.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import tailwindcss from '@tailwindcss/vite';
const require = createRequire(import.meta.url);
const { chromium, webkit } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const root = fileURLToPath(new URL('../',import.meta.url));
const server = process.env.BASE_URL ? null : await createServer({configFile:false,root:root+'tests/admin-verification',resolve:{alias:{'@':root+'src'}},esbuild:{jsx:'automatic'},plugins:[tailwindcss()],server:{host:'127.0.0.1',port:0,fs:{allow:[root]}}});
await server?.listen();
const base = process.env.BASE_URL || server.resolvedUrls.local[0].replace(/\/$/,'');
const shots = '.tmp/verification-shots'; mkdirSync(shots,{recursive:true});
const pause = ms => new Promise(resolve=>setTimeout(resolve,ms));
let passed=0;
for(const [engine,kind] of [['chrome',chromium],['webkit',webkit]]) {
  const browser=await kind.launch({headless:true,...(engine==='chrome'?{channel:'chrome'}:{})});
  try { for(const width of [320,390,1440]) {
    const context=await browser.newContext({viewport:{width,height:900},timezoneId:'America/Los_Angeles'});
    const page=await context.newPage(); const errors=[];page.on('pageerror',e=>errors.push(e.message));
    const common={email:'fixture@example.test',avatar_url:null,role:'member',geo_status:'default',verification_reason:'This is a sample explanation, unrelated to a real applicant.',updated_at:'2099-01-01 00:00:00'};
    const fresh={...common,id:'fresh',display_name:'五月注册，今天申请',verification_status:'pending',created_at:'2026-05-01 13:11:58',verification_requested_at:'2026-10-03 10:23:10',verification_resolved_at:null};
    const legacy={...common,id:'legacy',display_name:'历史已批准申请',verification_status:'approved',created_at:'2026-05-01 13:11:58',verification_requested_at:null,verification_resolved_at:null};
    const pendingLegacy={...legacy,id:'pending-legacy',display_name:'历史待审核申请',verification_status:'pending'};
    let current={...fresh},pendingDelay=0,failList=false,failAction=false,statsRequests=0,actionDelay=0,actions=0;
    await page.route('**/api/**',async route=>{
      const url=new URL(route.request().url()); let data={};
      if(url.pathname.endsWith('/me')) data={user:{id:'local-fixture-admin',email:'admin@example.test',role:'admin',displayName:'Fixture Admin',isFirstLogin:false}};
      if(url.pathname.endsWith('/geo-check')) data={country:'JP'};
      if(url.pathname.endsWith('/stats')) {statsRequests++;data={stats:{total_users:3,paid_users:0,pending_users:current.verification_status==='pending'?2:1,unmatched_pending:7,active_codes:0}};}
      if(url.pathname.endsWith('/verifications')) {
        if(failList) {await route.fulfill({status:503,json:{success:false,message:'审核列表暂时不可用'}});return;}
        const status=url.searchParams.get('status');
        const rows=status==='pending'?[...(current.verification_status==='pending'?[current]:[]),pendingLegacy]:status==='approved'?[...(current.verification_status==='approved'?[current]:[]),legacy]:status==='all'?[pendingLegacy,current,legacy]:[];
        // Snapshot at request time, so an older delayed response could be stale.
        data={users:structuredClone(rows)}; if(status==='pending') await pause(pendingDelay);
      }
      if(url.pathname.endsWith('/verifications/resolve')) {
        actions++;await pause(actionDelay);
        if(failAction) {await route.fulfill({status:409,json:{success:false,message:'该申请已处理，请刷新列表'}});return;}
        current={...current,verification_status:'approved',verification_resolved_at:'2026-10-03 10:34:00'};
        data={message:'Verification approved'};
      }
      await route.fulfill({json:{success:true,data}});
    });
    await page.goto(process.env.BASE_URL?base+'/dashboard/':base,{waitUntil:'domcontentloaded'});
    await page.getByText('GeoPass 待审核',{exact:true}).waitFor();
    const geoTab=page.getByRole('button',{name:/^GeoPass 审核/}).first();
    assert.match(await geoTab.innerText(),/2/,'GeoPass uses pending users, not seven unpaid payments');
    await geoTab.click();
    const freshCard=page.locator('[data-verification-user="fresh"]'); await freshCard.waitFor();
    assert.match(await freshCard.innerText(),/申请提交[\s\S]*2026\/10\/03 19:23/);
    assert.match(await freshCard.innerText(),/账号注册[\s\S]*2026\/05\/01 22:11/);
    assert.match(await freshCard.innerText(),/审核处理[\s\S]*待处理/);
    assert.equal(await freshCard.locator('[data-verification-times]').isVisible(),true);
    assert(await freshCard.getByRole('button',{name:/^批准 /}).evaluate(el=>el.getBoundingClientRect().height>=44));
    await page.getByRole('button',{name:'已批准',exact:true}).click();
    const legacyCard=page.locator('[data-verification-user="legacy"]');await legacyCard.waitFor();
    assert.match(await legacyCard.innerText(),/未记录（历史申请）/);assert.match(await legacyCard.innerText(),/未记录（历史审核）/);
    await page.screenshot({path:`${shots}/${engine}-${width}-legacy.png`});
    pendingDelay=400;
    await page.getByRole('button',{name:'待审核',exact:true}).click();
    await pause(40);await page.getByRole('button',{name:'已批准',exact:true}).click();
    await legacyCard.waitFor();await pause(550);
    assert.equal(await freshCard.count(),0,'late pending response cannot replace approved filter');
    failList=true;await page.getByRole('button',{name:'刷新审核列表'}).click();
    await page.getByRole('alert').getByText('审核列表暂时不可用').waitFor();
    assert.equal(await page.getByText('无数据',{exact:true}).count(),0,'failure is not an empty list');
    failList=false;pendingDelay=0;await page.getByRole('button',{name:'待审核',exact:true}).click();await freshCard.waitFor();
    failAction=true;await freshCard.getByRole('button',{name:/^批准 /}).click();
    await page.getByRole('alert').getByText('该申请已处理，请刷新列表').waitFor();
    assert.equal(await freshCard.count(),1,'failed review stays visible');
    failAction=false;actionDelay=150;
    const statsBefore=statsRequests;await freshCard.getByRole('button',{name:/^批准 /}).click();
    await page.getByRole('button',{name:'已批准',exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('[data-verification-user="fresh"]')?.textContent.includes('2026/10/03 19:34'));
    await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(el=>/^GeoPass 审核\s*1$/.test(el.textContent.trim())));
    assert(actions===2,'each click causes only one review request');
    assert(statsRequests>statsBefore,'pending badge refreshes after successful review');
    assert.match(await geoTab.innerText(),/1/);
    assert.match(await freshCard.innerText(),/审核处理[\s\S]*2026\/10\/03 19:34/);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'no page overflow');
    await page.screenshot({path:`${shots}/${engine}-${width}-reviewed.png`});
    // The legacy whole-page Navbar has a separately reproduced #418 during an
    // instant synthetic login. The focused CSR component must have zero errors.
    if(process.env.VERIFICATION_BASELINE_418==='1') assert.deepEqual(errors.filter(e=>!e.startsWith('Minified React error #418;')),[]);
    else assert.deepEqual(errors,[]);
    if(errors.length) console.log(`Existing whole-page hydration warnings: ${errors.length}`);
    console.log(`PASS ${engine} ${width}px: JST in a US browser, history labels, filter race, failure, review while switching, badge, layout`);
    passed++;await page.unrouteAll({behavior:'wait'});await context.close();
  }} finally {await browser.close();}
}
console.log(`${passed} browser contexts passed, all account/API data synthetic.`);
await server?.close();
