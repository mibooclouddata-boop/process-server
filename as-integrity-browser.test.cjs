'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright'),{randomUUID}=require('node:crypto');
const {startFixture}=require('./test-support/as-fixture.cjs');

test('browser retries a committed receipt once, preserves stale edits, and records deletion reasons',async t=>{
  const fixture=await startFixture();let browser;
  t.after(async()=>{if(browser)await browser.close();await fixture.close();});
  browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHANNEL?{channel:process.env.PLAYWRIGHT_CHANNEL}:process.platform==='win32'?{channel:'msedge'}:{})});
  const context=await browser.newContext(),page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  const headers=()=>({'X-Requested-With':'process-server','Idempotency-Key':randomUUID()});
  assert.equal((await context.request.post(fixture.url+'/api/login',{headers:headers(),data:{id:'admin',password:'Fixture-passphrase-2026!'}})).status(),200);
  await page.route('**/*',route=>route.request().url().startsWith(fixture.url)?route.continue():route.abort());
  await page.goto(fixture.url+'/dashboard.html');await page.waitForFunction(()=>currentUser?.id==='admin');
  await page.evaluate(()=>openAsModal());
  await page.locator('#asShip').fill('TEST');await page.locator('#asBlock').fill('B01');
  await page.locator('#asReasonSelect').selectOption('기타');await page.locator('#asReason').fill('browser fixture');
  await page.locator('#asFiles').setInputFiles({name:'fixture.txt',mimeType:'text/plain',buffer:Buffer.from('fixture attachment')});
  let dropped=false;const keys=[];
  await page.route('**/api/as',async route=>{
    if(route.request().method()!=='POST')return route.continue();
    keys.push(route.request().headers()['idempotency-key']);
    if(!dropped){dropped=true;const response=await route.fetch();assert.equal(response.status(),200);return route.abort('failed');}
    return route.continue();
  });
  const save=page.locator('#asModal button[onclick="submitAs()"]');
  await save.click();await page.waitForFunction(()=>!asSaving&&document.getElementById('asModalMsg').textContent);
  assert.equal(fixture.read('as.json').list.length,1);
  await save.click();await page.locator('#asModal').waitFor({state:'hidden'});
  assert.equal(keys.length,2);assert.equal(keys[0],keys[1]);
  let stored=fixture.read('as.json');assert.equal(stored.list.length,1);assert.equal(stored.events.length,1);
  assert.equal(fs.readdirSync(path.join(fixture.dir,'uploads')).filter(name=>name!=='existing.txt').length,1);
  await page.locator('#toastContainer').waitFor({state:'hidden'});
  assert.equal((await context.request.post(fixture.url+'/api/users',{headers:headers(),data:{id:'colleague',name:'공동 작업 직원',role:'worker',password:'Fixture-passphrase-2026!'}})).status(),200);
  assert.equal((await context.request.post(fixture.url+'/api/login',{headers:headers(),data:{id:'colleague',password:'Fixture-passphrase-2026!'}})).status(),200);
  await page.reload();await page.waitForFunction(()=>currentUser?.id==='colleague');
  await page.evaluate(async()=>{await loadAsList();await printAsPdf(_asFullList[0]);});
  assert(await page.locator('#asViewerRequestReview').isVisible());
  await page.evaluate(()=>closeFileViewer());
  await page.evaluate(async()=>{await loadAsList();openAsModal(_asFullList[0]);});
  const id=stored.list[0].id;
  assert.equal((await context.request.put(fixture.url+'/api/as/'+id,{headers:headers(),data:{version:0,remark:'another editor'}})).status(),200);
  await page.locator('#asRemark').fill('unsaved draft');await save.click();
  await page.waitForFunction(()=>!asSaving&&document.getElementById('asModalMsg').textContent.includes('다른 사용자'));
  assert.equal(await page.locator('#asRemark').inputValue(),'unsaved draft');assert.equal(fixture.read('as.json').list[0].remark,'another editor');
  await page.evaluate(()=>closeAsModal());
  // Deletion uses a native dialog even when called from another modal.
  await page.evaluate(async()=>{await loadAsList();window.showConfirm=async()=>true;void deleteAs(_asFullList[0].id);});
  await page.locator('dialog[aria-label="접수 삭제 사유"] textarea').fill('browser cleanup');
  await page.locator('dialog[aria-label="접수 삭제 사유"] button[type="submit"]').click();
  await page.waitForFunction(()=>!document.querySelector('dialog[aria-label="접수 삭제 사유"]')&&_asFullList.length===0);
  stored=fixture.read('as.json');assert.equal(stored.events.at(-1).reason,'browser cleanup');assert(stored.list[0].deletedAt);
  assert.equal(stored.list[0].createdById,'admin');assert.equal(stored.events.at(-1).actorId,'colleague');
  assert.equal((await context.request.get(fixture.url+'/uploads/'+stored.list[0].files[0].filename)).status(),404);
  assert.equal((await context.request.post(fixture.url+'/api/as/'+id+'/restore',{headers:headers(),data:{version:stored.list[0].version,changeReason:'browser restore'}})).status(),200);
  assert.equal((await context.request.get(fixture.url+'/uploads/'+stored.list[0].files[0].filename)).status(),200);
  assert.deepEqual(errors,[]);
});
