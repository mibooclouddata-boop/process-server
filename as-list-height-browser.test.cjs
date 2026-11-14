const {test}=require('node:test'),assert=require('node:assert/strict');
const {chromium}=require('@playwright/test');
const {startFixture}=require('./test-support/as-fixture.cjs');
test('AS list fills desktop height and preserves scrolling in smaller windows',async t=>{
 const f=await startFixture();let browser;
 t.after(async()=>{await browser?.close();await f.close();});
 browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'msedge'}:{})});
 const context=await browser.newContext(),page=await context.newPage();
 await context.request.post(f.url+'/api/login',{headers:{'X-Requested-With':'process-server'},data:{id:'admin',password:'Fixture-passphrase-2026!'}});
 await page.route('**/*',r=>r.request().url().startsWith(f.url)?r.continue():r.abort());
 await page.goto(f.url+'/dashboard.html');await page.locator('#asStatsContent').waitFor({state:'visible'});
 await page.getByRole('button',{name:'AS 관리',exact:true}).click();
 await page.getByRole('menuitem',{name:'AS 목록',exact:true}).click();
 for(const [width,height] of [[1440,1000],[1920,1080],[1024,768],[1440,600],[390,844]]){
  await page.setViewportSize({width,height});
  const layout=await page.evaluate(()=>{
   const card=document.querySelector('#asSubList'),scroll=card.querySelector('.as-ledger-scroll');
   const main=card.closest('.main').getBoundingClientRect(),rect=card.getBoundingClientRect();
   return {bottom:rect.bottom,insets:[rect.top-main.top,main.right-rect.right,main.bottom-rect.bottom,rect.left-main.left],overflow:document.documentElement.scrollWidth>innerWidth,scrollHeight:scroll.clientHeight,scrollStyle:getComputedStyle(scroll).overflowY};
  });
  console.log(width,height,layout);
  assert.equal(layout.overflow,false);assert(layout.scrollHeight>100);assert.equal(layout.scrollStyle,'auto');
  if(width>768&&height>650){const inset=width>=1101&&height>=760?10:28;assert(layout.bottom<=height);assert.deepEqual(layout.insets,Array(4).fill(inset),'workspace card must preserve the responsive spacing on all four sides');}
 }
 await page.setViewportSize({width:1440,height:1000});
 await page.getByRole('button',{name:'AS 관리',exact:true}).click();
 await page.getByRole('menuitemradio',{name:'접수 현황',exact:true}).click();
 assert.equal(await page.locator('body').evaluate(e=>e.classList.contains('as-reception-active')),false);
});
