const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require('../node_modules/playwright');
test('required update separates connection waves from install dots and resumes after restart',async()=>{
 const browser=await chromium.launch({headless:true,channel:'msedge'});
 try {
  const page=await browser.newPage();
  await page.clock.install({time:new Date('2026-01-01T00:00:00Z')});await page.clock.pauseAt(new Date('2026-01-01T00:00:01Z'));
  await page.route('https://desktop.test/**',route=>{const name=new URL(route.request().url()).pathname.slice(1)||'index.html';const file=path.join(__dirname,'assets',name);return route.fulfill({body:fs.readFileSync(file),contentType:name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':'text/html'});});
  await page.addInitScript(()=>{window.calls=[];window.__TAURI_INTERNALS__={invoke:async(c,a)=>calls.push(a.event)};});
  await page.goto('https://desktop.test/');
  assert.deepEqual(await page.evaluate(()=>calls),['desktop-update-check']);
  assert.equal(await page.locator('#art').count(),1,'Use the actual ERP particle cover');
  assert.equal(await page.locator('#action').innerText(),'업무시스템 접속 중');
  assert.equal(await page.locator('#action').isDisabled(),true);
  assert.equal(await page.locator('#action').evaluate(el=>getComputedStyle(el,'::after').animationName),'startup-wave');
  await page.evaluate(()=>window.renderUpdate({state:'ready'}));await page.clock.fastForward(5000);
  assert.equal(await page.evaluate(()=>calls.length),1,'A successful check must keep the landing page until access is clicked');
  assert.equal(await page.locator('#action .action-label').innerText(),'업무시스템 접속');
  assert.equal(await page.locator('#action').isDisabled(),false);
  await page.getByRole('button',{name:'업무시스템 접속',exact:true}).click();await page.clock.fastForward(5000);
  assert.equal(await page.evaluate(()=>calls.length),2,'Access starts only after the user clicks');
  await page.evaluate(()=>window.renderUpdate({state:'available',version:'0.2.1',current:'0.2.0',notes:'<img src=x onerror=alert(1)>\n배율 개선'}));
  assert.equal(await page.getByRole('button',{name:'나중에'}).count(),0);
  assert.equal(await page.locator('#notes img').count(),0);
  assert.equal(await page.locator('#notes, #version, .startup-details').count(),0);
  assert.equal(await page.locator('#connection-status').isVisible(),false);
  await page.getByRole('button',{name:'업데이트 시작'}).click();
  assert.equal(await page.evaluate(()=>calls.at(-1)),'desktop-update-install');
  assert.equal(await page.locator('.startup-dots').isVisible(),true);
  assert.equal(await page.locator('.startup-dots i').count(),3);
  assert.equal(await page.locator('#action').evaluate(el=>getComputedStyle(el,'::after').animationName),'none','No connection wave immediately after update click');
  await page.evaluate(()=>window.renderUpdate({state:'downloading',downloaded:0}));
  assert.equal(await page.locator('#action').evaluate(el=>getComputedStyle(el,'::after').animationName),'none','Unknown download length must not show connection wave');
  assert.equal(await page.locator('#action').isDisabled(),true);
  await page.evaluate(()=>window.renderUpdate({state:'downloading',downloaded:50,total:100}));
  assert.equal(await page.locator('progress').getAttribute('value'),'50');
  assert.equal(await page.locator('progress').isVisible(),false);
  assert.equal(await page.locator('.startup-dots').isVisible(),true);
  assert.equal(await page.locator('#connection-status').isVisible(),false);
  assert.equal(await page.locator('#action .action-label').innerText(),'업데이트 설치 중');
  await page.evaluate(()=>window.renderUpdate({state:'installing'}));
  assert.equal(await page.locator('progress').getAttribute('value'),null,'Installation is indeterminate');
  assert.equal(await page.locator('.startup-dots').isVisible(),true);
  assert.equal(await page.locator('#action').evaluate(el=>getComputedStyle(el,'::after').animationName),'none');
  await page.reload();
  await page.evaluate(()=>window.renderUpdate({state:'error',message:'연결 실패'}));
  assert.equal(await page.evaluate(()=>localStorage.getItem('erp-update-access-pending')),'true','A failed check after restart must preserve post-update access');
  await page.evaluate(()=>window.renderUpdate({state:'ready'}));await page.clock.fastForward(5000);
  assert.equal(await page.locator('#action .action-label').innerText(),'업무시스템 접속');
  assert.equal(await page.evaluate(()=>calls.length),1,'Updated app waits for access after restart');
  await page.getByRole('button',{name:'업무시스템 접속',exact:true}).click();await page.clock.fastForward(5000);
  assert.equal(await page.evaluate(()=>calls.at(-1)),'desktop-update-check');
  assert.equal(await page.locator('#action').evaluate(el=>getComputedStyle(el,'::after').animationName),'startup-wave');
  await page.evaluate(()=>window.renderUpdate({state:'connecting'}));
  assert.equal(await page.locator('#action').evaluate(el=>getComputedStyle(el,'::after').animationName),'startup-wave','Keep the wave when entering ERP');
  assert.equal(await page.locator('progress').isVisible(),false);
  assert.equal(await page.locator('.startup-dots').isVisible(),false);
  await page.evaluate(()=>window.renderUpdate({state:'error',message:'다운로드에 실패했습니다.'}));
  assert.equal(await page.evaluate(()=>localStorage.getItem('erp-update-access-pending')),null);
  assert.equal(await page.locator('.startup-dots').isVisible(),false);
  await page.getByRole('button',{name:'다시 시도'}).click();
  assert.equal(await page.evaluate(()=>calls.at(-1)),'desktop-update-check');
 }finally{await browser.close();}
});

test('real browser cover checks the login endpoint and recovers from connection failure',async()=>{
 const browser=await chromium.launch({headless:true,channel:'msedge'});
 try{
  const page=await browser.newPage();let fail=true,release;
  await page.route('https://erp.test/**',async route=>{
   const url=new URL(route.request().url());
   if(url.pathname==='/login.html'){
    if(route.request().method()==='HEAD'){
     await new Promise(resolve=>release=resolve);
     return route.fulfill({status:fail?503:200,body:''});
    }
    return route.fulfill({contentType:'text/html',body:'<h1>Login</h1>'});
   }
   const name=url.pathname==='/'?'cover.html':url.pathname.slice(1);
   return route.fulfill({body:fs.readFileSync(path.join(__dirname,'..',name)),contentType:name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':name.endsWith('.otf')?'font/otf':'text/html'});
  });
  await page.goto('https://erp.test/');
  await page.locator('#action').click();
  assert.equal(await page.locator('#action').isDisabled(),true);
  assert.equal(await page.locator('#action .action-label').innerText(),'업무시스템 접속 중');
  assert.equal(await page.locator('#action').evaluate(el=>getComputedStyle(el,'::after').animationName),'startup-wave');
  while(!release)await new Promise(r=>setTimeout(r,10));
  release();await page.getByRole('button',{name:'다시 시도'}).waitFor();
  assert.equal(page.url(),'https://erp.test/');
  fail=false;release=null;await page.locator('#action').click();
  while(!release)await new Promise(r=>setTimeout(r,10));
  release();await page.waitForURL('https://erp.test/login.html');
 }finally{await browser.close();}
});

test('startup waves remain for five seconds before update availability and ERP access',async()=>{
 const browser=await chromium.launch({headless:true,channel:'msedge'});
 try{
 const page=await browser.newPage();
 await page.clock.install({time:new Date('2026-01-01T00:00:00Z')});await page.clock.pauseAt(new Date('2026-01-01T00:00:01Z'));
 await page.route('https://startup.test/**',route=>{
 const name=new URL(route.request().url()).pathname.slice(1)||'cover.html';
 let body=fs.readFileSync(path.join(__dirname,'..',name));
 if(name==='cover.html')body=body.toString().replace('<body class="c1">','<body class="c1" data-desktop-startup="true">');
 return route.fulfill({body,contentType:name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':name.endsWith('.otf')?'font/otf':'text/html'});
 });
 await page.addInitScript(()=>{window.calls=[];window.__TAURI_INTERNALS__={invoke:async(c,a)=>calls.push(a.event)};localStorage.setItem('erp-update-access-pending','true');});
 await page.goto('https://startup.test/');
 await page.evaluate(()=>renderUpdate({state:'available'}));
 assert(await page.locator('#action').isDisabled(),'Fast update response must keep the checking wave');
 await page.clock.fastForward(4999);assert(await page.locator('#action').isDisabled());
 await page.clock.fastForward(1);assert.equal(await page.locator('#action .action-label').innerText(),'업데이트 시작');
 await page.locator('#action').click();assert(await page.locator('.startup-dots').isVisible(),'Install indicator starts immediately');
 await page.reload();
 await page.evaluate(()=>renderUpdate({state:'ready'}));
 await page.clock.fastForward(5000);
 assert.equal(await page.locator('#action .action-label').innerText(),'업무시스템 접속');
 const before=await page.evaluate(()=>calls.length);
 await page.locator('#action').click();
 await page.clock.fastForward(4999);assert.equal(await page.evaluate(()=>calls.length),before,'Do not leave the cover before five seconds');
 assert.equal(await page.locator('#action').evaluate(el=>getComputedStyle(el,'::after').animationName),'startup-wave');
 await page.clock.fastForward(1);assert.equal(await page.evaluate(()=>calls.length),before+1);
 await page.evaluate(()=>renderUpdate({state:'checking'}));
 await page.evaluate(()=>renderUpdate({state:'ready'}));
 await page.evaluate(()=>renderUpdate({state:'error',message:'Connection failed'}));
 await page.clock.fastForward(5000);assert.equal(await page.locator('#action .action-label').innerText(),'다시 시도','Stale successful results must not hide an error');
 }finally{await browser.close();}
});
