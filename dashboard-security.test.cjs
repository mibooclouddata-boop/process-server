const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const html=fs.readFileSync('dashboard.html','utf8');
const escape=fs.readFileSync('as-workflow-ui.js','utf8').split('\n').find(line=>line.startsWith('function asJobEsc('));
const attack='\"><img src=x onerror="globalThis.pwned=1">\'&quot;';
function context(){
  const els=new Map();const get=id=>{if(!els.has(id))els.set(id,{value:'',innerHTML:'',textContent:'',classList:{add(){}},files:[]});return els.get(id);};
  const ctx=vm.createContext({document:{getElementById:get},SERVER:'',URLSearchParams,parseSearchTerms:()=>[],TYPE_INFO:{},fetch:async()=>({json:async()=>({records:[{barcode:attack,name:attack,type:attack,qty:attack,userName:attack,time:attack}]})})});
  vm.runInContext(escape,ctx);return {ctx,get};
}
test('business record strings and new attachment names are escaped',async()=>{
  const {ctx,get}=context();
  const start=html.lastIndexOf('async function ',html.indexOf("const raw = document.getElementById('recSearch')"));
  assert(start>0);
  const source=html.slice(start,html.indexOf('// ── 스캔 조회',start));
  vm.runInContext(source,ctx);await ctx[source.match(/async function (\w+)/)[1]]();
  const rendered=get('recordsBody').innerHTML;assert(!rendered.includes('<img'));assert(rendered.includes('&lt;img'));
  vm.runInContext(html.slice(html.indexOf('function renderAsFilePreview()'),html.indexOf('function renderExistingFiles(')),ctx);
  get('asFiles').files=[{name:attack}];ctx.renderAsFilePreview();assert(!get('asNewFiles').innerHTML.includes('<img'));
});
test('file viewer encodes paths and untrusted download names',()=>{
  const {ctx,get}=context();vm.runInContext(html.slice(html.indexOf('function openFileViewer('),html.indexOf('function closeFileViewer(')),ctx);
  ctx.openFileViewer(attack+'.bin',attack);
  assert(!get('fileViewerContent').innerHTML.includes('<img'));
  assert(get('fileViewerContent').innerHTML.includes('&quot;'));
  assert.equal(get('fileViewerDownload').href,'/uploads/'+encodeURIComponent(attack+'.bin'));
});
test('all inline dashboard scripts parse after hardening',()=>{
  for(const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))new vm.Script(match[1]);
});
