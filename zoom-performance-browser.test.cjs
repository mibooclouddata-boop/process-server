'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {chromium}=require('playwright'),{startFixture}=require('./test-support/as-fixture.cjs');
const launch=()=>chromium.launch({headless:true,...(process.platform==='win32'?{channel:'msedge'}:{})});
test('completed login hides the source layout and stops its loading animation, while Back restores login',async t=>{
 const fixture=await startFixture();let browser;t.after(async()=>{await browser?.close();await fixture.close();});browser=await launch();const page=await browser.newPage();
 await page.route('**/*',r=>r.request().url().startsWith(fixture.url)?r.continue():r.abort());
 await page.goto(fixture.url+'/login.html');await page.locator('#identifier').fill('admin');await page.locator('#password').fill('Fixture-passphrase-2026!');await page.locator('#submitBtn').click();
 await page.waitForURL('**/dashboard.html');await page.waitForFunction(()=>document.body.classList.contains('login-app-open'));
 assert.equal(await page.locator('main').evaluate(el=>getComputedStyle(el).display),'none');
 assert.equal(await page.evaluate(()=>document.getAnimations().filter(a=>a.playState==='running').length),0);
 await page.goBack();await page.locator('#submitBtn').waitFor({state:'visible'});assert(await page.locator('#submitBtn').isEnabled());assert.equal(await page.locator('main').evaluate(el=>el.inert),false);
});
test('AS list coalesces resize bursts, skips unchanged dimensions and recalculates changed dimensions',async t=>{
 const fixture=await startFixture();let browser;t.after(async()=>{await browser?.close();await fixture.close();});browser=await launch();const context=await browser.newContext({viewport:{width:1440,height:960}}),page=await context.newPage();
 await context.request.post(fixture.url+'/api/login',{headers:{'X-Requested-With':'process-server'},data:{id:'admin',password:'Fixture-passphrase-2026!'}});
 await page.route('**/*',r=>r.request().url().startsWith(fixture.url)?r.continue():r.abort());
 await page.goto(fixture.url+'/dashboard.html');await page.waitForFunction(()=>currentUser?.id==='admin');
 await page.evaluate(async()=>{switchTab('as',document.querySelector('[data-sub="list"]'),'list');await loadAsList();_asFullList=Array.from({length:200},(_,i)=>({id:'perf-'+i,asNo:'PERF-'+i,ship:'H-2026',status:'접수',createdAt:'2026-11-14',files:[]}));_asFiltered=_asFullList;_renderAsPage();const original=CanvasRenderingContext2D.prototype.measureText;window.measures=0;CanvasRenderingContext2D.prototype.measureText=function(...args){measures++;return original.apply(this,args);};});
 const settle=()=>page.evaluate(()=>new Promise(resolve=>{let n=6;const tick=()=>--n?requestAnimationFrame(tick):resolve();requestAnimationFrame(tick);}));await settle();
 await page.evaluate(()=>{measures=0;for(let i=0;i<12;i++)dispatchEvent(new Event('resize'));});await settle();
 assert.equal(await page.evaluate(()=>measures),0,'Unchanged dimensions must not remeasure 200 records');
 await page.evaluate(()=>{measures=0;document.querySelector('#asSubList .as-ledger-scroll').style.width='calc(100% - 8px)';for(let i=0;i<12;i++)dispatchEvent(new Event('resize'));});await settle();
 assert.equal(await page.evaluate(()=>measures),2600,'Resize events and observer must share one 200-record measurement');
 const width=await page.locator('#asSubList .as-erp-table').evaluate(el=>el.style.width);assert(parseFloat(width)>1000);
 await page.evaluate(()=>{measures=0;_asFullList[0].ship='새 데이터 반영';_renderAsPage();});await settle();assert(await page.evaluate(()=>measures)>0,'Data refresh must still lay out the table at the same viewport size');
});
