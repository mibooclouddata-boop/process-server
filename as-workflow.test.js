const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {applyWorkflow,normalize,dateValid}=require('./as-workflow');
const actor={name:'테스트 담당',department:'품질'},day='2026-10-20',now='2026-10-20T00:00:00Z';
const base=()=>({id:'test',status:'접수',deliveryAgreedDate:'2026-10-25',createdBy:actor.name,files:[]});
const run=(item,input)=>applyWorkflow(item,{revision:item.workflow?.revision||0,...input},actor,day,now);
const start=item=>run(item,{action:'advance',next:'제작 요청',owner:'제작 담당',dueDate:'2026-10-21'});
test('full route preserves deadline, completion dates and audit history',()=>{
 let a=start(base());assert.equal(a.status,'제작 요청');
 a=run(a,{action:'save',deliveryAgreedDate:'2026-10-26'});assert.equal(a.deliveryAgreedDate,'2026-10-26');assert.equal(a.workflow.history.filter(h=>h.type==='deadline').length,1);
 a=run(a,{action:'advance',next:'도장 요청',owner:'도장 담당',dueDate:'2026-10-23',completedDate:day});assert.equal(a.workflow.stages['제작 요청'].completedDate,day);
 a=run(a,{action:'advance',next:'납품 요청',owner:'납품 담당',dueDate:'2026-10-24',completedDate:day});
 a=run(a,{action:'advance',next:'완료',completedDate:day});assert.equal(a.deliveredDate,day);
 assert.equal(a.status,'완료');assert.equal(a.completedBy,actor.name);assert.equal(a.workflow.revision,5);assert.throws(()=>run(a,{action:'save'}));
});
test('sequential stages and delivery deadline are required',()=>{
 assert.throws(()=>run(base(),{action:'advance',next:'도장 요청',skipReason:'도장 보수만 필요'}));
 assert.throws(()=>start({...base(),deliveryAgreedDate:''}));
 const a=start(base());
 assert.throws(()=>run(base(),{action:'advance',next:'납품 요청',owner:'담당',dueDate:day}));
 assert.throws(()=>run(base(),{action:'advance',next:'완료',completionNote:'완료'}));
 assert.throws(()=>run(a,{action:'advance',next:'완료',completedDate:day,completionNote:'완료'}));
});
test('bad dates, reverse moves and concurrent edits rejected without mutation',()=>{
 assert.equal(dateValid('2026-02-30'),false);assert.equal(dateValid('2024-02-29'),true);
 assert.throws(()=>run(base(),{action:'advance',next:'제작 요청',deliveryAgreedDate:'2026-02-30'}));
 const a=start(base()),snapshot=JSON.stringify(a);
 for(const input of [{action:'save',revision:0,owner:'a',dueDate:day},{action:'advance',next:'제작 요청'},{action:'advance',next:'도장 요청',owner:'a',dueDate:day,completedDate:'2026-10-21'}])assert.throws(()=>run(a,input));
 assert.equal(JSON.stringify(a),snapshot);
});
test('actual dates can precede entry dates but cannot reverse stage order or be future dates',()=>{
 let item=start(base());
 item=run(item,{action:'advance',next:'도장 요청',completedDate:'2026-10-18'});
 assert.equal(item.workflow.stages['제작 요청'].completedDate,'2026-10-18');
 assert.throws(()=>run(item,{action:'advance',next:'납품 요청',completedDate:'2026-10-17'}));
 item=run(item,{action:'advance',next:'납품 요청',completedDate:'2026-10-19'});
 assert.throws(()=>run(item,{action:'advance',next:'완료',completedDate:'2026-10-18'}));
 assert.throws(()=>run(item,{action:'advance',next:'완료',completedDate:'2026-10-21'}));
 item=run(item,{action:'advance',next:'완료',completedDate:day});
 assert.equal(item.deliveredDate,day);
});
test('legacy state preserved without fabricating stage completions',()=>{
 const old={...base(),status:'승인 요청',reviewer:'이전 검토자'};
 const normalized=normalize(old);assert.equal(normalized.status,'접수');assert.equal(normalized.legacyStatus,'승인 요청');assert.equal(old.status,'승인 요청');
 const a=start(old);assert.equal(a.reviewer,'이전 검토자');assert.equal(a.workflow.stages['제작 요청'].completedDate,undefined);
});
test('dashboard syntax, document fields and HTML escaping',()=>{
 const html=fs.readFileSync(__dirname+'/dashboard.html','utf8');
 for(const script of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g))new vm.Script(script[1]);
 const context={document:{addEventListener(){},createElement:()=>({}),head:{appendChild(){}}}};vm.createContext(context);vm.runInContext(fs.readFileSync(__dirname+'/as-workflow-ui.js','utf8'),context);
 const doc=context.asJobDocument({...start(base()),asNo:'AS-TEST',product:'<script>bad</script>',materialCode:'MAT-01',reason:'수량 누락',reviewer:'검토자',approver:'승인자'});
 assert(doc.includes('결재선'));assert(doc.includes('MAT-01'));assert(doc.includes('info-table'));assert(doc.includes('rowspan="3"'));assert(doc.includes('as-doc-approval'));assert(doc.includes('&lt;script&gt;'));assert(!doc.includes('<script>bad'));
 assert.equal((html.match(/<script src="\/as-workflow-ui.js\?v=intake-order-6"><\/script>/g)||[]).length,1);
});
test('workflow API persists only valid requests and blocks stale edits',()=>{
 const src=fs.readFileSync(__dirname+'/server.js','utf8');const from=src.indexOf("app.patch('/api/as/:id/workflow'"),to=src.indexOf("app.delete('/api/as/:id'",from);
 let handler,saved,stored={list:[base()]};
 const context={app:{patch:(path,...handlers)=>handler=handlers.at(-1)},authenticateAsWorkflow(){},asUpload:{array:()=>null},loadAs:()=>structuredClone(stored),loadData:()=>({users:[{...actor,id:'test'}]}),saveAs:data=>{saved=data;stored=data;},asWorkflow:{applyWorkflow:(item,input,who)=>applyWorkflow(item,input,who,day,now)},fs,Buffer};
 vm.createContext(context);vm.runInContext(src.slice(from,to),context);
 const call=body=>{const res={code:200,status(code){this.code=code;return this;},json(data){this.data=data;return this;}};handler({params:{id:'test'},asActor:body.actorId==='test'?actor:null,body,files:[]},res);return res;};
 const payload={actorId:'test',revision:0,action:'advance',next:'제작 요청',owner:'담당',dueDate:day};
 assert.equal(call({...payload,actorId:'unknown'}).code,403);assert.equal(saved,undefined);
 assert.equal(call(payload).code,200);assert.equal(saved.list[0].status,'제작 요청');assert.equal(call(payload).code,409);
});

