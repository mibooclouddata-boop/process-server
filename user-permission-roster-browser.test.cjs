'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {chromium}=require('playwright'),{startFixture}=require('./test-support/as-fixture.cjs');
test('permission roster reflects effective AS permissions without selection actions',async t=>{
 const f=await startFixture();let browser;t.after(async()=>{await browser?.close();await f.close();});
 browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'msedge'}:{})});
 const context=await browser.newContext({viewport:{width:1440,height:900}}),page=await context.newPage(),headers={'X-Requested-With':'process-server'},errors=[];page.on('pageerror',e=>errors.push(e.message));
 assert.equal((await context.request.post(f.url+'/api/login',{headers,data:{id:'admin',password:'Fixture-passphrase-2026!'}})).status(),200);
 for(const [id,active]of [['operator',true],['inactive',false]])assert.equal((await context.request.post(f.url+'/api/users',{headers,data:{id,name:id,role:'worker',active,password:'Fixture-passphrase-2026!',asPermissions:['production']}})).status(),200);
 await page.goto(f.url+'/dashboard.html');await page.locator('#tabUsersBtn').click();await page.waitForFunction(()=>document.querySelectorAll('#adminUserRows tr').length===3);
 const row=id=>page.locator('#adminUserRows tr').filter({has:page.getByRole('button',{name:id+' 사용자 관리',exact:true})});
 const operator=row('operator'),inactive=row('inactive');
 assert.equal(await operator.locator('td').count(),10);
 assert.deepEqual(await page.locator('.user-column-header th').allTextContents(),['이름','아이디','부서','직급','AS 접수','제작 완료','도장 완료','납품 완료','역할','계정 상태']);
 assert.equal(await operator.locator('.user-status').textContent(),'사용 가능');
 assert.equal(await inactive.locator('.user-status').textContent(),'사용 중지');
 assert.equal(await operator.locator('.user-status svg').getAttribute('aria-hidden'),'true');
 const typography=await operator.locator('td').first().evaluate(el=>({color:getComputedStyle(el).color,size:getComputedStyle(el).fontSize,weight:getComputedStyle(el).fontWeight}));
 assert.deepEqual(typography,{color:'rgb(0, 0, 0)',size:'14px',weight:'400'});
 assert.equal(await operator.getByRole('img',{name:'제작 완료 허용',exact:true}).count(),1);
 assert.equal(await operator.getByRole('img',{name:/제한$/}).count(),3);
 assert.equal(await inactive.getByRole('img',{name:/허용$/}).count(),0);
 for(const [allowed,label] of [[true,'제작 완료 허용'],[false,'AS 접수 제한']]){
  const badge=operator.getByRole('img',{name:label,exact:true});
  assert.equal(await badge.textContent(),'');
  assert.equal(await badge.getAttribute('title'),label);
  const shape=await badge.evaluate(el=>{const s=getComputedStyle(el,'::before');return {width:s.width,radius:s.borderRadius,fill:s.backgroundColor};});
  assert.equal(shape.width,'14px');assert.equal(shape.radius,'50%');
  assert.equal(shape.fill,allowed?'rgb(0, 98, 207)':'rgba(0, 0, 0, 0)');
 }
 const admin=page.locator('#adminUserRows tr').filter({has:page.locator('td:nth-child(2)',{hasText:/^admin$/})});assert.equal(await admin.getByRole('img',{name:/허용$/}).count(),4);
 assert.equal(await page.locator('#userSelectPage,#adminUserRows input[type=checkbox],.user-group-header').count(),0);
 await page.locator('#userSearch').fill('not-a-user');assert.equal(await page.locator('#adminUserRows td').getAttribute('colspan'),'10');await page.locator('#userReset').click();
 await page.setViewportSize({width:390,height:844});
 const scroll=page.locator('#tabUsers .table-wrap');assert(await scroll.evaluate(el=>el.scrollWidth>el.clientWidth));assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 assert(await page.getByRole('columnheader',{name:'납품 완료',exact:true}).isVisible());
 assert.deepEqual(errors,[]);
});
