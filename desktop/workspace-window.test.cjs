const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {chromium}=require('../node_modules/playwright');
test('workspace window mode follows revealed login content once and resets on logout',async()=>{
 const browser=await chromium.launch({headless:true,channel:'msedge'});
 try{
  const page=await browser.newPage();
  await page.addInitScript(()=>{window.workspaceCalls=[];window.__TAURI_INTERNALS__={invoke:async(command,args)=>{if(command==='workspace_window')workspaceCalls.push(args.active);}};});
  await page.addInitScript({path:path.join(__dirname,'erp-chrome-spacing.js')});
  await page.goto('data:text/html,<html><body><main>Login</main></body></html>');
  assert.deepEqual(await page.evaluate(()=>workspaceCalls),[],'Landing and login stay in window mode');
  await page.evaluate(()=>{const frame=document.createElement('iframe');frame.id='loginTransitionFrame';frame.setAttribute('aria-hidden','true');frame.srcdoc='<div id="dashboard" inert><header class="app-topbar">Workspace</header></div>';document.body.append(frame);});
  const frame=page.frameLocator('#loginTransitionFrame');await frame.locator('#dashboard').waitFor();
  await frame.locator('#dashboard').evaluate(el=>el.inert=false);
  assert.deepEqual(await page.evaluate(()=>workspaceCalls),[],'Preparing an invisible iframe must not maximize the login screen');
  await page.locator('#loginTransitionFrame').evaluate(el=>el.setAttribute('aria-hidden','false'));
  await page.waitForFunction(()=>workspaceCalls.length===1);
  assert.deepEqual(await page.evaluate(()=>workspaceCalls),[true]);
  await frame.locator('#dashboard').evaluate(el=>el.append(document.createElement('span')));
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(resolve)));
  assert.deepEqual(await page.evaluate(()=>workspaceCalls),[true],'Later data updates must not override a manually restored window');
  await page.locator('#loginTransitionFrame').evaluate(el=>el.remove());
  await page.waitForFunction(()=>workspaceCalls.length===2);
  assert.deepEqual(await page.evaluate(()=>workspaceCalls),[true,false]);
 }finally{await browser.close();}
});
