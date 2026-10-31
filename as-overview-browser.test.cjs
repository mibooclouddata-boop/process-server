'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright'),{startFixture}=require('./test-support/as-fixture.cjs');

test('overview total includes completed receipts and clicking it clears filters to show all receipts',async t=>{
 const fixture=await startFixture();let browser;t.after(async()=>{await browser?.close();await fixture.close();});
 const statuses=['접수','제작 요청','도장 요청','납품 요청','완료'];
 const list=statuses.map((status,i)=>({id:'overview-'+i,asNo:'AS-TEST-'+i,ship:'TEST-'+i,block:'B01',reason:'기타',category:'사내',status,createdAt:i===4?'2025-01-01':'2026-01-01',version:0}));
 fs.writeFileSync(path.join(fixture.dir,'as.json'),JSON.stringify({list,seq:list.length}));
 browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'msedge'}:{})});
 const context=await browser.newContext({viewport:{width:1366,height:900}}),page=await context.newPage(),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 assert.equal((await context.request.post(fixture.url+'/api/login',{headers:{'X-Requested-With':'process-server'},data:{id:'admin',password:'Fixture-passphrase-2026!'}})).status(),200);
 await page.route('**/*',route=>route.request().url().startsWith(fixture.url)?route.continue():route.abort());
 await page.goto(fixture.url+'/dashboard.html');await page.locator('#asStatsContent').waitFor({state:'visible'});
 const total=page.locator('#asKpiRow button').first();
 assert.equal(await total.locator('span').textContent(),'전체');
 assert.equal(await total.locator('strong').textContent(),'5');
 await page.evaluate(()=>{document.getElementById('asSearch').value='no match';document.getElementById('asDateFrom').value='2030-01-01';setAsDdValue('asStatusFilter','pending');});
 await total.click();await page.locator('#asSubList').waitFor({state:'visible'});
 await page.waitForFunction(()=>document.querySelectorAll('#asTableBody tr[data-id]').length===5);
 assert.equal(await page.locator('#asStatusFilter').inputValue(),'');assert.equal(await page.locator('#asSearch').inputValue(),'');assert.equal(await page.locator('#asDateFrom').inputValue(),'');
 assert.match(await page.locator('#asTableBody').textContent(),/완료/);
 await page.locator('#asLedgerBack').click();await page.locator('#asStatsContent').waitFor({state:'visible'});
 await page.locator('#asKpiRow button').nth(1).click();await page.waitForFunction(()=>document.querySelectorAll('#asTableBody tr[data-id]').length===1);
 assert.equal(await page.locator('#asStatusFilter').inputValue(),'접수');assert.match(await page.locator('#asTableBody').textContent(),/TEST-0/);
 assert.deepEqual(errors,[]);
});
