const {chromium,expect}=require('@playwright/test');
const {test}=require('node:test');
const {startFixture}=require('./test-support/as-fixture.cjs');
test('calendar dismisses on other controls while keeping internal navigation open',async()=>{const f=await startFixture();let b;try{
 b=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'msedge'}:{})});const c=await b.newContext(),p=await c.newPage();
 await c.request.post(f.url+'/api/login',{headers:{'X-Requested-With':'process-server'},data:{id:'admin',password:'Fixture-passphrase-2026!'}});
 await p.route('**/*',r=>r.request().url().startsWith(f.url)?r.continue():r.abort());
 await p.goto(f.url+'/dashboard.html');await p.locator('#asSubmenu [data-sub=list]').click();
 const pop=p.locator('#asCalPop');
 for(const trigger of ['#asDateFromBtn','#asDateToBtn']){
  await p.locator(trigger).click();await expect(pop).toBeVisible();
  await pop.locator('[aria-label="다음 달"]').click();await expect(pop).toBeVisible();
  await p.locator('#asStatusFilterBtn').click();await expect(pop).toBeHidden();
  await expect(p.locator('#asStatusFilterDd')).toHaveClass(/is-open/);
  await p.locator('#asStatusFilterBtn').click();
  await p.locator(trigger).click();await p.locator('#asSubmenu [data-sub=stats]').click();await expect(pop).not.toHaveClass(/is-open/);
  await p.locator('#asSubmenu [data-sub=list]').click();
 }
}finally{await b?.close();await f.close();}});
