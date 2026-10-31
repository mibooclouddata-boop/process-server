'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {startFixture}=require('./test-support/as-fixture.cjs');

test('central write indicator follows actual responses and preserves forms on failure',async t=>{
 const fixture=await startFixture();let browser,release;
 t.after(async()=>{release?.();if(browser)await browser.close();await fixture.close();});
 browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHANNEL?{channel:process.env.PLAYWRIGHT_CHANNEL}:process.platform==='win32'?{channel:'msedge'}:{})});
 const context=await browser.newContext(),page=await context.newPage(),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/*',route=>route.request().url().startsWith(fixture.url)?route.continue():route.abort());
 assert.equal((await context.request.post(fixture.url+'/api/login',{headers:{'X-Requested-With':'process-server'},data:{id:'admin',password:'Fixture-passphrase-2026!'}})).status(),200);
 await page.goto(fixture.url+'/dashboard.html#as-list');await page.waitForFunction(()=>currentUser?.id==='admin');
 let fail=true,writes=0,onRequest;
 const nextRequest=()=>new Promise(resolve=>{onRequest=resolve;});
 await page.route('**/api/as',async route=>{
  if(route.request().method()!=='POST')return route.continue();
  writes++;const responseGate=new Promise(resolve=>{release=resolve;});onRequest();await responseGate;
  if(fail)return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'지연 응답 테스트'})});
  return route.continue();
 });
 await page.evaluate(()=>openAsModal());
 await page.locator('#asShip').fill('TEST');await page.locator('#asBlock').fill('B01');
 await page.locator('#asReasonSelect').selectOption('기타');await page.locator('#asReason').fill('로딩 검증');
 await page.locator('#asDeliveryAgreedDate').fill('2099-12-31');
 const save=page.locator('#asModal button[onclick="submitAs()"]'),progress=page.locator('#asWriteProgress');
 const failedRequest=nextRequest(),failedStarted=Date.now();
 await save.click();await failedRequest;await progress.waitFor({state:'visible'});
 assert.equal(await page.locator('#asWriteProgressTitle').textContent(),'저장 중');assert(await save.isDisabled());
 assert.equal(fixture.read('as.json').list.length,0);
 await page.keyboard.press('Escape');assert(await progress.isVisible());
 await page.evaluate(()=>submitAs());assert.equal(writes,1);
 const fonts=await page.evaluate(()=>[getComputedStyle(document.getElementById('asModal')).fontFamily,getComputedStyle(document.getElementById('asWriteProgress')).fontFamily]);assert.equal(fonts[0],fonts[1]);
 await page.emulateMedia({reducedMotion:'reduce'});
 assert.equal(await page.locator('.as-write-ring').evaluate(el=>getComputedStyle(el).animationName),'none');
 release();await progress.waitFor({state:'hidden'});await page.waitForFunction(()=>!asSaving);
 assert(Date.now()-failedStarted>=3000,'failed writes also keep the indicator for at least three seconds');
 assert.equal(await page.locator('#asReason').inputValue(),'로딩 검증');assert(await save.isEnabled());assert.equal(fixture.read('as.json').list.length,0);
 fail=false;const savedRequest=nextRequest(),savedStarted=Date.now();await save.click();await savedRequest;await progress.waitFor({state:'visible'});release();await page.locator('#asModal').waitFor({state:'hidden'});
 assert(Date.now()-savedStarted>=3000,'fast successful writes must not dismiss the indicator early');
 await page.locator('#toastContainer').waitFor({state:'hidden'});assert.equal(fixture.read('as.json').list.length,1);
 await page.route('**/api/as/*/workflow',async route=>{const responseGate=new Promise(resolve=>{release=resolve;});onRequest();await responseGate;await route.continue();});
 await page.evaluate(async()=>{await loadAsList();openAsWorkflow(_asFullList[0]);});
 const workflow=page.locator('#asJobDialog');
 const bounds=()=>workflow.evaluate(el=>{const {x,y,width,height}=el.getBoundingClientRect();return {x,y,width,height};});
 const requestBounds=await bounds();
 const workflowRequest=nextRequest();await page.locator('#asJobDialog button[type="submit"]').click();await workflowRequest;await progress.waitFor({state:'visible'});
 assert.deepEqual(await bounds(),requestBounds,'saving must not resize or move the request dialog');
 // Simulate an upstream response slower than the minimum display duration.
 await page.waitForTimeout(3200);assert(await progress.isVisible());
 assert.equal(await page.locator('#asWriteProgressTitle').textContent(),'전산 처리 중');assert.equal(fixture.read('as.json').list[0].status,'접수');
 release();await page.locator('#asJobDialog').waitFor({state:'hidden'});assert.equal(fixture.read('as.json').list[0].status,'제작 요청');
 for(const [width,nextStatus] of [[1440,'도장 요청'],[390,'납품 요청'],[1440,'완료']]){
  await page.locator('#toastContainer').waitFor({state:'hidden'});
  await page.setViewportSize({width,height:900});
  await page.evaluate(async()=>{await loadAsList();openAsWorkflow(_asFullList[0]);});
  const completed=page.locator('#asJobCompleted'),date=await page.evaluate(()=>asJobToday());
  await completed.fill(date);
  const before=await bounds(),request=nextRequest();
  const complete=workflow.locator('button[type="submit"]');
  await complete.click();await request;await progress.waitFor({state:'visible'});
  assert.deepEqual(await bounds(),before,'saving must not resize or move a completion dialog');
  assert(await complete.isDisabled());assert.equal(await completed.inputValue(),date);
  release();await workflow.waitFor({state:'hidden'});
  assert.equal(fixture.read('as.json').list[0].status,nextStatus);
 }
 assert(await progress.isHidden());assert.deepEqual(errors,[]);
});
