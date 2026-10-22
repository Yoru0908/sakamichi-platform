// Isolated browser + real route handlers + SQLite migration. All /api calls intercepted; no production records.
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { createServer } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { chromium, webkit } from 'playwright';
import { signAccessToken } from '../workers/shared/jwt.ts';
import { handleGetMySakamichiEventMarks, handleGetSakamichiEventCounts, handleSetSakamichiEventMark } from '../workers/miguri/src/routes/sakamichi-events.ts';
const root=fileURLToPath(new URL('../',import.meta.url));
const server=await createServer({configFile:false,root:root+'tests/events',resolve:{alias:{'@':root+'src'}},esbuild:{jsx:'automatic'},plugins:[tailwindcss()],server:{host:'127.0.0.1',port:0,fs:{allow:[root,root+'node_modules']}}});
await server.listen();
const base=server.resolvedUrls.local[0].replace(/\/$/,'');
const now=new Date('2026-10-23T03:00:00Z');
const source={id:'12161_18:2026-10-18',date:'2026-10-18',title:'保存テスト',kind:'ライブ',category:'attend',shows:[],members:[],wholeGroup:true,sourceUrl:'https://example.test/event',venue:{id:1,name:'東京テスト会場',prefecture:'東京都'}};
const future={...source,id:'12161_31:2026-10-31',date:'2026-10-31',title:'予定テスト'};
const cookie=`access_token=${await signAccessToken('fixture-a','member','fixture-secret')}`;
mkdirSync(root+'.tmp/events-shots',{recursive:true});
try { for(const [engine,kind] of [['chromium',chromium],['webkit',webkit]]) {
 const browser=await kind.launch({headless:true});
 try { for(const width of [320,390,1440]) {
  const context=await browser.newContext({viewport:{width,height:900}}),page=await context.newPage();
  page.setDefaultTimeout(10000); await page.clock.install({time:now}); const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const db=new DatabaseSync(':memory:');
  db.exec(readFileSync(root+'workers/auth/src/db/migrations/014_sakamichi_event_marks.sql','utf8'));
  const env={JWT_SECRET:'fixture-secret',EVENTS_READ_TOKEN:'fixture-read',SAKA46LOG:{fetch:async()=>Response.json({data:{events:[source,future]}})},MIGURI_DB:{prepare(sql){let args=[];const st={bind(...a){args=a;return st},all:async()=>({results:db.prepare(sql).all(...args)}),run:async()=>db.prepare(sql).run(...args)};return st;}}};
  let failWrite=false,failLoad=false,writes=0;
  await page.route('**/api/**',async route=>{
   const r=route.request(),url=new URL(r.url()),path=url.pathname;
   const req=new Request(r.url(),{method:r.method(),headers:{Cookie:cookie}});let res;
   if(path.endsWith('/marks')) res=failLoad?Response.json({success:false},{status:503}):await handleGetMySakamichiEventMarks(req,env,now);
   else if(path.includes('/marks/')) {writes++;await new Promise(resolve=>setTimeout(resolve,150));res=failWrite?Response.json({success:false},{status:503}):await handleSetSakamichiEventMark(req,env,path.split('/marks/')[1],r.method()==='PUT',now);}
   else if(path.endsWith('/counts')) res=await handleGetSakamichiEventCounts(req,env,now);
   else if(path.endsWith('/sakamichi-events')) res=Response.json({success:true,data:{events:url.searchParams.get('grp')==='sakurazaka'?[source,future]:[]}});
   else res=Response.json({success:true,data:{}});
   await route.fulfill({status:res.status,contentType:'application/json',body:await res.text()});
  });
  await page.goto(`${base}/?event=${encodeURIComponent(source.id)}`);
  const dialog=page.getByRole('dialog');await dialog.waitFor();
  assert.match(await dialog.innerText(),/櫻坂46/,'underscore deep link keeps group');
  const record=dialog.getByRole('button',{name:'记录参与',exact:true});await record.waitFor();
  await record.click();await dialog.getByRole('button',{name:'保存中…',exact:true}).waitFor();
  await dialog.getByRole('button',{name:/^已参与/}).waitFor();assert.equal(db.prepare('SELECT COUNT(*) n FROM sakamichi_event_marks').get().n,1);
  assert.equal(writes,1);await page.reload();await dialog.getByRole('button',{name:/^已参与/}).waitFor();
  failWrite=true;await dialog.getByRole('button',{name:/^已参与/}).click();await dialog.getByRole('alert').waitFor();
  assert.equal(await dialog.getByRole('button',{name:/^已参与/}).getAttribute('aria-pressed'),'true');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM sakamichi_event_marks').get().n,1);
  await page.screenshot({path:`${root}.tmp/events-shots/${engine}-${width}-failure.png`});
  failWrite=false;await dialog.getByRole('button',{name:/^已参与/}).click();await dialog.getByRole('button',{name:'记录参与',exact:true}).waitFor();
  assert.equal(db.prepare('SELECT COUNT(*) n FROM sakamichi_event_marks').get().n,0);
  await page.reload();await dialog.getByRole('button',{name:'记录参与',exact:true}).waitFor();
  await dialog.getByRole('button',{name:'关闭',exact:true}).click();await page.getByRole('button',{name:/^加入计划/}).click();
  await page.getByRole('button',{name:/^已加入计划/}).waitFor();assert.equal(db.prepare('SELECT event_id FROM sakamichi_event_marks').get().event_id,future.id);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`${engine} ${width} overflow`);
  failLoad=true;await page.reload();await page.getByRole('alert').filter({hasText:'暂时无法读取'}).waitFor();
  assert.equal(await page.getByRole('button',{name:/^加入计划/}).isDisabled(),true);
  failLoad=false;await page.getByRole('button',{name:'重新载入',exact:true}).click();await page.getByRole('button',{name:/^已加入计划/}).waitFor();
  assert.deepEqual(errors,[]);console.log(`${engine} ${width}: deep link, SQL save/reload/delete, pending/error/retry, plans, layout passed`);
  await context.close();db.close();
 }} finally {await browser.close();}
}} finally {await server.close();}