﻿test('delivery agreement date persists, clears and validates without changing production due dates',()=>{
 const src=fs.readFileSync(__dirname+'/server.js','utf8');const start=src.indexOf("app.post('/api/as',"),end=src.indexOf("app.patch('/api/as/:id/review'",start);
 let post,put,stored={list:[],monthSeq:{}};
 const context={app:{post:(path,m,fn)=>post=fn,put:(path,m,fn)=>put=fn},asUpload:{array:()=>null},asWorkflow:require('./as-workflow'),loadAs:()=>structuredClone(stored),saveAs:data=>stored=data,Buffer,Date};
 vm.createContext(context);vm.runInContext(src.slice(start,end),context);
 const call=(handler,body)=>{const r={code:200,status(c){this.code=c;return this;},json(data){this.data=data;}};handler({body,files:[],params:{id:stored.list[0]?.id}},r);return r;};
 const body={ship:'TEST',block:'B',reason:'품질 불량',deliveryAgreedDate:'2026-11-01'};
 assert.equal(call(post,body).code,200);assert.equal(stored.list[0].deliveryAgreedDate,'2026-11-01');
 assert.equal(call(put,{remark:'test'}).code,200);assert.equal(stored.list[0].deliveryAgreedDate,'2026-11-01');
 assert.equal(call(put,{deliveryAgreedDate:'2026-11-02'}).code,200);assert.equal(stored.list[0].deliveryAgreedDate,'2026-11-02');
 assert.equal(call(put,{deliveryAgreedDate:''}).code,200);assert.equal(stored.list[0].deliveryAgreedDate,'');
 for(const value of ['2026-02-30','invalid',null,20261020]){assert.equal(call(put,{deliveryAgreedDate:value}).code,400);assert.equal(call(post,{...body,deliveryAgreedDate:value}).code,400);}
 stored.list[0].status='제작 요청';assert.equal(call(put,{deliveryAgreedDate:'2026-11-03'}).code,400);
});

