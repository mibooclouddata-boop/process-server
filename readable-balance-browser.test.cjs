'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright'),{startFixture}=require('./test-support/as-fixture.cjs');
const {expect}=require('@playwright/test');
test('readable balance keeps real overview interactions with neutral charts and reduced motion',async t=>{
 const f=await startFixture();let browser;t.after(async()=>{await browser?.close();await f.close();});
 const year=new Date().getFullYear()-1;
 const list=Array.from({length:36},(_,i)=>({id:'balance-'+i,asNo:'AS-TEST-'+i,ship:'TEST',block:'B01',product:i%2?'LADDER':'HANDRAIL',reason:i%3?'치수 오작':'도장 불량',category:'사내',status:['접수','제작 요청','도장 요청','납품 요청','완료'][i%5],createdAt:`${year}-${String(i%12+1).padStart(2,'0')}-01`,amount:(i+1)*10000,version:0}));
 fs.writeFileSync(path.join(f.dir,'as.json'),JSON.stringify({list,seq:list.length}));
 browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'msedge'}:{})});
 const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await context.request.post(f.url+'/api/login',{headers:{'X-Requested-With':'process-server'},data:{id:'admin',password:'Fixture-passphrase-2026!'}});
 await page.route('**/*',r=>r.request().url().startsWith(f.url)?r.continue():r.abort());
 await page.goto(f.url+'/dashboard.html');await page.locator('#asStatsContent').waitFor({state:'visible'});
 await page.evaluate(y=>showAsStatisticsMonth(y,3),year);
 await expect(page.locator('.as-readable-trend .trend-line').first()).toHaveCSS('stroke','rgb(119, 119, 119)');
 assert.equal(await page.locator('#kpiTotal').evaluate(el=>getComputedStyle(el).color),'rgb(17, 17, 17)');
 assert.equal(await page.locator('#kpiTotal').textContent(),'36');
 assert.equal(await page.locator('#asReasonHeatBody tr').count(),8);
 const checkHeat=async()=>{
  const cells=await page.locator('.as-reason-heat-cell').evaluateAll(nodes=>nodes.map(el=>({bg:getComputedStyle(el).backgroundColor,color:getComputedStyle(el).color})));
  assert(cells.every(c=>{const m=c.bg.match(/\d+/g).map(Number);return m[0]===m[1]&&m[1]===m[2]&&m[0]>=178&&c.color==='rgb(17, 17, 17)';}));
 };
 await checkHeat();await page.locator('#asReasonHeatToggle').click();await checkHeat();
 await page.locator('#asStatsChart .month-button').nth(1).click();assert.match(await page.locator('#comparison-count').textContent(),/^3/);
 await page.locator('#asKpiRow button').nth(2).click();await page.locator('#asSubList').waitFor({state:'visible'});
 assert.equal(await page.locator('#asStatusFilter').inputValue(),'제작 요청');
 await page.setViewportSize({width:844,height:390});
 const ledgerBounds=await page.evaluate(()=>({main:document.querySelector('#dashboard .main').getBoundingClientRect().bottom,scroll:document.querySelector('.as-ledger-scroll').getBoundingClientRect().bottom}));
 assert(ledgerBounds.scroll<=ledgerBounds.main+1,'short screens must keep the ledger and its horizontal scrollbar inside the main panel');
 await page.setViewportSize({width:1440,height:1000});
 await page.locator('#asSubmenu [data-sub=stats]').click();await page.locator('#asStatsContent').waitFor({state:'visible'});
 assert.equal(await page.evaluate(()=>document.getAnimations().filter(a=>a.effect?.target?.closest?.('#asSubStats')&&a.playState==='running').length),0);
 for(const width of [1440,768,390]){
  await page.setViewportSize({width,height:1000});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  if(process.env.THEME_SCREENSHOT_DIR){fs.mkdirSync(process.env.THEME_SCREENSHOT_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.THEME_SCREENSHOT_DIR,`balance-${width}.png`),fullPage:true});}
 }
 const before=fs.readFileSync(path.join(f.dir,'as.json'),'utf8');
 await page.emulateMedia({reducedMotion:'no-preference'});await page.setViewportSize({width:1440,height:1000});
 await page.reload();await page.locator('#asStatsContent').waitFor({state:'visible'});
 await page.waitForFunction(()=>document.getAnimations().some(a=>a.id==='as-overview-enter'));
 await page.waitForFunction(()=>!document.getAnimations().some(a=>a.id==='as-overview-enter'&&a.playState==='running'));
 await page.evaluate(()=>loadAsStatistics());
 assert(!await page.evaluate(()=>document.getAnimations().some(a=>a.id==='as-overview-enter'&&a.playState==='running')));
 assert.equal(fs.readFileSync(path.join(f.dir,'as.json'),'utf8'),before);
 assert.deepEqual(errors,[]);
});
