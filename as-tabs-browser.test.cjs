const {test}=require('node:test'),assert=require('node:assert/strict');
const {chromium}=require('playwright'),{startFixture}=require('./test-support/as-fixture.cjs');
test('AS frost index tabs preserve keyboard navigation and stable centered labels',async t=>{
 const f=await startFixture();let b;t.after(async()=>{await b?.close();await f.close()});
 b=await chromium.launch({headless:true,channel:'msedge'});
 const c=await b.newContext(),p=await c.newPage();
 await c.request.post(f.url+'/api/login',{headers:{'X-Requested-With':'process-server'},data:{id:'admin',password:'Fixture-passphrase-2026!'}});
 await p.route('**/*',r=>r.request().url().startsWith(f.url)?r.continue():r.abort());
 await p.goto(f.url+'/dashboard.html');await p.locator('#asStatsContent').waitFor();
 const nav=p.locator('.app-as-tabs'),buttons=nav.locator('button');
 assert.equal(await nav.locator('.as-tabs-indicator').count(),0);
 assert.equal(await buttons.first().evaluate(e=>getComputedStyle(e).transitionDuration),'0s');
 assert.deepEqual(await buttons.first().evaluate(e=>{const s=getComputedStyle(e);return [s.borderTopLeftRadius,s.borderBottomLeftRadius,s.backdropFilter]}),['10px','0px','blur(14px)']);
 assert.equal(await nav.evaluate(e=>getComputedStyle(e).borderBottomWidth),'0px');
 for(const width of [1440,390]){
  await p.setViewportSize({width,height:1000});
  const before=await buttons.evaluateAll(bs=>bs.map(b=>({x:b.getBoundingClientRect().x,width:b.getBoundingClientRect().width})));
  assert.deepEqual(await buttons.evaluateAll(bs=>bs.map(b=>getComputedStyle(b).fontWeight)),['700','700']);
  await buttons.first().focus();await p.keyboard.press('ArrowRight');await p.locator('#asSubList').waitFor();
  assert.equal(await buttons.nth(1).getAttribute('aria-current'),'page');
  assert.equal(await buttons.nth(1).evaluate(e=>getComputedStyle(e,'::after').content),'none');
  assert.equal(await buttons.first().evaluate(e=>getComputedStyle(e,'::after').content),'none');
  assert(await nav.evaluate(e=>e.getBoundingClientRect().right<=innerWidth),'tabs fit viewport');
  assert.deepEqual(await buttons.evaluateAll(bs=>bs.map(b=>getComputedStyle(b).fontWeight)),['700','700']);
  const after=await buttons.evaluateAll(bs=>bs.map(b=>({x:b.getBoundingClientRect().x,width:b.getBoundingClientRect().width})));
  assert.deepEqual(after,before,'selection must not move the tab hit areas');
  const offsets=await buttons.evaluateAll(bs=>bs.map(b=>{const r=document.createRange();r.selectNodeContents(b);const text=r.getBoundingClientRect(),box=b.getBoundingClientRect();return Math.abs(text.x+text.width/2-box.x-box.width/2)}));
  assert(offsets.every(x=>x<1),'labels stay centered');
  await p.keyboard.press('Home');await p.locator('#asStatsContent').waitFor();
 }
 await p.emulateMedia({reducedMotion:'reduce'});
 assert.equal(await buttons.first().evaluate(e=>getComputedStyle(e).transitionDuration),'0s');
});