test('approval slots show the authenticated completer for each stage and preserve old audit names',()=>{
 const c={document:{addEventListener(){},createElement:()=>({}),head:{appendChild(){}}}};vm.createContext(c);vm.runInContext(fs.readFileSync(__dirname+'/as-workflow-ui.js','utf8'),c);
 let item=start(base());
 const people=[{id:'maker',name:'제작 담당',department:'제작팀',position:'기사'},{id:'painter',name:'도장 담당'},{id:'deliverer',name:'납품 담당'}];
 for(const [i,next] of ['도장 요청','납품 요청','완료'].entries()){
  item=applyWorkflow(item,{revision:item.workflow.revision,action:'advance',next,completedDate:day,completedBy:'위조된 이름'},people[i],day,now);
  const stage=item.workflow.stages[['제작 요청','도장 요청','납품 요청'][i]];
  assert.equal(stage.completedBy,people[i].name);assert.equal(stage.completedUserId,people[i].id);assert.equal(stage.completedAt,now);
 }
 const output=c.asJobApprovalLine(item);
 for(const person of [actor,...people])assert(output.includes(person.name));
 assert(!output.includes('위조된 이름'));assert(!output.includes('>검토<'));assert(!output.includes('>승인<'));
 assert.equal((output.match(/scope="col"/g)||[]).length,4);
 delete item.workflow.stages['제작 요청'].completedBy;
 assert(c.asJobApprovalLine(item).includes('제작 담당'));
 const pending=c.asJobApprovalLine({...base(),reviewer:'과거 검토자',approver:'과거 승인자'});
 assert(!pending.includes('과거 검토자'));assert(!pending.includes('과거 승인자'));assert(!pending.includes('제작 담당'));
});

test('shared calendar respects stage bounds, clearing and month boundaries',()=>{
 const c={Event,document:{addEventListener(){},createElement:()=>({}),head:{appendChild(){}}}};vm.createContext(c);vm.runInContext(fs.readFileSync(__dirname+'/as-workflow-ui.js','utf8'),c);
 const input={value:'2026-10-20',min:'2026-10-19',max:'2026-10-21',events:[],dispatchEvent(e){this.events.push(e.type)}};let closes=0;c.input=input;c.dialog={innerHTML:'',close(){closes++}};
 vm.runInContext('appDateState.input=input;appDateState.dialog=dialog;appDateState.view=new Date(2026,9,1)',c);
 c.pickAppDate('2026-10-22');c.pickAppDate('2026-10-18');assert.equal(input.value,'2026-10-20');assert.equal(closes,0);
 c.pickAppDate('2026-10-21');assert.equal(input.value,'2026-10-21');assert.deepEqual(input.events,['input','change']);assert.equal(closes,1);
 c.pickAppDate('');assert.equal(input.value,'');c.moveAppDatePicker(3);assert(c.dialog.innerHTML.includes('2027년 1월'));assert.equal((c.dialog.innerHTML.match(/aria-pressed=/g)||[]).length,42);
});

test('legacy records without an agreement can enter the new workflow through the dialog',()=>{
 const legacy=normalize({id:'old',status:'승인 요청',createdBy:actor.name,reviewer:'previous'});
 const dialog={open:false,showModal(){this.open=true;},setAttribute(){},addEventListener(){}};
 const context={currentUser:{...actor,role:'sysadmin'},document:{addEventListener(){},createElement:()=>({}),head:{appendChild(){}},getElementById:id=>id==='asJobDialog'?dialog:null}};
 vm.createContext(context);vm.runInContext(fs.readFileSync(__dirname+'/as-workflow-ui.js','utf8'),context);
 context.openAsWorkflow(legacy);
 assert(dialog.innerHTML.includes('id="asJobLegacyDeadline"'));
 assert(!dialog.innerHTML.includes('class="as-job-primary" disabled'));
 const updated=applyWorkflow(legacy,{revision:0,action:'advance',next:'제작 요청',deliveryAgreedDate:'2026-10-25'},actor,day,now);
 assert.equal(updated.status,'제작 요청');assert.equal(updated.reviewer,'previous');assert.equal(updated.deliveryAgreedDate,'2026-10-25');
 assert.throws(()=>applyWorkflow(legacy,{revision:0,action:'advance',next:'제작 요청',deliveryAgreedDate:''},actor,day,now));
});
