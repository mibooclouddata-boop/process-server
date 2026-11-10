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
  _asFullList=Array.from({length:25},(_,i)=>({id:'excel-'+i,asNo:'EXPORT-'+i,ship:i%2?'BETA':'ALPHA',status:'접수',files:[],createdAt:'2026-11-01'}));
  _asFiltered=_asFullList;_asPage=1;_renderAsPage();
 });
 const checkboxes=page.locator('#asTableBody .as-row-cb');
 const selectAll=page.locator('#asSubList .as-column-header input[type="checkbox"]');
 async function exportedNumbers(){
  const pending=page.waitForEvent('download');await page.getByRole('button',{name:'Excel',exact:true}).click();
  const download=await pending;assert.match(download.suggestedFilename(),/^AS접수목록_.*\.xls$/);
  const html=await fs.readFile(await download.path(),'utf8');await download.delete();
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
 await page.locator('#asSearch').fill('ALPHA');await page.evaluate(()=>_applyAsFilters());
 await checkboxes.nth(1).check();
 assert.deepEqual(await exportedNumbers(),['EXPORT-2']);
 await checkboxes.nth(1).uncheck();
 assert.deepEqual(await exportedNumbers(),Array.from({length:13},(_,i)=>'EXPORT-'+i*2));
 assert.deepEqual(errors,[]);
});
