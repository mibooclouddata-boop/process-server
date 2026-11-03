'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {chromium}=require('@playwright/test');
const {startFixture}=require('./test-support/as-fixture.cjs');
test('recent receipts use five numbered rows, fill the card and escape record text',async t=>{
 const f=await startFixture();let browser;t.after(async()=>{if(browser)await browser.close();await f.close();});
 browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'msedge'}:{})});
 const c=await browser.newContext({viewport:{width:1440,height:900}});
 await c.request.post(f.url+'/api/login',{headers:{'X-Requested-With':'process-server'},data:{id:'admin',password:'Fixture-passphrase-2026!'}});
 const page=await c.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 let apiRecords=[{id:'api-recent',asNo:'API-RECENT-1',createdAt:'2026-11-03',product:'API material',ship:'API ship',block:'B01',element:'E01',status:'접수',reason:'기타'}];
 await page.route(f.url+'/api/as',route=>route.fulfill({status:200,json:{list:apiRecords}}));
 await page.goto(f.url+'/dashboard.html');await page.locator('#asStatsContent:not([hidden])').waitFor();
 assert.equal(await page.locator('.as-recent-product').first().textContent(),'API material','initial API response populates recent list');
 apiRecords=[{...apiRecords[0],product:'Updated API material'}];
 await page.evaluate(()=>loadAsStatistics());
 assert.equal(await page.locator('.as-recent-product').first().textContent(),'Updated API material','reload updates recent list');
 assert.equal(await page.locator('.as-overview-pagination,.as-recent-heading button,.as-recent-count,#asAmountSelectedPeriod').count(),0);
 const seed=async count=>page.evaluate(count=>AsOverviewBalanced.refreshRecent(Array.from({length:count},(_,i)=>({id:'recent-'+i,asNo:'TEST-'+i,createdAt:'2026-11-'+String(i+1).padStart(2,'0'),product:i===count-1?'<img src=x onerror=alert(1)>':'Example product',ship:'Example ship',block:'B12',element:'E03',reason:'Example reason',status:'접수'}))),count);
 for(const height of [900,768]){
  await page.setViewportSize({width:1440,height});
  for(const count of [9,3,0]){
   await seed(count);assert.equal(await page.locator('.as-recent-item').count(),Math.min(count,5));
   if(count){
    assert.deepEqual(await page.locator('.as-recent-index').allTextContents(),Array.from({length:Math.min(count,5)},(_,i)=>String(i+1).padStart(2,'0')));
    assert.match(await page.locator('.as-recent-item').first().getAttribute('title'),new RegExp('^TEST-'+(count-1)+' '));
    assert.equal(await page.locator('.as-recent-meta').first().textContent(),'Example ship / B12 / E03');
    assert.equal(await page.locator('.as-recent-end').first().textContent(),'접수');
    assert.equal(await page.locator('.as-recent-product').first().textContent(),'<img src=x onerror=alert(1)>');assert.equal(await page.locator('.as-recent-panel img').count(),0);
    const gap=await page.locator('.as-recent-scroll').evaluate(e=>e.getBoundingClientRect().bottom-e.querySelector('ol').getBoundingClientRect().bottom);assert.ok(Math.abs(gap)<=1,'unused card space');
   }else assert.equal(await page.locator('.as-recent-empty').isVisible(),true);
  }
 }
 await page.setViewportSize({width:390,height:844});await seed(9);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 assert.equal(await page.locator('.as-recent-item').count(),5);assert.deepEqual(errors,[]);
});
