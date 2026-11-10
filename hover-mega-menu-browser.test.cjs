'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {chromium}=require('playwright'),{startFixture}=require('./test-support/as-fixture.cjs');
test('two-column hover menu navigates real pages and supports keyboard, touch and permissions',async t=>{
 const f=await startFixture();let browser;t.after(async()=>{await browser?.close();await f.close();});
 browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'msedge'}:{})});
 const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'}),page=await context.newPage(),errors=[];
 page.setDefaultTimeout(5000);page.on('pageerror',e=>errors.push(e.message));
 await context.request.post(f.url+'/api/login',{headers:{'X-Requested-With':'process-server'},data:{id:'admin',password:'Fixture-passphrase-2026!'}});
 await page.route('**/*',r=>r.request().url().startsWith(f.url)?r.continue():r.abort());
 await page.goto(f.url+'/dashboard.html');await page.locator('#asStatsContent').waitFor({state:'visible'});
 const menu=page.locator('#asOverviewMenu'),stats=page.locator('#tabAsBtn'),list=page.locator('#asSubmenu [data-sub=list]');
 await stats.hover();await menu.waitFor({state:'visible'});
 assert.equal(await menu.locator('.mega-group').count(),2);
 await menu.getByRole('menuitem',{name:'AS 목록',exact:true}).hover();assert(await menu.isVisible());
 await menu.getByRole('menuitem',{name:'AS 목록',exact:true}).click();await page.locator('#asSubList').waitFor({state:'visible'});
 await stats.hover();await menu.getByRole('menuitemradio',{name:'월별 유형 분포',exact:true}).click();await page.locator('.as-reason-heatmap-panel').waitFor({state:'visible'});
 await list.hover();await menu.waitFor({state:'visible'});await menu.getByRole('menuitem',{name:'제작 요청',exact:true}).click();await page.locator('#asSubList').waitFor({state:'visible'});assert.equal(await page.locator('#asStatusFilter').inputValue(),'제작 요청');
 await stats.focus();await page.keyboard.press('ArrowDown');assert(await menu.isVisible());await page.keyboard.press('Escape');assert.equal(await menu.isVisible(),false);assert(await stats.evaluate(e=>e===document.activeElement));
 // A user without account administration or receipt creation must not gain those shortcuts.
 await page.evaluate(()=>{currentUser.role='worker';currentUser.asPermissions=[];document.getElementById('tabUsersBtn').style.display='none';});
 await list.hover();await menu.waitFor({state:'visible'});assert.equal(await menu.getByRole('menuitem',{name:'AS 접수 등록',exact:true}).count(),0);
 await page.mouse.move(1100,700);await menu.waitFor({state:'hidden'});
 await page.setViewportSize({width:390,height:844});await stats.dispatchEvent('pointerdown',{pointerType:'touch'});await stats.click();await menu.waitFor({state:'visible'});
 const bounds=await menu.evaluate(e=>{const r=e.getBoundingClientRect();return {left:r.left,right:r.right,bottom:r.bottom,w:innerWidth,h:innerHeight,top:r.top,style:e.style.cssText,transform:getComputedStyle(e).transform,cssLeft:getComputedStyle(e).left,cssTop:getComputedStyle(e).top,position:getComputedStyle(e).position,margin:getComputedStyle(e).margin,scrollX,scrollY}});assert.ok(bounds.left>=0&&bounds.right<=bounds.w&&bounds.bottom<=bounds.h,JSON.stringify(bounds));
 await menu.getByRole('menuitemradio',{name:'접수 현황',exact:true}).click();await page.locator('#asStatsContent').waitFor({state:'visible'});
 assert.deepEqual(errors,[]);
});
