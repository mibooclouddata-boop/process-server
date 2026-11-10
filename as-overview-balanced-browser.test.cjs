'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('@playwright/test'),{startFixture}=require('./test-support/as-fixture.cjs');
test('balanced overview aligns charts and inline comparison, and header switches to monthly distribution',async t=>{
 const f=await startFixture();let browser;t.after(async()=>{await browser?.close();await f.close();});
 fs.writeFileSync(path.join(f.dir,'as.json'),JSON.stringify({seq:60,list:Array.from({length:60},(_,i)=>({id:'sample-'+i,asNo:'AS-2026-'+i,createdAt:i===59?'2026-11-01':'2026-10-01',status:'접수',product:'예시 제품',reason:'치수 오작',amount:1000}))}));
 const seed=JSON.parse(fs.readFileSync(path.join(f.dir,'as.json'),'utf8'));
 seed.list.push(...Array.from({length:3},(_,i)=>({id:'previous-'+i,asNo:'AS-2025-'+i,createdAt:'2025-11-01',status:'접수',product:'이전 연도 제품',reason:'치수 오작',amount:1000})));seed.seq=63;
 fs.writeFileSync(path.join(f.dir,'as.json'),JSON.stringify(seed));
 browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'msedge'}:{})});
 const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.clock.setFixedTime(new Date('2026-11-03T00:00:00Z'));
 await context.request.post(f.url+'/api/login',{headers:{'X-Requested-With':'process-server'},data:{id:'admin',password:'Fixture-passphrase-2026!'}});
 await page.route('**/*',r=>r.request().url().startsWith(f.url)?r.continue():r.abort());
 await page.goto(f.url+'/dashboard.html');await page.locator('#asStatsContent:not([hidden])').waitFor();
 const selectYear=async year=>{
  assert.equal(await page.locator('#asOverviewMenu').evaluate(el=>el.matches(':popover-open')),false);
  await page.locator('#asStatsYearPickerBtn').click();
  await page.locator('#asStatsYearPickerPanel').getByRole('option',{name:year+'년',exact:true}).click();
  assert.equal(await page.locator('#asStatsYearPickerBtn').getAttribute('aria-expanded'),'false');
  assert.equal(await page.locator('#asStatsYear').inputValue(),String(year));
  assert.equal(await page.locator('#asStatsYearPickerLabel').textContent(),year+'년');
 };
 await page.locator('#asStatsChart .month-button').nth(10).click();
 assert.equal(await page.locator('#comparison-count').textContent(),'1건');assert.equal(await page.locator('#comparison-change-value').textContent(),'−58');
 assert.equal(await page.locator('.as-readable-trend .as-chart-unit').count(),0);
 for(const [width,height] of [[1440,900],[1280,800],[1920,1080],[390,844]]){
  await page.setViewportSize({width,height});await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  if(width>1100){
   const layout=await page.evaluate(()=>{const rect=s=>document.querySelector(s).getBoundingClientRect(),count=rect('#comparison-count'),change=rect('#comparison-change'),trend=rect('.as-readable-trend'),amount=rect('.as-column-amount'),reasons=rect('.as-reason-ranking-panel'),recent=rect('.as-recent-panel');const unitRange=document.createRange(),captionRange=document.createRange();unitRange.selectNodeContents(document.querySelector('#comparison-count small'));captionRange.selectNode(document.querySelector('#comparison-change').firstChild);return {height:document.documentElement.scrollHeight,chartAligned:trend.left===amount.left&&trend.width===amount.width,sideAligned:reasons.left===recent.left&&reasons.width===recent.width,inline:change.left>count.right&&change.top<count.bottom,baselineGap:Math.abs(unitRange.getBoundingClientRect().bottom-captionRange.getBoundingClientRect().bottom)};});
   assert(layout.height<=height+1);assert(layout.chartAligned);assert(layout.sideAligned);assert(layout.inline);assert(layout.baselineGap<=2);
  }
  await selectYear(2025);assert.equal(await page.locator('#comparison-count').textContent(),'3건');await selectYear(2026);
  await page.locator('#asSubmenu [data-sub=stats]').click();await page.getByRole('menuitemradio',{name:'월별 유형 분포',exact:true}).click();
  await selectYear(2025);assert.equal(await page.locator('#asReasonHeatFoot td').last().textContent(),'3');await selectYear(2026);
  assert(await page.locator('.as-reason-heatmap-panel').isVisible());assert.equal(await page.locator('.as-recent-panel').isVisible(),false);
  if(width>1100)assert(await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight+1));
  await page.locator('#asSubmenu [data-sub=stats]').click();await page.getByRole('menuitemradio',{name:'접수 현황',exact:true}).click();
  assert(await page.locator('.as-recent-panel').isVisible());assert.equal(await page.locator('.as-reason-heatmap-panel').isVisible(),false);
 }
 await page.setViewportSize({width:1440,height:900});await page.locator('#asSubmenu [data-sub=stats]').click();await page.keyboard.press('ArrowDown');await page.keyboard.press('Escape');
 assert.equal(await page.locator('#asSubmenu [data-sub=stats]').getAttribute('aria-expanded'),'false');
 await page.locator('#asStatsChart .month-button').nth(9).click();assert.equal(await page.locator('.as-readable-trend .as-chart-unit').count(),0);
 await page.locator('#asKpiRow button').first().click();await page.locator('#asSubList').waitFor({state:'visible'});assert.equal(await page.locator('body').evaluate(e=>e.classList.contains('as-balanced-active')),false);
 for(const [width,height] of [[1440,900],[1280,800],[1101,760],[1024,768],[768,1024],[390,844],[1440,600]]){
  await page.setViewportSize({width,height});
  await page.locator('#asSubmenu [data-sub=stats]').click();await page.getByRole('menuitemradio',{name:'접수 현황',exact:true}).click();
  await page.locator('#asStatsContent:not([hidden])').waitFor();await page.evaluate(()=>window.scrollTo(0,0));
  await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  const stats=await page.locator('#asStatsContent').boundingBox();
  await page.locator('#tabAsBtn').click();await page.getByRole('menuitem',{name:'AS 목록',exact:true}).click();await page.locator('#asSubList').waitFor({state:'visible'});
  await page.evaluate(()=>window.scrollTo(0,0));await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  const list=await page.locator('#asSubList').boundingBox();
  for(const edge of ['x','y','right',...(width>=1101&&height>=760?['bottom']:[])]){
   const value=(box)=>edge==='right'?box.x+box.width:edge==='bottom'?box.y+box.height:box[edge];
   assert(Math.abs(value(stats)-value(list))<=1,JSON.stringify({width,height,edge,stats,list}));
  }
 }
 assert.deepEqual(errors,[]);
});
