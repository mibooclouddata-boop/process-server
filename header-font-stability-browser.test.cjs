'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {chromium}=require('playwright'),{startFixture}=require('./test-support/as-fixture.cjs');

for(const width of [1440,900,375])test(`header text stays stable after a cold refresh at ${width}px`,async t=>{
 const f=await startFixture();let browser,release;
 const fontsBlocked=new Promise(resolve=>{release=resolve;});
 t.after(async()=>{release();if(browser)await browser.close();await f.close();});
 browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'msedge'}:{})});
 const context=await browser.newContext({viewport:{width,height:900}}),page=await context.newPage();
 await context.request.post(f.url+'/api/login',{headers:{'X-Requested-With':'process-server'},data:{id:'admin',password:'Fixture-passphrase-2026!'}});
 await page.route('**/*.otf',async route=>{await fontsBlocked;await route.continue();});
 await page.route('https://**',route=>route.abort());
 const measure=()=>page.locator('#appNavigation .rail-full:visible').evaluateAll(labels=>labels.map(label=>{
  const range=document.createRange();range.selectNodeContents(label);const box=range.getBoundingClientRect();
  return {text:label.textContent,x:box.x,y:box.y,width:box.width,height:box.height};
 }));
 // Commit starts a cold navigation without waiting for the blocked font responses.
 await page.goto(f.url+'/dashboard.html',{waitUntil:'commit'});
 await page.waitForFunction(()=>document.querySelector('#appNavigation')?.parentElement?.classList.contains('app-topbar')&&document.querySelector('#tabUsersBtn')?.style.display!=='none');
 await page.waitForTimeout(400);
 const before=await measure();assert(before.length>=5);
 const responses=Promise.all(['bold','regular'].map(name=>page.waitForResponse(response=>response.url()===f.url+`/cover-assets/${name}.otf`)));
 release();
 for(const response of await responses){assert.equal(response.ok(),true);assert.equal(await response.finished(),null);}
 await page.evaluate(()=>document.fonts.ready);
 await page.waitForTimeout(200);
 const after=await measure();
 assert.deepEqual(after,before,'late webfont loading must not change header text geometry');
 await page.reload();
 assert.equal(await page.locator('#appNavigation').isVisible(),true,'navigation remains available on reload');
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
});
