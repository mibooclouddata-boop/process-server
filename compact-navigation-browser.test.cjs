'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {chromium,expect}=require('@playwright/test'),{startFixture}=require('./test-support/as-fixture.cjs');
test('compact navigation keeps destinations accessible across collapse, keyboard and mobile layouts',async t=>{
 const f=await startFixture();let browser;t.after(async()=>{await browser?.close();await f.close();});
 browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'msedge'}:{})});
 const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'}),page=await context.newPage(),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await context.request.post(f.url+'/api/login',{headers:{'X-Requested-With':'process-server'},data:{id:'admin',password:'Fixture-passphrase-2026!'}});
 await page.route('**/*',route=>route.request().url().startsWith(f.url)?route.continue():route.abort());
 await page.goto(f.url+'/dashboard.html');await page.locator('#asStatsContent').waitFor({state:'visible'});
 const nav=page.locator('#appNavigation'),toggle=page.locator('#appRailToggle'),product=nav.locator('[data-sub=product]');
 assert.equal((await nav.boundingBox()).width,72);
 await expect(page.getByRole('button',{name:'AS 접수 현황',exact:true})).toHaveAttribute('aria-current','page');
 await page.evaluate(()=>window.scrollTo(0,500));
 assert(await toggle.evaluate(el=>{const r=el.getBoundingClientRect();return el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));}),'scrolling must not hide the rail toggle beneath the sticky header');
 await toggle.click();await expect(toggle).toHaveAttribute('aria-expanded','true');await toggle.click();await page.evaluate(()=>window.scrollTo(0,0));
 await product.hover();const tip=await product.locator('.rail-tip').boundingBox();await page.mouse.move(tip.x+tip.width/2,tip.y+tip.height/2);await expect(product.locator('.rail-tip')).toBeVisible();
 await page.keyboard.press('Escape');await expect(product.locator('.rail-tip')).toBeHidden();
 await product.focus();await expect(product.locator('.rail-tip')).toBeVisible();await page.keyboard.press('Escape');await expect(product.locator('.rail-tip')).toBeHidden();
 await toggle.click();await expect(toggle).toHaveAttribute('aria-expanded','true');assert.equal((await nav.boundingBox()).width,196);
 await product.click();await page.locator('#asSubProduct').waitFor({state:'visible'});await expect(product).toHaveAttribute('aria-current','page');
 await expect(nav.locator('#tabAsBtn')).toHaveCSS('background-color','rgba(0, 0, 0, 0)');
 await expect(product).toHaveCSS('background-color','rgb(223, 228, 233)');
 await page.keyboard.press('Escape');await expect(toggle).toBeFocused();await expect(toggle).toHaveAttribute('aria-expanded','false');
 await nav.locator('#tabAsBtn').click();await page.locator('#asStatsContent').waitFor({state:'visible'});
 await nav.locator('[data-sub=list]').click();await page.locator('#asSubList').waitFor({state:'visible'});await expect(nav).toBeHidden();
 await page.locator('#asLedgerBack').click();await expect(nav.locator('#tabAsBtn')).toBeFocused();
 await nav.locator('#tabUsersBtn').click();await page.locator('#adminUserRows tr').first().waitFor();await expect(nav.locator('#tabUsersBtn')).toHaveAttribute('aria-current','page');
 await toggle.click();
 for(const width of [768,390,320]){
  await page.setViewportSize({width,height:844});await page.locator('#appMenuToggle').click();await expect(nav).toBeVisible();await expect(toggle).toBeHidden();
  await expect(nav.locator('#tabAsBtn .rail-full')).toBeVisible();assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await nav.locator('#tabAsBtn').click();await expect(nav).toBeHidden();await expect(page.locator('#appMenuToggle')).toBeFocused();
 }
 await page.setViewportSize({width:1440,height:1000});await expect(nav).toBeVisible();await toggle.click();assert.equal((await nav.boundingBox()).width,72);
 await page.setViewportSize({width:1440,height:300});await nav.locator('#tabUsersBtn').click();await expect(page.locator('#tabUsers')).toBeVisible();
 assert.equal(await page.locator('#menuPreviewTools').count(),0);assert.deepEqual(errors,[]);
});
