'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {chromium}=require('playwright'),{startFixture}=require('./test-support/as-fixture.cjs');
test('user filters animate, retain filtering and support keyboard, reset and mobile',async t=>{
 const f=await startFixture();let browser;t.after(async()=>{await browser?.close();await f.close();});
 browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'msedge'}:{})});
 const context=await browser.newContext({viewport:{width:1440,height:900}}),page=await context.newPage();
 await context.request.post(f.url+'/api/login',{headers:{'X-Requested-With':'process-server'},data:{id:'admin',password:'Fixture-passphrase-2026!'}});
 await page.route('**/api/users',r=>r.fulfill({json:{users:[{id:'admin',name:'관리자',role:'sysadmin',department:'관리',active:true},{id:'worker',name:'작업자',role:'worker',department:'<img src=x onerror=alert(1)>',active:true}]}}));
 await page.addInitScript(()=>{const animate=Element.prototype.animate;Element.prototype.animate=function(frames,options){this.dataset.animationDuration=String(options.duration);return animate.call(this,frames,options);};});page.setDefaultTimeout(5000);await page.goto(f.url+'/dashboard.html');await page.locator('#tabUsersBtn').click();
 const role=page.locator('#userRoleFilterButton'),panel=page.locator('#userRoleFilterPanel');
 await role.waitFor({timeout:3000});await role.click();assert.equal(await role.getAttribute('aria-expanded'),'true');
 assert.equal(await panel.getAttribute('data-animation-duration'),'150');
 await panel.getByRole('option',{name:'작업자',exact:true}).click();assert.equal(await page.locator('#userRoleFilter').inputValue(),'worker');assert.equal(await page.locator('#adminUserRows tr').count(),1);assert.match(await role.textContent(),/작업자/);
 await page.locator('#userReset').click();assert.match(await role.textContent(),/전체 역할/);assert.equal(await page.locator('#adminUserRows tr').count(),2);
 await role.focus();await page.keyboard.press('ArrowDown');await page.keyboard.press('End');await page.keyboard.press('Enter');assert.equal(await page.locator('#userRoleFilter').inputValue(),'worker');
 await page.locator('#userReset').click();assert.match(await role.textContent(),/전체 역할/);
 for(const id of ['userDepartmentFilter','userRoleFilter','userStatusFilter']){
  const trigger=page.locator('#'+id+'Button');await trigger.click();await page.keyboard.press('Escape');assert.equal(await trigger.getAttribute('aria-expanded'),'false');
  await trigger.click();await page.locator('#userSearch').click();assert.equal(await trigger.getAttribute('aria-expanded'),'false');
 }
 await page.locator('#userDepartmentFilterButton').click();assert.equal(await page.locator('#userDepartmentFilterPanel img').count(),0);await page.locator('#userDepartmentFilterPanel').getByRole('option',{name:'<img src=x onerror=alert(1)>',exact:true}).click();assert.equal(await page.locator('#adminUserRows tr').count(),1);await page.locator('#userReset').click();
 await role.click();if(process.env.USER_UI_SCREENSHOT_DIR){require('node:fs').mkdirSync(process.env.USER_UI_SCREENSHOT_DIR,{recursive:true});await panel.evaluate(async e=>Promise.all(e.getAnimations().map(a=>a.finished)));await page.screenshot({path:require('node:path').join(process.env.USER_UI_SCREENSHOT_DIR,'user-filters-desktop.png')});}await page.keyboard.press('Escape');await page.emulateMedia({reducedMotion:'reduce'});await role.click();assert.equal(await panel.evaluate(e=>e.getAnimations().length),0);await page.keyboard.press('Escape');
 for(const width of [390,320]){await page.setViewportSize({width,height:844});for(const id of ['userDepartmentFilter','userRoleFilter','userStatusFilter']){await page.locator('#'+id+'Button').click();const r=await page.locator('#'+id+'Panel').boundingBox();assert(r.x>=0&&r.x+r.width<=width);if(id==='userRoleFilter'&&process.env.USER_UI_SCREENSHOT_DIR)await page.screenshot({path:require('node:path').join(process.env.USER_UI_SCREENSHOT_DIR,'user-filters-'+width+'.png')});await page.keyboard.press('Escape');}assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
});
