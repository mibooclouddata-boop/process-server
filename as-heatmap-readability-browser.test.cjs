'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {chromium}=require('@playwright/test');
const {startFixture}=require('./test-support/as-fixture.cjs');
test('monthly type heatmap uses readable type and contrast in both display modes',async t=>{
 const f=await startFixture();let browser;t.after(async()=>{if(browser)await browser.close();await f.close();});
 browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'msedge'}:{})});
 const c=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'});
 await c.request.post(f.url+'/api/login',{headers:{'X-Requested-With':'process-server'},data:{id:'admin',password:'Fixture-passphrase-2026!'}});
 const p=await c.newPage();await p.goto(f.url+'/dashboard.html');await p.locator('#asStatsContent:not([hidden])').waitFor();
 await p.evaluate(()=>{_asStatsRecords=AS_REASON_TYPES.flatMap((reason,r)=>Array.from({length:(r+1)*3},(_,i)=>({id:'heatmap-readability-'+r+'-'+i,createdAt:'2026-01-01',reason,status:'접수'})));document.getElementById('asStatsYear').value='2026';renderAsStatistics();document.getElementById('asSubStats').dataset.overviewPage='2';window.dispatchEvent(new Event('resize'));});
 for(const viewport of [{width:1440,height:900},{width:1366,height:768},{width:390,height:844}]){
  await p.setViewportSize(viewport);
  const switchSize=await p.locator('#asReasonHeatToggle').evaluate(e=>({height:e.getBoundingClientRect().height,font:getComputedStyle(e.querySelector('span')).fontSize}));
  assert.ok(switchSize.height>=44);assert.equal(switchSize.font,'14px');
  assert.equal(await p.locator('.as-reason-heatmap-table thead th').nth(1).evaluate(e=>getComputedStyle(e).fontSize),'14px');
  for(let mode=0;mode<2;mode++){
   const failures=await p.locator('.as-reason-heat-cell').evaluateAll(cells=>{
    const luminance=rgb=>{const v=rgb.match(/[\d.]+/g).slice(0,3).map(n=>{n=Number(n)/255;return n<=.04045?n/12.92:((n+.055)/1.055)**2.4;});return v[0]*.2126+v[1]*.7152+v[2]*.0722;};
    return cells.flatMap(cell=>{const s=getComputedStyle(cell),a=luminance(s.color),b=luminance(s.backgroundColor),ratio=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);return ratio<4.5||s.fontSize!=='15px'?[{text:cell.textContent,ratio,fontSize:s.fontSize}]:[];});
   });assert.deepEqual(failures,[]);
   const cell=p.locator('.as-reason-heat-cell[data-row="0"][data-month="0"]');await cell.click();assert.equal(await cell.getAttribute('aria-pressed'),'true');
   await p.locator('#asReasonHeatToggle').click();
   assert.equal((await cell.textContent()).includes('%'),mode===0);
  }
  assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 }
 await p.locator('.as-reason-heat-cell').first().focus();await p.keyboard.press('ArrowRight');
 assert.equal(await p.locator('.as-reason-heat-cell').nth(1).evaluate(e=>e===document.activeElement),true);
});
