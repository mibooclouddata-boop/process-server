'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright'),{startFixture}=require('./test-support/as-fixture.cjs');
test('user pagination shows 50 people, numbered navigation, and resets after filtering',async t=>{
 const f=await startFixture();let browser;t.after(async()=>{await browser?.close();await f.close();});
 const data=f.read('data.json'),admin=data.users[0];
 data.users=[admin,...Array.from({length:599},(_,i)=>({...admin,id:'demo'+String(i+1).padStart(3,'0'),name:'가상 사용자 '+String(i+1).padStart(3,'0'),role:'worker'}))];
 fs.writeFileSync(path.join(f.dir,'data.json'),JSON.stringify(data));
 browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHANNEL?{channel:process.env.PLAYWRIGHT_CHANNEL}:process.platform==='win32'?{channel:'msedge'}:{})});
 const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'}),page=await context.newPage();
 await context.request.post(f.url+'/api/login',{headers:{'X-Requested-With':'process-server'},data:{id:'admin',password:'Fixture-passphrase-2026!'}});
 await page.route('**/*',r=>r.request().url().startsWith(f.url)?r.continue():r.abort());
 await page.goto(f.url+'/dashboard.html');await page.locator('#tabUsersBtn').click();await page.locator('#userPage').waitFor();
 await page.waitForFunction(()=>document.querySelectorAll('#adminUserRows tr').length===50);
 const numbers=page.locator('#userPageNumbers');
 assert.equal(await numbers.locator('button').count(),6);
 assert.equal(await page.locator('#userPage').textContent(),'전체 600명');
 assert.equal(await page.locator('.user-page-size').count(),0);
 const navRect=await page.locator('.user-page-navigation').boundingBox(),pagerRect=await page.locator('.user-pager').boundingBox();
 assert(Math.abs(navRect.x+navRect.width-pagerRect.x-pagerRect.width)<2);
 const asButton=page.locator('#asPageBtns .as-page-btn');
 await page.evaluate(()=>{const button=document.createElement('button');button.className='as-page-btn';document.getElementById('asPageBtns').append(button);});
 const dimensions=el=>{const s=getComputedStyle(el);return [s.width,s.height,s.fontSize,s.borderRadius,s.fontWeight];};
 assert.deepEqual(await numbers.locator('button:not([aria-current])').first().evaluate(dimensions),await asButton.first().evaluate(dimensions));
 const firstIds=await page.locator('#adminUserRows tr td:nth-child(2)').allTextContents();
 await numbers.getByRole('button',{name:'12페이지',exact:true}).click();
 assert.equal(await numbers.locator('[aria-current=page]').textContent(),'12');
 assert.equal(await page.locator('#userPage').textContent(),'전체 600명');
 assert.equal(await page.locator('#adminUserRows tr').count(),50);
 assert(await page.locator('#userNext').isDisabled());
 assert(!(await page.locator('#adminUserRows tr td:nth-child(2)').allTextContents()).some(id=>firstIds.includes(id)));
 assert.equal(await page.evaluate(()=>document.activeElement.getAttribute('aria-current')),'page');
 await page.locator('#userSearch').fill('demo199');assert.equal(await page.locator('#adminUserRows tr').count(),1);
 assert.equal(await numbers.locator('[aria-current=page]').textContent(),'1');assert(await page.locator('#userPrevious').isDisabled());
 await page.locator('#userSearch').fill('no-matching-user');assert.match(await page.locator('#userPage').textContent(),/0명/);
 assert(await page.locator('#userNext').isDisabled());
 await page.locator('#userReset').click();
 for(const width of [768,390,320]){
  await page.setViewportSize({width,height:844});
  const pager=await page.locator('.user-pager').boundingBox();assert(pager.x>=0&&pager.x+pager.width<=width+1);
  for(const button of await page.locator('.user-pager button').all()){const rect=await button.boundingBox();assert.equal(rect.width,36);assert.equal(rect.height,36);}
 }
 const touch=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,storageState:await context.storageState()});
 const touchPage=await touch.newPage();await touchPage.route('**/*',r=>r.request().url().startsWith(f.url)?r.continue():r.abort());
 await touchPage.goto(f.url+'/dashboard.html');await touchPage.locator('#tabUsersBtn').click();await touchPage.locator('#userPageNumbers button').first().waitFor();
 const touchSize=await touchPage.locator('#userPageNumbers button').first().boundingBox();assert.equal(touchSize.width,44);assert.equal(touchSize.height,44);await touch.close();
 await page.evaluate(()=>{const seed=userAdmin.users[0];userAdmin.users=Array.from({length:800},(_,i)=>({...seed,id:'large'+i,name:'사용자 '+i}));renderAdminUsers();});
 assert(await numbers.locator('.user-page-gap').count()>0);assert(await numbers.locator('button').count()<=7);
});
