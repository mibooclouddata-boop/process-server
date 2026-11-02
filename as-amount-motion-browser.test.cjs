const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium,expect}=require('@playwright/test'),{startFixture}=require('./test-support/as-fixture.cjs');
test('monthly amounts roll changed digits and preserve values, layout, and reduced motion',async t=>{
 const f=await startFixture();let browser;t.after(async()=>{await browser?.close();await f.close()});
 const amounts=[29169000,29192000,900,0,Number.MAX_SAFE_INTEGER,Number.MAX_SAFE_INTEGER];
 fs.writeFileSync(path.join(f.dir,'as.json'),JSON.stringify({seq:6,list:amounts.map((amount,i)=>({id:'motion-'+i,asNo:'TEST-'+i,createdAt:'2025-'+String(i<5?i+1:5).padStart(2,'0')+'-15',amount,status:'접수'}))}));
 browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'msedge'}:{})});const c=await browser.newContext(),p=await c.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
 await c.request.post(f.url+'/api/login',{headers:{'X-Requested-With':'process-server'},data:{id:'admin',password:'Fixture-passphrase-2026!'}});await p.goto(f.url+'/dashboard.html');await p.locator('#asStatsContent').waitFor();
 const value=p.locator('#asAmountSelectedValue'),running=()=>p.evaluate(()=>document.getAnimations().filter(a=>a.id==='as-amount-digit-roll').length);
 await p.evaluate(()=>showAsStatisticsMonth(2025,1));await expect(value).toHaveText('29,169,000원');
 // Use the app's real chart controls for subsequent month changes.
 const firstHeight=await value.evaluate(e=>e.getBoundingClientRect().height),unitX=(await value.locator('small').boundingBox()).x;
 await p.locator('#asAmountChart .as-amount-month').nth(1).click();await expect.poll(running).toBeGreaterThan(0);
 assert.equal(await value.getAttribute('aria-label'),'29,192,000원');
 assert.equal(await value.evaluate(e=>e.getBoundingClientRect().height),firstHeight);
 await expect.poll(running).toBe(0);await expect(value).toHaveText('29,192,000원');
 await p.evaluate(()=>{showAsStatisticsMonth(2025,3);showAsStatisticsMonth(2025,4)});await expect.poll(running).toBe(0);await expect(value).toHaveText('0원');
 assert.equal((await value.locator('small').boundingBox()).x,unitX);
 await p.evaluate(()=>showAsStatisticsMonth(2025,5));await expect.poll(running).toBe(0);await expect(value).toHaveText('18,014,398,509,481,982원');
 await p.evaluate(()=>showAsStatisticsMonth(2025,6));await expect(value).toHaveText('금액 미입력');assert.equal(await value.locator('small').count(),0);
 await p.evaluate(()=>showAsStatisticsMonth(2025,1));await p.evaluate(()=>showAsStatisticsMonth(2025,2));await p.emulateMedia({reducedMotion:'reduce'});await expect.poll(running).toBe(0);await expect(value).toHaveText('29,192,000원');
 await p.evaluate(()=>showAsStatisticsMonth(2025,1));assert.equal(await running(),0);
 assert.deepEqual(errors,[]);
});
