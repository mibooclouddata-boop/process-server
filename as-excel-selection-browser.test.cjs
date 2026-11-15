'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises');
const {chromium}=require('playwright'),{startFixture}=require('./test-support/as-fixture.cjs');

test('Excel downloads only checked AS rows, including select-all on a paginated list',async t=>{
 const fixture=await startFixture();let browser;
 t.after(async()=>{await browser?.close();await fixture.close();});
 browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHANNEL?{channel:process.env.PLAYWRIGHT_CHANNEL}:process.platform==='win32'?{channel:'msedge'}:{})});
 const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 assert.equal((await context.request.post(fixture.url+'/api/login',{headers:{'X-Requested-With':'process-server'},data:{id:'admin',password:'Fixture-passphrase-2026!'}})).status(),200);
 await page.route('**/*',route=>route.request().url().startsWith(fixture.url)?route.continue():route.abort());
 await page.goto(fixture.url+'/dashboard.html');await page.waitForFunction(()=>currentUser?.id==='admin');
 await page.evaluate(async()=>{
  switchTab('as',document.querySelector('[data-sub="list"]'),'list');await loadAsList();
  _asFullList=Array.from({length:25},(_,i)=>({id:'excel-'+i,asNo:'EXPORT-'+i,requestingCompany:i===0?'':i===2?'<img src=x onerror="alert(1)">':i%2?'나래산업':'가온산업',ship:i%2?'BETA':'ALPHA',status:'접수',files:[],createdAt:'2026-11-01'}));
  _asFiltered=_asFullList;_asPage=1;_renderAsPage();
 });
 const checkboxes=page.locator('#asTableBody .as-row-cb');
 const selectAll=page.locator('#asSubList .as-column-header input[type="checkbox"]');
 assert.equal(await page.locator('.as-column-header th').count(),18);
 assert.equal(await page.locator('.as-column-header th').nth(7).textContent(),'요청 업체');
 assert.equal(await page.locator('#asTableBody tr[data-id="excel-0"] td').nth(7).textContent(),'—');
 assert.equal(await page.locator('#asTableBody tr[data-id="excel-2"] td').nth(7).textContent(),'<img src=x onerror="alert(1)">');
 assert.equal(await page.locator('#asTableBody img').count(),0);
 const receipt=await page.evaluate(async()=>{
  const {pageHtml}=await buildAsPageHtml({..._asFullList[2],requestingCompany:'출력 & <요청 업체>'});
  return pageHtml;
 });
 assert.match(receipt,/출력 &amp; &lt;요청 업체&gt;/);
 await fs.mkdir(__dirname+'/.artifacts/as-requesting-company-column',{recursive:true});
 await page.screenshot({path:__dirname+'/.artifacts/as-requesting-company-column/desktop.png'});
 async function exportedNumbers(){
  const pending=page.waitForEvent('download');await page.getByRole('button',{name:'Excel',exact:true}).click();
  const download=await pending;assert.match(download.suggestedFilename(),/^AS접수목록_.*\.xls$/);
  const html=await fs.readFile(await download.path(),'utf8');await download.delete();
  assert.match(html,/>요청 업체<\/b>/);
  return [...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)].flatMap(([,row])=>{
   const first=row.match(/<td\b[^>]*>([\s\S]*?)<\/td>/);return first?[first[1]]:[];
  });
 }
 await checkboxes.nth(2).check();
 assert.deepEqual(await exportedNumbers(),['EXPORT-2']);
 await checkboxes.nth(7).check();
 assert.deepEqual(await exportedNumbers(),['EXPORT-2','EXPORT-7']);
 await selectAll.check();
 assert.deepEqual(await exportedNumbers(),Array.from({length:20},(_,i)=>'EXPORT-'+i));
 await page.evaluate(()=>asGoPage(2));await selectAll.check();
 assert.deepEqual(await exportedNumbers(),Array.from({length:5},(_,i)=>'EXPORT-'+(i+20)));
 await selectAll.uncheck();
 assert.deepEqual(await exportedNumbers(),Array.from({length:25},(_,i)=>'EXPORT-'+i));
 await page.locator('#asSearch').fill('ALPHA');await page.waitForFunction(()=>_asFiltered.length===13);
 await checkboxes.nth(1).check();
 assert.deepEqual(await exportedNumbers(),['EXPORT-2']);
 await checkboxes.nth(1).uncheck();
 assert.deepEqual(await exportedNumbers(),Array.from({length:13},(_,i)=>'EXPORT-'+i*2));
 await page.locator('#asSearch').fill('');await page.keyboard.press('Enter');
 await page.locator('th[data-col="requestingCompany"]').click();
 assert.equal(await page.locator('th[data-col="requestingCompany"]').getAttribute('aria-sort'),'ascending');
 await page.locator('#asSearchFieldBtn').click();
 await page.getByRole('option',{name:'요청 업체',exact:true}).click();
 await page.locator('#asSearch').fill('나래산업');await page.keyboard.press('Enter');
 await page.waitForFunction(()=>_asFiltered.length===12);
 assert.equal(await page.locator('#asTableBody tr[data-id]').count(),12);
 await page.setViewportSize({width:390,height:844});
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 const dimensions=await page.locator('.as-erp-table').evaluate(table=>({heads:table.tHead.rows[0].cells.length,cols:table.querySelectorAll('colgroup col').length,rows:[...table.tBodies[0].rows].every(row=>row.cells.length===18)}));
 assert.deepEqual(dimensions,{heads:18,cols:18,rows:true});
 await page.screenshot({path:__dirname+'/.artifacts/as-requesting-company-column/mobile.png'});
 await page.setViewportSize({width:1440,height:1000});
 await page.locator('#asSearch').fill('존재하지않는업체');await page.keyboard.press('Enter');
 await page.waitForFunction(()=>_asFiltered.length===0);
 assert.equal(await page.locator('.as-ledger-no-results td').getAttribute('colspan'),'18');
 await page.locator('#asSearchFieldBtn').click();await page.getByRole('option',{name:'전체 항목',exact:true}).click();
 await page.locator('#asSearch').fill('ALPHA');await page.keyboard.press('Enter');await page.waitForFunction(()=>_asFiltered.length===13);
 await page.evaluate(()=>{_asSortCol='createdAt';_asSortDir='desc';_applyAsFilters();});
 assert.deepEqual(errors,[]);
});
