'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('../node_modules/playwright'),{startFixture}=require('../test-support/as-fixture.cjs');
const launch=()=>chromium.launch({headless:true,...(process.platform==='win32'?{channel:'msedge'}:{})});

test('bundled landing corners are transparent even before startup JavaScript finishes loading',async t=>{
 const browser=await launch();t.after(()=>browser.close());
 const page=await browser.newPage({viewport:{width:1000,height:700}});let release;
 await page.addInitScript(()=>{window.__TAURI_INTERNALS__={invoke:async()=>{}};});
 await page.addInitScript({path:path.join(__dirname,'erp-chrome-spacing.js')});
 await page.route('https://desktop.test/**',async route=>{
  const name=new URL(route.request().url()).pathname.slice(1)||'index.html';
  if(name.startsWith('cover-assets/erp-startup.js'))await new Promise(resolve=>release=resolve);
  const file=path.join(__dirname,'assets',name);
  await route.fulfill({body:fs.readFileSync(file),contentType:name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':'text/html'});
 });
 const navigation=page.goto('https://desktop.test/');
 try{
  await page.locator('h1').waitFor();await page.waitForFunction(()=>getComputedStyle(document.documentElement).clipPath!=='none');
  assert.equal(await page.evaluate(()=>document.readyState),'loading','Hold the real parser before DOMContentLoaded');
  const {PNG}=require(path.join(path.dirname(require.resolve('playwright-core/package.json')),'lib/utilsBundle.js'));
  const png=PNG.sync.read(await page.screenshot({omitBackground:true}));
  for(const [x,y] of [[0,0],[999,0],[0,699],[999,699]])assert.equal(png.data[(y*png.width+x)*4+3],0,'Every native landing corner must be transparent before scripts load');
 }finally{release?.();await navigation;}
 await page.evaluate(()=>renderUpdate({state:'ready'}));
 await page.waitForFunction(()=>!document.getElementById('action').disabled);
 assert.equal(await page.evaluate(()=>getComputedStyle(document.body,'::before').backgroundColor),'rgb(229, 234, 240)','The native bootstrap must preserve the landing background');
 const shots=path.join(__dirname,'../.artifacts/entry-flow');fs.mkdirSync(shots,{recursive:true});
 await page.screenshot({path:path.join(shots,'landing-rounded.png'),omitBackground:true});
 await page.evaluate(()=>document.documentElement.classList.add('process-desktop-maximized'));
 assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).clipPath),'none');
});

test('desktop access shows three dots for at least two seconds and ignores duplicate clicks',async t=>{
 const browser=await launch();t.after(()=>browser.close());const page=await browser.newPage();
 await page.route('https://desktop.test/**',route=>{
  const name=new URL(route.request().url()).pathname.slice(1)||'index.html';
  return route.fulfill({body:fs.readFileSync(path.join(__dirname,'assets',name)),contentType:name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':'text/html'});
 });
 await page.addInitScript(()=>{window.calls=[];window.__TAURI_INTERNALS__={invoke:async(command,args)=>calls.push(args.event)};});
 await page.clock.install({time:new Date(0)});await page.clock.pauseAt(new Date(60000));
 await page.goto('https://desktop.test/');await page.evaluate(()=>renderUpdate({state:'ready'}));await page.clock.runFor(5000);
 await page.locator('#action').click();
 assert.equal(await page.locator('.startup-dots').isVisible(),true);
 assert.equal(await page.locator('.startup-dots i').count(),3);
 assert.equal(await page.locator('#action').getAttribute('aria-busy'),'true');
 assert.equal(await page.locator('#action').evaluate(el=>getComputedStyle(el,'::after').animationName),'none');
 const shots=path.join(__dirname,'../.artifacts/entry-flow');fs.mkdirSync(shots,{recursive:true});
 await page.screenshot({path:path.join(shots,'access-dots.png'),omitBackground:true});
 await page.evaluate(()=>document.getElementById('action').click());
 await page.clock.runFor(1999);assert.equal(await page.evaluate(()=>calls.length),1,'Do not leave the landing before two seconds');
 await page.clock.runFor(3000);assert.equal(await page.evaluate(()=>calls.length),1,'Preserve the existing five-second connection minimum');
 await page.clock.runFor(1);await page.waitForFunction(()=>calls.length===2);
 assert.deepEqual(await page.evaluate(()=>calls),['desktop-update-check','desktop-update-check']);
});

test('browser access keeps the same minimum dots duration for immediate errors and successful connections',async t=>{
 const browser=await launch();t.after(()=>browser.close());const page=await browser.newPage();let fail=true;
 await page.route('https://erp.test/**',route=>{
  const name=new URL(route.request().url()).pathname.slice(1)||'cover.html';
  if(name==='login.html')return route.fulfill({status:route.request().method()==='HEAD'&&fail?503:200,contentType:'text/html',body:'<h1>Login</h1>'});
  return route.fulfill({body:fs.readFileSync(path.join(__dirname,'..',name)),contentType:name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':'text/html'});
 });
 await page.goto('https://erp.test/');await page.clock.install({time:new Date(0)});await page.clock.pauseAt(new Date(60000));
 await page.locator('#action').click();assert(await page.locator('.startup-dots').isVisible());
 await page.clock.runFor(1999);assert(await page.locator('#action').isDisabled());assert.equal(page.url(),'https://erp.test/');
 await page.clock.runFor(3000);assert(await page.locator('#action').isDisabled());
 await page.clock.runFor(1);await page.getByRole('button',{name:'다시 시도'}).waitFor();
 fail=false;await page.locator('#action').click();await page.clock.runFor(1999);assert.equal(page.url(),'https://erp.test/');
 await page.clock.runFor(3001);await page.waitForURL('https://erp.test/login.html');
});

test('login reveals the workspace once without a second page entrance on a later DOM update',async t=>{
 const fixture=await startFixture();let browser;t.after(async()=>{await browser?.close();await fixture.close();});
 browser=await launch();const page=await browser.newPage({viewport:{width:1440,height:900}});
 await page.route('**/*',route=>route.request().url().startsWith(fixture.url)?route.continue():route.abort());
 await page.addInitScript(()=>{window.entries=[];const animate=Element.prototype.animate;Element.prototype.animate=function(...args){const animation=animate.apply(this,args);if(this.matches('#asKpiRow>button,.as-stats-chart-panel'))entries.push(animation);return animation;};});
 await page.goto(fixture.url+'/login.html');await page.locator('#identifier').fill('admin');await page.locator('#password').fill('Fixture-passphrase-2026!');await page.locator('#submitBtn').click();
 await page.waitForURL('**/dashboard.html');
 const app=page.frames().find(frame=>frame.parentFrame()&&frame.url().endsWith('/dashboard.html'));assert(app);
 await app.evaluate(()=>document.getElementById('asStatsContent').append(document.createTextNode('')));
 await app.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 const entries=await app.evaluate(()=>entries.map(a=>({id:a.id,duration:a.effect.getTiming().duration})));
 assert(entries.some(a=>a.id==='as-overview-enter'),'Use the existing entrance during the crossfade');
 assert.equal(entries.filter(a=>a.duration===300).length,0,'The general page observer must not animate the already revealed workspace again');
});
