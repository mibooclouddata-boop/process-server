'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {chromium,expect}=require('@playwright/test'),{startFixture}=require('./test-support/as-fixture.cjs');
test('horizontal navigation keeps destinations accessible across keyboard and mobile layouts',async t=>{
 const f=await startFixture();let browser;t.after(async()=>{await browser?.close();await f.close();});
 browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'msedge'}:{})});
 const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'}),page=await context.newPage(),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await context.request.post(f.url+'/api/login',{headers:{'X-Requested-With':'process-server'},data:{id:'admin',password:'Fixture-passphrase-2026!'}});
 await page.route('**/*',route=>route.request().url().startsWith(f.url)?route.continue():route.abort());
 await page.goto(f.url+'/dashboard.html');await page.locator('#asStatsContent').waitFor({state:'visible'});
 await expect(page.locator('#appNavigation #asSubmenu [data-sub=stats]')).toHaveCSS('opacity','1');assert.equal(await page.locator('.main #asSubmenu').count(),0);
 await expect(page.locator('#asSubmenu [data-sub=list]')).toBeHidden();
 const nav=page.locator('#appNavigation'),toggle=page.locator('#appRailToggle'),product=nav.locator('[data-sub=product]');
 const showOverview=async()=>{await nav.locator('#tabAsBtn').click();if(await page.locator('#asOverviewMenu').isVisible())await page.getByRole('menuitemradio',{name:'접수 현황',exact:true}).click();};
 await expect(toggle).toBeHidden();await expect(page.locator('#appMenuToggle')).toBeHidden();
 assert.equal(await nav.evaluate(el=>el.parentElement.classList.contains('app-topbar')),true);
 await expect(nav.locator('.tabs')).toHaveCSS('border-top-width','1px');
 await expect(nav.locator('.tabs')).toHaveCSS('border-top-style','solid');
 await expect(page.locator('#tabAsBtn')).toHaveAttribute('aria-current','page');
 await nav.locator('#tabprocessBtn').hover();await page.getByRole('menuitem',{name:'제품 목록',exact:true}).click();await page.locator('#asSubProduct').waitFor({state:'visible'});await expect(nav.locator('#tabprocessBtn')).toHaveAttribute('aria-current','page');await expect(product).toBeHidden();
 await showOverview();await page.locator('#asStatsContent').waitFor({state:'visible'});
 await page.locator('#tabAsBtn').focus();await page.keyboard.press('ArrowRight');
 await expect(page.locator('#tabprocessBtn')).toHaveAttribute('aria-current','page');
 await page.locator('#featureDevelopment button').click();
 await page.locator('#tabAsBtn').click();await page.getByRole('menuitem',{name:'AS 목록',exact:true}).click();
 await expect(page.locator('#tabAsBtn')).toHaveAttribute('aria-current','page');
 await page.locator('#asSubList').waitFor({state:'visible'});await expect(nav).toBeVisible();
 await page.waitForFunction(()=>document.getElementById('asTableBody').rows.length===20);
 assert.equal(await page.locator('#asLedgerBack').count(),0);
 await expect(page.locator('#asSubList')).toHaveCSS('background-color','rgb(255, 255, 255)');
 await expect(page.locator('#asSubList .as-column-header th').first()).toHaveCSS('color','rgb(17, 17, 17)');
 for(const count of [1,3,20]){
  const result=await page.evaluate(count=>{const table=document.querySelector('#asSubList .as-erp-table'),body=table.tBodies[0];body.replaceChildren();for(let i=0;i<count;i++){const row=body.insertRow();row.dataset.id='fixture-'+i;for(let j=0;j<17;j++)row.insertCell();}asLedgerFillRows(table,table.parentElement,48,17);asLedgerFillRows(table,table.parentElement,48,17);return {total:body.rows.length,blank:body.querySelectorAll('.as-ledger-filler').length};},count);
  assert.deepEqual(result,{total:20,blank:20-count});
 }
 await page.evaluate(()=>_renderAsPage());
 await showOverview();await expect(page.locator('#asSubmenu [data-sub=stats]')).toBeFocused();
 for(const id of ['process','dispatch']){await page.locator('#tab'+id+'Btn').click();await expect(page.locator('#tab'+id)).toBeVisible();await expect(page.locator('#asSubmenu [data-sub=list]')).toBeHidden();await page.locator('#featureDevelopment button').click();}
 await showOverview();await expect(page.locator('#asSubmenu [data-sub=list]')).toBeHidden();
 await nav.locator('#tabUsersBtn').click();await page.locator('#adminUserRows tr').first().waitFor();await expect(nav.locator('#tabUsersBtn')).toHaveAttribute('aria-current','page');
 for(const width of [768,390,320]){
  await page.setViewportSize({width,height:844});await expect(nav).toBeVisible();await expect(toggle).toBeHidden();
  await expect(page.locator('#appMenuToggle')).toBeHidden();
  await expect(nav.locator('#tabAsBtn .rail-full')).toBeVisible();assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await showOverview();await expect(nav).toBeVisible();
  await nav.locator('#tabAsBtn').focus();await page.keyboard.press('ArrowLeft');
  await expect(nav.locator('#tabUsersBtn')).toHaveAttribute('aria-current','page');
  await page.keyboard.press('ArrowRight');await page.getByRole('menuitemradio',{name:'접수 현황',exact:true}).click();await expect(nav.locator('#tabAsBtn')).toHaveAttribute('aria-current','page');
  await expect(page.locator('.top-nav-selection')).toBeHidden();
 }
 await page.setViewportSize({width:1440,height:300});await nav.locator('#tabUsersBtn').click();await expect(page.locator('#tabUsers')).toBeVisible();
 assert.equal(await page.locator('#menuPreviewTools').count(),0);assert.deepEqual(errors,[]);
});
