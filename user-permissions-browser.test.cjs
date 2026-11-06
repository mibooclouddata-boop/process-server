'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {chromium}=require('playwright'),{startFixture}=require('./test-support/as-fixture.cjs');
test('permissions tab grants AS actions, locks sysadmin and preserves failed edits',async t=>{
 const f=await startFixture();let browser;t.after(async()=>{await browser?.close();await f.close();});
 browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'msedge'}:{})});
 const context=await browser.newContext({viewport:{width:1440,height:900}}),page=await context.newPage(),headers={'X-Requested-With':'process-server'};
 await context.request.post(f.url+'/api/login',{headers,data:{id:'admin',password:'Fixture-passphrase-2026!'}});
 await context.request.post(f.url+'/api/users',{headers,data:{id:'operator',name:'권한 테스트',role:'worker',password:'Fixture-passphrase-2026!'}});
 await page.goto(f.url+'/dashboard.html');await page.locator('#tabUsersBtn').click();
 assert.equal(await page.locator('#adminUserRows [data-as-permission]').count(),0);
 const box=key=>page.locator('#userPermissionChoices input[data-as-permission="'+key+'"]');
 await page.getByRole('button',{name:'검증 관리자 사용자 관리',exact:true}).click();await page.locator('#userTabPermissions').click();
 assert.equal(await page.locator('#userPermissionChoices input').count(),4);for(const input of await page.locator('#userPermissionChoices input').all()){assert(await input.isChecked());assert(await input.isDisabled());}
 await page.keyboard.press('Escape');await page.getByRole('button',{name:'권한 테스트 사용자 관리',exact:true}).click();await page.locator('#userTabPermissions').click();
 for(const key of ['create','production','painting','delivery'])assert.equal(await box(key).isChecked(),false);
 await page.evaluate(()=>{
  window.permissionSaveMotion=[];
  const animate=Element.prototype.animate;
  Element.prototype.animate=function(...args){if(this.closest('#tabUsers'))permissionSaveMotion.push(this.tagName);return animate.apply(this,args);};
 });
 await box('production').check();await page.waitForFunction(()=>!userAdmin.busy);assert.deepEqual(f.read('data.json').users.find(u=>u.id==='operator').asPermissions,['production']);
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 assert.deepEqual(await page.evaluate(()=>permissionSaveMotion),[],'granting a permission must not replay roster motion');
 await page.route('**/api/users/operator',r=>r.fulfill({status:503,json:{error:'권한 저장 실패'}}));
 await box('painting').click();await page.waitForFunction(()=>userAdmin.failed&&!userAdmin.busy);assert(await box('painting').isDisabled());assert.match(await page.locator('#modalMsg').textContent(),/권한 저장 실패/);assert.deepEqual(f.read('data.json').users.find(u=>u.id==='operator').asPermissions,['production']);
 await page.unroute('**/api/users/operator');page.once('dialog',d=>d.accept());await page.locator('#userReloadCurrent').click();await page.waitForFunction(()=>!userAdmin.failed&&!userAdmin.busy);await page.locator('#userTabPermissions').click();assert.equal(await box('painting').isChecked(),false);
 await box('production').uncheck();await page.waitForFunction(()=>!userAdmin.busy);assert.deepEqual(f.read('data.json').users.find(u=>u.id==='operator').asPermissions,[]);
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 assert.deepEqual(await page.evaluate(()=>permissionSaveMotion),[],'revoking a permission must not replay roster motion');
 await page.locator('#userTabAccount').focus();await page.keyboard.press('ArrowLeft');assert.equal(await page.locator('#userTabPermissions').getAttribute('aria-selected'),'true');
 await page.setViewportSize({width:390,height:844});assert(await box('delivery').isVisible());assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 if(process.env.USER_UI_SCREENSHOT_DIR){require('node:fs').mkdirSync(process.env.USER_UI_SCREENSHOT_DIR,{recursive:true});await page.screenshot({path:require('node:path').join(process.env.USER_UI_SCREENSHOT_DIR,'permissions-mobile.png')});await page.setViewportSize({width:1440,height:900});await page.screenshot({path:require('node:path').join(process.env.USER_UI_SCREENSHOT_DIR,'permissions-desktop.png')});}
 await page.keyboard.press('Escape');
 const result=await page.evaluate(()=>{
  currentUser={id:'operator',name:'권한 테스트',role:'worker',active:true,asPermissions:['production']};_updateAsSelectedCount();
  const item={id:'fixture',status:'제작 요청',deliveryAgreedDate:'2026-11-05',workflow:{stages:{}}};
  const allowed=asJobCanEdit(item),denied=asJobCanEdit({...item,status:'도장 요청'});openAsWorkflow({...item,status:'도장 요청'});
  return {allowed,denied,createDisabled:document.querySelector('#asSubList .as-tb-btn-new').disabled,form:!!document.getElementById('asJobForm')};
 });assert.deepEqual(result,{allowed:true,denied:false,createDisabled:true,form:false});
});
