const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium,expect}=require('@playwright/test'),{startFixture}=require('./test-support/as-fixture.cjs');
test('month count keeps typography and height throughout rolling and rapid selections',async t=>{
 const f=await startFixture();let browser;t.after(async()=>{await browser?.close();await f.close()});
 const list=Array.from({length:15},(_,i)=>({id:'trend-'+i,asNo:'TEST-'+i,createdAt:i<3?'2025-02-15':'2025-03-15',status:'접수'}));
 fs.writeFileSync(path.join(f.dir,'as.json'),JSON.stringify({seq:15,list}));
 browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'msedge'}:{})});
 const c=await browser.newContext(),p=await c.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
 await c.request.post(f.url+'/api/login',{headers:{'X-Requested-With':'process-server'},data:{id:'admin',password:'Fixture-passphrase-2026!'}});
 await p.goto(f.url+'/dashboard.html');await p.locator('#asStatsContent').waitFor();
 await p.evaluate(()=>showAsStatisticsMonth(2025,1));const count=p.locator('#comparison-count');
 await expect(count).toHaveText('0건');
 const measure=()=>count.evaluate(e=>({height:e.getBoundingClientRect().height,card:e.closest('.as-stats-chart-panel').getBoundingClientRect().height,font:getComputedStyle(e).fontSize}));
 const baseline=await measure();
 for(const [month,text] of [[2,'3건'],[3,'12건'],[1,'0건']]){
  await p.locator('#asStatsChart .month-button').nth(month-1).click();
  await expect(count.locator('[aria-hidden=true]')).toBeVisible();
  const fonts=await count.locator('[aria-hidden=true] span').evaluateAll(es=>es.map(e=>getComputedStyle(e).fontSize));
  assert.ok(fonts.length);assert.ok(fonts.every(font=>font===baseline.font),JSON.stringify(fonts));
  assert.deepEqual(await measure(),baseline);
  await expect(count.locator('[aria-hidden=true]')).toHaveCount(0);await expect(count).toHaveText(text);
  assert.deepEqual(await measure(),baseline);
 }
 await p.evaluate(()=>{showAsStatisticsMonth(2025,2);showAsStatisticsMonth(2025,3)});
 await expect(count.locator('[aria-hidden=true]')).toHaveCount(0);await expect(count).toHaveText('12건');
 await p.emulateMedia({reducedMotion:'reduce'});await p.evaluate(()=>showAsStatisticsMonth(2025,2));
 await expect(count).toHaveText('3건');await expect(count.locator('[aria-hidden=true]')).toHaveCount(0);
 assert.deepEqual(errors,[]);
});
