'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {chromium}=require('@playwright/test');
const {startFixture}=require('./test-support/as-fixture.cjs');
test('monthly receipt axis rounds up and fits labels as counts and viewport change',async t=>{
 const fixture=await startFixture();let browser;
 t.after(async()=>{if(browser)await browser.close();await fixture.close();});
 browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'msedge'}:{})});
 const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'});
 await context.request.post(fixture.url+'/api/login',{headers:{'X-Requested-With':'process-server'},data:{id:'admin',password:'Fixture-passphrase-2026!'}});
 const page=await context.newPage();await page.goto(fixture.url+'/dashboard.html');await page.locator('#asStatsContent:not([hidden])').waitFor();
 await page.evaluate(()=>{
  const summarize=summarizeAsStatistics;
  window.axisFixturePeak=0;
  summarizeAsStatistics=(...args)=>({...summarize(...args),counts:Array.from({length:12},(_,i)=>i===0?window.axisFixturePeak:Math.floor(window.axisFixturePeak/2))});
  const year=document.getElementById('asStatsYear');year.add(new Option('2025','2025'));year.value='2025';
 });
 for(const viewport of [{width:1440,height:900},{width:1366,height:768},{width:390,height:844}]){
  await page.setViewportSize(viewport);
  for(const peak of [0,1,59,137,12345,1234567]){
   await page.evaluate(peak=>{window.axisFixturePeak=peak;renderAsStatistics();},peak);
   const result=await page.locator('.as-readable-trend .plot').evaluate(plot=>{
    const svg=plot.querySelector('svg'),bounds=svg.getBoundingClientRect();
    return [...svg.querySelectorAll('.axis-tick:not(.month-tick)')].map(e=>{const r=e.getBoundingClientRect();return {value:Number(e.textContent.replaceAll(',','')),fits:r.left>=bounds.left-.5&&r.right<=bounds.right+.5&&r.top>=bounds.top-.5&&r.bottom<=bounds.bottom+.5};});
   });
   const ticks=result.map(t=>t.value),top=ticks.at(-1);
   assert.equal(ticks[0],0);assert.ok(top>=Math.max(1,peak),JSON.stringify({viewport,peak,ticks}));
   assert.ok(result.every(t=>t.fits),'axis label clipped: '+JSON.stringify({viewport,peak,result}));
   if(peak)assert.ok(top-peak<ticks[1],'axis has excess empty intervals');
   if(viewport.width===1440&&peak===59)assert.deepEqual(ticks,[0,20,40,60]);
  }
 }
});
