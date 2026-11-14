const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require('../node_modules/playwright');
test('required update has no bypass, renders notes safely, reports progress and retries',async()=>{
 const browser=await chromium.launch({headless:true,channel:'msedge'});
 try {
  const page=await browser.newPage();
  await page.route('https://desktop.test/**',route=>{const name=new URL(route.request().url()).pathname.slice(1)||'index.html';const file=path.join(__dirname,'assets',name);return route.fulfill({body:fs.readFileSync(file),contentType:name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':'text/html'});});
  await page.addInitScript(()=>{window.calls=[];window.__TAURI_INTERNALS__={invoke:async(c,a)=>calls.push(a.event)};});
  await page.goto('https://desktop.test/');
  assert.deepEqual(await page.evaluate(()=>calls),['desktop-update-check']);
  await page.evaluate(()=>window.renderUpdate({state:'available',version:'0.2.1',current:'0.2.0',notes:'<img src=x onerror=alert(1)>\n배율 개선'}));
  assert.equal(await page.getByRole('button',{name:'나중에'}).count(),0);
  assert.equal(await page.locator('#notes img').count(),0);
  await page.getByRole('button',{name:'업데이트 시작'}).click();
  assert.equal(await page.evaluate(()=>calls.at(-1)),'desktop-update-install');
  assert.equal(await page.locator('#action').isDisabled(),true);
  await page.evaluate(()=>window.renderUpdate({state:'downloading',downloaded:50,total:100}));
  assert.equal(await page.locator('progress').getAttribute('value'),'50');
  await page.evaluate(()=>window.renderUpdate({state:'error',message:'다운로드에 실패했습니다.'}));
  await page.getByRole('button',{name:'다시 시도'}).click();
  assert.equal(await page.evaluate(()=>calls.at(-1)),'desktop-update-check');
 }finally{await browser.close();}
});
