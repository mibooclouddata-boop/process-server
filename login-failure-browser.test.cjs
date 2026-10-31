'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {chromium}=require('playwright'),{startFixture}=require('./test-support/as-fixture.cjs');
test('incorrect credentials highlight and shake the fields without visible copy or layout shift',async t=>{
  const fixture=await startFixture();let browser;
  t.after(async()=>{await browser?.close();await fixture.close();});
  browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'msedge'}:{})});
  const page=await browser.newPage();
  for(const width of [1440,390]){
    await page.setViewportSize({width,height:900});await page.goto(fixture.url+'/login.html');
    await page.locator('#identifier').fill('admin');await page.locator('#password').fill('Wrong-passphrase!');
    await page.evaluate(()=>Promise.all(document.getAnimations().map(a=>a.finished.catch(()=>{}))));
    const before=await page.locator('#loginForm').boundingBox();
    await page.locator('#submitBtn').click();await page.locator('.input-stack.is-error').waitFor();
    assert.equal(await page.locator('.input-stack').evaluate(el=>getComputedStyle(el).animationName),'shake');
    await page.evaluate(()=>Promise.all(document.getAnimations().map(a=>a.finished.catch(()=>{}))));
    const after=await page.locator('#loginForm').boundingBox();assert.deepEqual(after,before);
    assert.equal(await page.locator('#password').inputValue(),'Wrong-passphrase!');
    assert.equal(await page.locator('#password').evaluate(el=>el===document.activeElement&&el.selectionEnd===el.value.length),true);
    assert.equal(await page.locator('#identifier').getAttribute('aria-invalid'),'true');
    assert.equal(await page.locator('#password').getAttribute('aria-invalid'),'true');
    assert.equal(await page.locator('#password').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(255, 244, 245)');
    assert.equal(await page.locator('#loginMessage').textContent(),'로그인에 실패했습니다.');
    assert.equal(await page.locator('#loginMessage').evaluate(el=>getComputedStyle(el).clipPath),'inset(50%)');
    assert.equal(await page.getByText('아이디와 비밀번호를 확인해 주세요.',{exact:true}).count(),0);
    if(process.env.LOGIN_FAILURE_SCREENSHOTS)await page.screenshot({path:process.env.LOGIN_FAILURE_SCREENSHOTS+'/'+width+'.png',fullPage:true});
    await page.locator('#password').fill('Still-wrong!');assert.equal(await page.locator('.input-stack.is-error').count(),0);
    assert.equal(await page.locator('#identifier').getAttribute('aria-invalid'),'false');
    await page.emulateMedia({reducedMotion:'reduce'});await page.locator('#submitBtn').click();await page.locator('.input-stack.is-error').waitFor();
    assert.equal(await page.locator('.input-stack').evaluate(el=>getComputedStyle(el).animationName),'none');
    await page.emulateMedia({reducedMotion:'no-preference'});
  }
  for(const [status,expected] of [[429,'로그인 시도가 많습니다.'],[503,'서버 오류가 발생했습니다.']]){
    await page.route('**/api/login',route=>route.fulfill({status,contentType:'application/json',body:'{}'}));
    await page.locator('#submitBtn').click();await page.waitForFunction(text=>document.getElementById('loginMessage').textContent.startsWith(text),expected);
    assert.equal(await page.locator('#loginMessage').evaluate(el=>getComputedStyle(el).clipPath),'none');
    assert.equal(await page.locator('.input-stack.is-error').count(),0);
    await page.unroute('**/api/login');
  }
});
