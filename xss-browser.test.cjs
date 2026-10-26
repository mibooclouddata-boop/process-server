'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawn}=require('node:child_process');
const {once}=require('node:events');
const {chromium}=require('playwright');
const {hashPassword}=require('./passwords');

test('stored business data is inert in real Chromium, with CSP disabled as well as enabled',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'process-xss-'));
 const password='Synthetic-browser-passphrase!';
 const attack=`<img src=x onerror="window.__xss=1;fetch('/api/erp/all',{method:'DELETE',headers:{'X-Requested-With':'process-server'}})">`;
 const quote=`');window.__xss=2;// &quot; autofocus onfocus="window.__xss=3"`;
 const write=(name,value)=>fs.writeFileSync(path.join(dir,name),JSON.stringify(value));
 write('data.json',{users:[{id:'tester',name:'테스트',role:'sysadmin',passwordHash:hashPassword(password)}],records:[]});
 write('products.json',[{name:attack},{name:quote}]);
 const child=spawn(process.execPath,['server.js'],{cwd:__dirname,env:{...process.env,PORT:'0',HOST:'127.0.0.1',PROCESS_DATA_DIR:dir},stdio:['ignore','pipe','pipe']});
 let browser;
 t.after(async()=>{if(browser)await browser.close();child.kill();if(child.exitCode===null)await once(child,'exit');fs.rmSync(dir,{recursive:true,force:true});});
 const base=await new Promise((resolve,reject)=>{let out='';const timer=setTimeout(()=>reject(Error('startup timeout')),30000);child.stdout.on('data',data=>{out+=data;const m=out.match(/http:\/\/localhost:(\d+)/);if(m){clearTimeout(timer);resolve('http://127.0.0.1:'+m[1]);}});child.once('exit',()=>{clearTimeout(timer);reject(Error('server exited'));});});
 browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHANNEL?{channel:process.env.PLAYWRIGHT_CHANNEL}:process.platform==='win32'?{channel:'msedge'}:{})});
 const context=await browser.newContext();
 const headers={'X-Requested-With':'process-server','Idempotency-Key':require('crypto').randomUUID()};
 assert.equal((await context.request.post(base+'/api/login',{headers,data:{id:'tester',password}})).status(),200);
 // Persist attacks through actual API writes, not just DOM fixture injection.
 const create=await context.request.post(base+'/api/as',{headers,data:{ship:quote,block:quote,element:attack,product:attack,reason:'기타',action:attack,remark:attack}});
 assert.equal(create.status(),200);const item=(await create.json()).item;
 const page=await context.newPage(),errors=[],forbidden=[];
 page.on('pageerror',error=>errors.push(error.message));
 page.on('request',request=>{if(request.url().endsWith('/api/erp/all')&&request.method()==='DELETE')forbidden.push(request.url());});
 await page.route('**/*',async route=>{
  if(!route.request().url().startsWith(base))return route.abort();
  if(route.request().url()===base+'/dashboard.html'){
   const response=await route.fetch(),headers={...response.headers()};delete headers['content-security-policy'];
   return route.fulfill({response,headers});
  }
  return route.continue();
 });
 await page.goto(base+'/dashboard.html');assert.deepEqual(errors,[]);await page.waitForFunction(()=>typeof currentUser!=='undefined'&&currentUser?.id==='tester');
 await page.evaluate(async()=>{await loadAsList();_asFiltered=_asFullList;_renderAsPage();await loadProductList();});
 assert.equal(await page.locator('#asTableBody img').count(),0);
 assert((await page.locator('#asTableBody').textContent()).includes('<img'), await page.locator('#asTableBody').textContent());
 await page.evaluate(()=>{document.getElementById('asProduct').value='';showProductSuggest();});
 assert.equal(await page.locator('#asProductSuggest img').count(),0);
 await page.locator('#asProductSuggest > div').first().dispatchEvent('mousedown');
 assert.equal(await page.locator('#asProduct').inputValue(),attack);
 await page.evaluate(({attack,quote})=>{
  renderExistingFiles([{filename:'fixture.txt',name:attack},{filename:quote+'.txt',name:quote}]);
  const dt=new DataTransfer();dt.items.add(new File(['fixture'],attack+'.txt'));document.getElementById('asFiles').files=dt.files;renderAsFilePreview();
 },{attack,quote});
 assert.equal(await page.locator('#asExistingFiles img, #asNewFiles img').count(),0);
 await page.evaluate(()=>document.querySelector('#asExistingFiles button[aria-label]').click());
 assert.deepEqual(await page.evaluate(()=>asRemoveFiles),['fixture.txt']);
 const print=await page.evaluate(async({item,attack})=>{const data=await buildAsPageHtml({...item,files:[{filename:'fixture.txt',name:attack}]});return buildAsWrapperHtml([item],[data]);},{item,attack});
 const printPage=await context.newPage();await printPage.setContent(print);
 assert.equal(await printPage.locator('img').count(),0);assert((await printPage.locator('body').textContent()).includes(attack));
 assert.equal(await page.evaluate(()=>window.__xss||0),0);assert.equal(forbidden.length,0);assert.deepEqual(errors,[]);
 // PDF.js must never compile embedded PDF expressions as JavaScript.
 const pdfOptions=await page.evaluate(async item=>{
  window._pdfjsLoaded=true;
  window.pdfjsLib={getDocument:options=>{window.__pdfOptions=options;return {promise:Promise.resolve({numPages:0})};}};
  await buildAsPageHtml({...item,files:[{filename:'fixture.pdf',name:'fixture.pdf'}]});
  return window.__pdfOptions;
 },item);
 assert.equal(pdfOptions.isEvalSupported,false);
 assert.equal(pdfOptions.url,base+'/uploads/fixture.pdf');
 // CSP is defense in depth; the preceding checks deliberately removed it.
 await page.unroute('**/*');
 const response=await page.goto(base+'/dashboard.html');
 assert.match(response.headers()['content-security-policy'],/script-src-elem 'self' 'sha256-/);
 await page.waitForFunction(()=>currentUser?.id==='tester');
 await page.evaluate(()=>{const script=document.createElement('script');script.textContent='window.__xss=99';document.head.append(script);});
 assert.equal(await page.evaluate(()=>window.__xss||0),0);
 assert.deepEqual(errors,[]);
});
