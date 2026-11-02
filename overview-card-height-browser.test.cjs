'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {chromium}=require('playwright'),{startFixture}=require('./test-support/as-fixture.cjs');
test('overview cards keep their height through empty, populated and paginated months',async t=>{
 const f=await startFixture();let browser;t.after(async()=>{await browser?.close();await f.close();});
 browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'msedge'}:{})});
 const c=await browser.newContext(),p=await c.newPage();
 await c.request.post(f.url+'/api/login',{headers:{'X-Requested-With':'process-server'},data:{id:'admin',password:'Fixture-passphrase-2026!'}});
 await p.route('**/*',r=>r.request().url().startsWith(f.url)?r.continue():r.abort());
 await p.goto(f.url+'/dashboard.html');await p.locator('#asStatsContent').waitFor();
 for(const width of [1440,900,375]){
  await p.setViewportSize({width,height:900});
  const samples=await p.evaluate(async()=>{
   _asStatsRecords=[...Array.from({length:3},(_,i)=>({id:'three'+i,createdAt:'2025-02-01',reason:'기타',product:'제품',status:'접수'})),...Array.from({length:6},(_,i)=>({id:'six'+i,createdAt:'2025-03-01',reason:'기타',product:'제품 '+i,status:'접수'}))];
   document.getElementById('asStatsYear').innerHTML='<option value="2025">2025</option>';
   const read=()=>[...document.querySelectorAll('#asSubStats .as-stats-chart-panel,#asKpiRow>button')].map(e=>Math.round(e.getBoundingClientRect().height));
   showAsStatisticsMonth(2025,1);
   for(let i=0;i<30;i++)await new Promise(requestAnimationFrame);
   const result=[read()];
   for(const month of [2,1,3,2,1]){showAsStatisticsMonth(2025,month);for(let i=0;i<30;i++){await new Promise(requestAnimationFrame);result.push(read());}}
   return result;
  });
  for(const sample of samples)assert.deepEqual(sample,samples[0],`Card height changed at width ${width}`);
 }
});
