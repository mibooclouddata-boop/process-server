'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(__dirname+'/dashboard.html','utf8');
const escapeHtml=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function fixture({pages=1,width=100,height=100,failPage=0,data='data:image/png;base64,AAAA'}={}) {
  const state={rendered:0,cleaned:0,destroyed:0,canvases:[]};
  const pdf={numPages:pages,getPage:async n=>({getViewport:()=>({width,height}),render:()=>{state.rendered++;return {promise:n===failPage?Promise.reject(Error('synthetic render failure')):Promise.resolve(),cancel(){}};},cleanup(){state.cleaned++;}})};
  const pdfjsLib={getDocument:options=>{state.options=options;return {promise:Promise.resolve(pdf),destroy(){state.destroyed++;return Promise.resolve();}};}};
  const document={createElement:()=>{const canvas={width:0,height:0,getContext:()=>({}),toDataURL:()=>data};state.canvases.push(canvas);return canvas;}};
  const ctx={window:{_pdfjsLoaded:true,pdfjsLib},pdfjsLib,document,escapeHtml,attachmentUrl:f=>'/uploads/'+f,asJobDocument:()=>'<div>job</div>',normalizeAsReason:v=>v,setTimeout,clearTimeout,AbortController,Date};
  if(fs.existsSync(__dirname+'/as-pdf-preview.js'))ctx.AsPdfPreview=require('./as-pdf-preview');
  vm.createContext(ctx);
  vm.runInContext(source.slice(source.indexOf('async function buildAsPageHtml('),source.indexOf('function getLegacyAsCssStr()')),ctx);
  const item={files:[{filename:'fixture.pdf',name:'<script>fixture</script>.pdf'}]};
  return {ctx,state,item,build:budget=>ctx.buildAsPageHtml(item,budget)};
}
test('normal small PDF includes every page and releases PDF, pages and canvases',async()=>{
  const f=fixture({pages:2}),result=await f.build();
  assert.equal((result.attachHtml.match(/<img /g)||[]).length,2);
  assert.equal(f.state.options.isEvalSupported,false);
  assert.equal(f.state.cleaned,2);assert.equal(f.state.destroyed,1);
  assert(f.state.canvases.every(c=>c.width===0&&c.height===0));
});
test('excessive page count produces an escaped named fallback without rendering',async()=>{
  const f=fixture({pages:100}),result=await f.build();
  assert.equal(f.state.rendered,0);assert.doesNotMatch(result.attachHtml,/<img |<script>/);
  assert.match(result.attachHtml,/&lt;script&gt;fixture/);assert.match(result.attachHtml,/원본/);
});
test('huge or invalid page dimensions are rejected before canvas allocation',async()=>{
  for(const width of [1e12,Infinity,NaN,0,-1]){
    const f=fixture({width}),result=await f.build();
    assert.equal(f.state.canvases.length,0);assert.doesNotMatch(result.attachHtml,/<img /);
  }
});
test('a later failed page never leaves a silently partial document',async()=>{
  const f=fixture({pages:2,failPage:2}),result=await f.build();
  assert.doesNotMatch(result.attachHtml,/<img /);assert.match(result.attachHtml,/원본/);
  assert.equal(f.state.cleaned,2);assert.equal(f.state.destroyed,1);
});
test('one budget limits pages, pixels and output across multiple records',async()=>{
  const api=require('./as-pdf-preview');
  for(const [counter,used,settings] of [['pages',39,{pages:2}],['pixels',47999999,{}],['bytes',24*1024*1024-10,{}]]){
    const budget=api.createBudget();budget[counter]=used;
    const f=fixture(settings),result=await f.build(budget);
    assert.doesNotMatch(result.attachHtml,/<img /,counter);assert.match(result.attachHtml,/원본/);
  }
  const budget=api.createBudget();budget.pages=38;
  const first=await fixture({pages:2}).build(budget),second=await fixture().build(budget);
  assert.equal((first.attachHtml.match(/<img /g)||[]).length,2);
  assert.doesNotMatch(second.attachHtml,/<img /);
});
test('expired and cancelled operations do not load another PDF',async()=>{
  const api=require('./as-pdf-preview');
  for(const mode of ['expired','cancelled']){
    const budget=api.createBudget();if(mode==='expired')budget.deadline=0;else budget.controller.abort();
    const f=fixture(),result=await f.build(budget);
    assert.equal(f.state.options,undefined);assert.doesNotMatch(result.attachHtml,/<img /);
  }
});
test('stalled loading and rendering are cancelled within the operation deadline',async()=>{
  const api=require('./as-pdf-preview');
  for(const phase of ['load','render']){
    let destroyed=0,cancelled=0,cleaned=0;
    const never=new Promise(()=>{}),budget=api.createBudget();budget.deadline=Date.now()+20;
    const f=fixture();
    const pdf={numPages:1,getPage:async()=>({getViewport:()=>({width:100,height:100}),render:()=>({promise:never,cancel(){cancelled++;}}),cleanup(){cleaned++;}})};
    f.ctx.pdfjsLib.getDocument=()=>({promise:phase==='load'?never:Promise.resolve(pdf),destroy(){destroyed++;}});
    const result=await f.build(budget);
    assert.doesNotMatch(result.attachHtml,/<img /);assert.equal(destroyed,1);
    if(phase==='render'){assert.equal(cancelled,1);assert.equal(cleaned,1);assert(f.state.canvases.every(c=>c.width===0));}
  }
});
function viewer(){
  const nodes=new Map(),revoked=[],budgets=[],urls=[];
  const node=id=>{if(!nodes.has(id))nodes.set(id,{style:{},classList:{add(){},remove(){}},innerHTML:''});return nodes.get(id);};
  const ctx={AsPdfPreview:require('./as-pdf-preview'),Blob,URL:{createObjectURL(){const url='blob:fixture-'+urls.length;urls.push(url);return url;},revokeObjectURL:url=>revoked.push(url)},document:{getElementById:node},asJobActionLabel:()=>'',asJobCanEdit:()=>false,_getSelectedAsItems:()=>[{asNo:'one'},{asNo:'two'}],buildAsWrapperHtml:()=>'<html></html>',buildAsPageHtml:async(item,budget)=>{budgets.push(budget);return {}},_viewerAsItem:null};
  vm.createContext(ctx);
  const state=source.match(/let _asPreviewBudget[\s\S]*?\nfunction /);
  if(state)vm.runInContext(state[0].slice(0,-10),ctx);
  for(const name of ['resetAsPreview','beginAsPreview','bulkPrintAs','printAsPdf','closeFileViewer']){
    const code=source.match(new RegExp('^(?:async )?function '+name+'\\([^]*?^}','m'));
    if(code)vm.runInContext(code[0],ctx);
  }
  return {ctx,nodes,revoked,budgets,urls};
}
test('batch print shares one budget across records and closing revokes its Blob URL',async()=>{
  const v=viewer();await v.ctx.bulkPrintAs();
  assert(v.budgets[0]);assert.equal(v.budgets[0],v.budgets[1]);
  v.ctx.closeFileViewer();assert.deepEqual(v.revoked,['blob:fixture-0']);
  assert.equal(v.budgets[0].controller.signal.aborted,true);
});
test('closing while rendering prevents stale viewer reopening or Blob creation',async()=>{
  const v=viewer();let finish;
  v.ctx.buildAsPageHtml=()=>new Promise(resolve=>{finish=resolve;});
  const pending=v.ctx.printAsPdf({asNo:'fixture'});v.ctx.closeFileViewer();finish({});await pending;
  assert.equal(v.urls.length,0);
});
test('starting a new preview detaches the previous print frame while rendering',async()=>{
  const v=viewer();await v.ctx.printAsPdf({asNo:'old'});let finish;
  v.ctx.buildAsPageHtml=()=>new Promise(resolve=>{finish=resolve;});
  const pending=v.ctx.printAsPdf({asNo:'new'});
  assert.equal(v.nodes.get('fileViewerContent').innerHTML,'');
  finish({});await pending;assert.deepEqual(v.revoked,['blob:fixture-0']);
});
test('document count is shared even when loading fails',async()=>{
  const budget=require('./as-pdf-preview').createBudget();budget.documents=19;
  const f=fixture();let loads=0;
  f.ctx.pdfjsLib.getDocument=()=>{loads++;return {promise:Promise.reject(Error('fixture')),destroy(){}};};
  f.item.files.push({filename:'second.pdf',name:'second.pdf'});
  const result=await f.build(budget);assert.equal(loads,1);assert.doesNotMatch(result.attachHtml,/<img /);
  assert.match(result.attachHtml,/second.pdf/);
});
test('closing an active render cancels it promptly without waiting for timeout',async()=>{
  const budget=require('./as-pdf-preview').createBudget(),f=fixture();let started,destroyed=0;
  const rendering=new Promise(resolve=>{started=resolve;});
  f.ctx.pdfjsLib.getDocument=()=>({promise:Promise.resolve({numPages:1,getPage:async()=>({getViewport:()=>({width:100,height:100}),render:()=>{started();return {promise:new Promise(()=>{}),cancel(){}};},cleanup(){}})}),destroy(){destroyed++;}});
  const pending=f.build(budget);await rendering;budget.controller.abort();
  const result=await pending;assert.equal(destroyed,1);assert.doesNotMatch(result.attachHtml,/<img /);
});
