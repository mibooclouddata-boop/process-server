'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright'),{startFixture}=require('./test-support/as-fixture.cjs');

test('new user wizard validates steps, retains input, saves once and leaves editing unchanged',async t=>{
 const fixture=await startFixture();let browser;
 t.after(async()=>{await browser?.close();await fixture.close();});
 browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'msedge'}:{})});
 const context=await browser.newContext({viewport:{width:1440,height:900}}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 assert.equal((await context.request.post(fixture.url+'/api/login',{headers:{'X-Requested-With':'process-server'},data:{id:'admin',password:'Fixture-passphrase-2026!'}})).status(),200);
 await page.route('**/*',route=>route.request().url().startsWith(fixture.url)?route.continue():route.abort());
 await page.goto(fixture.url+'/dashboard.html');await page.waitForFunction(()=>currentUser?.id==='admin');
 await page.locator('#tabUsersBtn').click();await page.getByRole('button',{name:'새 사용자 추가',exact:true}).click();
 assert.equal(await page.locator('#userCreateSteps').isVisible(),true);
 assert.equal(await page.locator('#modalUserId').isVisible(),false);
 assert.equal(await page.locator('#modalUserName').isVisible(),true);
 let posts=0;page.on('request',r=>{if(r.method()==='POST'&&r.url()===fixture.url+'/api/users')posts++;});
 const next=page.locator('#userCreateSubmit'),previous=page.locator('#userCreatePrevious');
 await next.click();assert.equal(await page.locator('#modalUserName').getAttribute('aria-invalid'),'true');
 await page.locator('#modalUserName').fill('단계 검증 직원');await page.locator('#modalUserDept').fill('품질관리');await page.locator('#modalUserPos').fill('대리');
 await page.locator('#modalUserName').press('Enter');assert.equal(await page.locator('#modalUserId').isVisible(),true);
 await page.locator('#modalUserId').fill('invalid id');await page.locator('#modalUserPw').fill('short');await next.click();assert.equal(await page.locator('#modalUserId').getAttribute('aria-invalid'),'true');
 await page.locator('#modalUserId').fill('wizard-user');await next.click();assert.equal(await page.locator('#modalUserPw').getAttribute('aria-invalid'),'true');
 await page.locator('#modalUserPw').fill('Fixture-passphrase-2026!');
 await page.getByRole('button',{name:'비밀번호 보기',exact:true}).click();assert.equal(await page.locator('#modalUserPw').getAttribute('type'),'text');
 await page.getByRole('button',{name:'비밀번호 숨기기',exact:true}).click();
 await previous.click();assert.equal(await page.locator('#modalUserName').inputValue(),'단계 검증 직원');await next.click();assert.equal(await page.locator('#modalUserId').inputValue(),'wizard-user');await next.click();
 assert.equal(posts,0);assert.match(await page.locator('#userCreateReview').textContent(),/단계 검증 직원/);
 await page.getByRole('radio',{name:/시스템 관리자/}).check();assert.equal(await page.locator('#modalUserRole').inputValue(),'sysadmin');
 await page.route('**/api/users',route=>route.request().method()==='POST'?route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'검증용 등록 실패'})}):route.continue());
 await next.click();await page.waitForFunction(()=>!userAdmin.busy);assert.match(await page.locator('#modalMsg').textContent(),/검증용 등록 실패/);assert.equal(fixture.read('data.json').users.length,1);
 await previous.click();assert.equal(await page.locator('#modalUserPw').inputValue(),'Fixture-passphrase-2026!');await next.click();assert.equal(await page.getByRole('radio',{name:/시스템 관리자/}).isChecked(),true);
 await page.unroute('**/api/users');let release;const gate=new Promise(resolve=>release=resolve);
 await page.route('**/api/users',async route=>{if(route.request().method()==='POST')await gate;await route.continue();});
 await page.evaluate(()=>{submitModalUser();submitModalUser();});await page.waitForFunction(()=>userAdmin.busy);
 assert.equal(await previous.isDisabled(),true);assert.equal(await next.isDisabled(),true);assert.equal(await page.locator('#modalUserId').isDisabled(),true);
 release();await page.locator('#userModal').waitFor({state:'hidden'});assert.equal(posts,2);
 const added=fixture.read('data.json').users.find(u=>u.id==='wizard-user');assert.equal(added.name,'단계 검증 직원');assert.equal(added.department,'품질관리');assert.equal(added.position,'대리');assert.equal(added.role,'sysadmin');assert(added.passwordHash);assert.equal(added.password,undefined);
 assert.equal(await page.locator('#modalUserPw').inputValue(),'');
 await page.locator('#toastContainer').waitFor({state:'hidden'});await page.getByRole('button',{name:'단계 검증 직원 사용자 관리',exact:true}).click();
 assert.equal(await page.locator('#userCreateSteps').isVisible(),false);assert.equal(await page.locator('#modalUserId').isVisible(),true);assert.equal(await page.locator('#modalUserRole').isVisible(),true);assert.equal(await page.locator('#userCreatePassword').isVisible(),false);
 await page.locator('#modalUserName').fill('수정 검증 직원');await page.locator('#modalUserDept').click();await page.waitForFunction(()=>userAdmin.editing?.name==='수정 검증 직원'&&!userAdmin.saving);
 await page.locator('#userTabAccount').click();assert.equal(await page.locator('#userToggleAccount').isVisible(),true);await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'새 사용자 추가',exact:true}).click();assert.equal(await page.locator('#modalUserName').inputValue(),'');assert.equal(await page.locator('#modalUserRole').inputValue(),'worker');
 await page.locator('#modalUserName').fill('취소할 이름');page.once('dialog',d=>d.dismiss());await page.keyboard.press('Escape');assert.equal(await page.locator('#userModal').isVisible(),true);
 page.once('dialog',d=>d.accept());await page.keyboard.press('Escape');await page.getByRole('button',{name:'새 사용자 추가',exact:true}).click();assert.equal(await page.locator('#modalUserName').inputValue(),'');
 const shotDir=process.env.WIZARD_SCREENSHOTS;if(shotDir)fs.mkdirSync(shotDir,{recursive:true});
 for(const width of [1440,768,390]){
  await page.setViewportSize({width,height:900});
  for(let step=0;step<3;step++){
   if(step===0){await page.locator('#modalUserName').fill('검증 직원');await page.locator('#modalUserDept').fill('품질관리');}
   if(step===1){await page.locator('#modalUserId').fill('layout-user');await page.locator('#modalUserPw').fill('Fixture-passphrase-2026!');}
   const rect=await page.locator('#userModal').boundingBox();assert(rect.x>=0&&rect.x+rect.width<=width+1);assert(rect.y>=0&&rect.y+rect.height<=901);
   if(shotDir)await page.screenshot({path:path.join(shotDir,`wizard-${width}-${step}.png`)});
   if(step<2)await next.click();
  }
  await previous.click();await previous.click();
 }
 assert.deepEqual(errors,[]);
});
