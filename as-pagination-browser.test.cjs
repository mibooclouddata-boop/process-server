'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {chromium}=require('@playwright/test');
const {startFixture}=require('./test-support/as-fixture.cjs');

test('AS pagination stays circular and stationary across all 26 pages',async t=>{
 const fixture=await startFixture();let browser;
 t.after(async()=>{if(browser)await browser.close();await fixture.close();});
 browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHANNEL?{channel:process.env.PLAYWRIGHT_CHANNEL}:process.platform==='win32'?{channel:'msedge'}:{})});
 const context=await browser.newContext({viewport:{width:1440,height:1000}});
 const errors=[];
 assert.equal((await context.request.post(fixture.url+'/api/login',{headers:{'X-Requested-With':'process-server'},data:{id:'admin',password:'Fixture-passphrase-2026!'}})).status(),200);
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.goto(fixture.url+'/dashboard.html');await page.waitForFunction(()=>currentUser?.id==='admin');
 await page.evaluate(async()=>{
  switchTab('as',document.querySelector('[data-sub="list"]'),'list');await loadAsList();
  _asFiltered=Array.from({length:503},(_,i)=>({id:'pagination-fixture-'+i,asNo:'TEST-'+i,status:'',files:[],createdAt:'2026-11-03',ship:'TEST'}));
  _asFullList=_asFiltered;_asPage=1;_renderAsPage();
 });
 const pager=page.locator('#asPageBtns');const initial=await pager.boundingBox();
 for(let n=1;n<=26;n++){
  // Sequential next clicks cover every transition, including the first ellipsis change.
  if(n>1)await pager.locator('button').last().click();
  assert.equal(await pager.locator('.active').textContent(),String(n));
  const box=await pager.boundingBox();assert.equal(box.x,initial.x,'page '+n+' left edge');assert.equal(box.width,initial.width,'page '+n+' width');
  assert.equal(await pager.locator('button,.as-page-gap').count(),9);
  const shape=await pager.locator('.active').evaluate(e=>{const s=getComputedStyle(e);return {width:s.width,height:s.height,radius:s.borderRadius,background:s.backgroundColor,color:s.color};});
  assert.equal(shape.width,shape.height);assert.equal(shape.radius,'50%');assert.equal(shape.background,'rgb(41, 45, 50)');assert.equal(shape.color,'rgb(255, 255, 255)');
 }
 assert.equal(await pager.locator('button').last().isDisabled(),true);
 await page.evaluate(()=>asGoPage(1));assert.equal(await pager.locator('button').first().isDisabled(),true);
 for(const total of [1,20,21,140,141]){
  await page.evaluate(total=>{_asFiltered=_asFullList.slice(0,total);_asPage=1;_renderAsPage();},total);
  assert.equal(await pager.locator('.as-page-btn:not(:first-child):not(:last-child),.as-page-gap').count(),Math.min(7,Math.ceil(total/20)));
 }
 await page.emulateMedia({reducedMotion:'reduce'});
 assert.equal(await pager.locator('.active').evaluate(e=>getComputedStyle(e).transitionDuration),'0s');
 const touchContext=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,storageState:await context.storageState()});
 const touchPage=await touchContext.newPage();
 await touchPage.goto(fixture.url+'/dashboard.html');await touchPage.waitForFunction(()=>currentUser?.id==='admin');
 await touchPage.evaluate(async()=>{
  switchTab('as',document.querySelector('[data-sub="list"]'),'list');await loadAsList();
  _asFiltered=Array.from({length:503},(_,i)=>({id:'touch-fixture-'+i,asNo:'TEST-'+i,status:'',files:[],createdAt:'2026-11-03',ship:'TEST'}));
  _asFullList=_asFiltered;_asPage=1;_renderAsPage();
 });
 const touchPager=touchPage.locator('#asPageBtns');
 assert.equal(await touchPage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'phone has no page overflow');
 assert.equal(await touchPager.locator('.active').evaluate(e=>getComputedStyle(e).width),'44px');
 await touchPager.locator('button').filter({hasText:/^4$/}).click();
 assert.equal(await touchPager.locator('.active').textContent(),'4');
 await touchPager.locator('button').filter({hasText:/^26$/}).click();
 assert.equal(await touchPager.locator('.active').textContent(),'26');
 assert.equal(await touchPager.locator('button').last().isDisabled(),true);
 assert.equal(await touchPage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 assert.deepEqual(errors,[]);
});
