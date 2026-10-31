'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{webcrypto}=require('node:crypto');
const source=fs.readFileSync(__dirname+'/as-integrity-ui.js','utf8');
function browser(fetch,storage=new Map(),crypto=webcrypto){const ctx={fetch,crypto,FormData,TextEncoder,Uint8Array,currentUser:{id:'fixture'},sessionStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)}};vm.createContext(ctx);vm.runInContext(source,ctx);return ctx;}
test('unknown network outcomes retain a key across reload and never silently resend changed input',async()=>{
  const storage=new Map(),keys=[];let fail=true;
  const fetch=async(url,options)=>{if(url.includes('/requests/'))return {ok:false,status:503};keys.push(options.headers['Idempotency-Key']);if(fail)throw Error('offline');return {ok:true,status:200,json:async()=>({success:true})};};
  let b=browser(fetch,storage);await assert.rejects(b.asWrite('/api/as','POST',{ship:'fixture'},'create'),/offline/);
  assert(![...storage.values()].some(v=>v.includes('ship')));
  b=browser(fetch,storage);await assert.rejects(b.asWrite('/api/as','POST',{ship:'changed'},'create'),/이전 저장/);assert.equal(keys.length,1);
  fail=false;await b.asWrite('/api/as','POST',{ship:'fixture'},'create');assert.equal(keys[0],keys[1]);assert.equal(storage.size,0);
  await b.asWrite('/api/as','POST',{ship:'fixture'},'create');assert.notEqual(keys[1],keys[2]);
});
test('HTTP intranet change detection works without subtle crypto; denied input can be corrected',async()=>{
  let deny=true;const keys=[];const b=browser(async(url,options)=>{if(url.includes('/requests/'))return {ok:true,json:async()=>({request:null})};keys.push(options.headers['Idempotency-Key']);return {ok:!deny,status:deny?400:200,json:async()=>deny?{error:'validation'}:{success:true}};},new Map(),{getRandomValues:a=>webcrypto.getRandomValues(a)});
  await assert.rejects(b.asWrite('/api/as','POST',{ship:''},'create'),/validation/);deny=false;await b.asWrite('/api/as','POST',{ship:'valid'},'create');assert.equal(keys[0],keys[1]);
});
test('changed input resolves a committed request and requires explicit intent for a new save',async()=>{
  let fail=true,confirmed=false;const keys=[];
  const b=browser(async(url,options)=>{if(url.includes('/requests/'))return {ok:true,json:async()=>({request:{asNo:'AS-TEST'}})};keys.push(options.headers['Idempotency-Key']);if(fail)throw Error('offline');return {ok:true,json:async()=>({success:true})};});
  b.asConfirmWrite=async()=>confirmed;
  await assert.rejects(b.asWrite('/api/as','POST',{ship:'first'},'create'),/offline/);
  await assert.rejects(b.asWrite('/api/as','POST',{ship:'changed'},'create'),/추가 저장하지/);assert.equal(keys.length,1);
  fail=false;confirmed=true;await b.asWrite('/api/as','POST',{ship:'changed'},'create');assert.notEqual(keys[0],keys[1]);
});
test('authentication expiry retains the request key for the same user after login',async()=>{
  const storage=new Map(),keys=[];let expired=true;
  const fetch=async(url,options)=>{keys.push(options.headers['Idempotency-Key']);return {ok:!expired,status:expired?401:200,json:async()=>expired?{error:'login'}:{success:true}};};
  await assert.rejects(browser(fetch,storage).asWrite('/api/as','POST',{ship:'first'},'create'),/login/);
  expired=false;await browser(fetch,storage).asWrite('/api/as','POST',{ship:'first'},'create');assert.equal(keys[0],keys[1]);
});
test('file bytes are part of retry identity',async()=>{
  const b=browser(async(url)=>{if(url.includes('/requests/'))return {ok:false};throw Error('offline');});const form=text=>{const data=new FormData();data.append('files',new Blob([text]),'fixture.txt');return data;};
  await assert.rejects(b.asWrite('/api/as','POST',form('one'),'create'),/offline/);
  await assert.rejects(b.asWrite('/api/as','POST',form('two'),'create'),/이전 저장/);
});
test('saved and new filenames are DOM text and never become inline handlers or download markup',()=>{
  function element(tag){return {tag,children:[],dataset:{},style:{},attributes:{},textContent:'',innerHTML:'',append(...nodes){this.children.push(...nodes)},replaceChildren(...nodes){this.children=nodes;this.innerHTML=''},setAttribute(k,v){this.attributes[k]=v},addEventListener(type,fn){this[type]=fn},classList:{add(){}}};}
  const elements={asExistingFiles:element('div'),asNewFiles:element('div'),asFiles:{files:[]},fileViewerTitle:element('h2'),fileViewerDownload:element('a'),fileViewerContent:element('div'),fileViewer:element('div')};
  const ctx={SERVER:'',resetAsPreview(){},attachmentUrl:name=>'/uploads/'+encodeURIComponent(name),document:{getElementById:id=>elements[id],createElement:element}};vm.createContext(ctx);
  const html=fs.readFileSync(__dirname+'/dashboard.html','utf8');vm.runInContext(html.slice(html.indexOf('let asRemoveFiles ='),html.indexOf('function closeFileViewer()')),ctx);
  const name='<img src=x onerror="fixture()">.txt';ctx.renderExistingFiles([{filename:'safe.txt',name}]);assert.equal(elements.asExistingFiles.children[0].children[0].textContent,name);assert.equal(elements.asExistingFiles.innerHTML,'');
  elements.asFiles.files=[{name}];ctx.renderAsFilePreview();assert.equal(elements.asNewFiles.children[0].textContent,name);
  ctx.openFileViewer('safe.txt',name);const link=elements.fileViewerContent.children[0].children[1];assert.equal(link.download,name);assert.equal(elements.fileViewerContent.innerHTML,'');
});
