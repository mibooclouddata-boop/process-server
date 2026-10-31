'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{randomUUID}=require('node:crypto');
const {spawn}=require('node:child_process');
const {createAsStore}=require('./as-store'),{createAsService}=require('./as-service');
const owner={id:'fixture-owner',name:'Fixture',role:'worker'},other={id:'fixture-other',name:'Fixture',role:'worker'},admin={id:'fixture-admin',name:'Admin',role:'sysadmin'};
const base={ship:'TEST',block:'B01',reason:'test reason',deliveryAgreedDate:'2026-11-01'};
const denied=(fn,status)=>assert.rejects(Promise.resolve().then(fn),{status});
function fixture(t,options={}){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'as-integrity-')),file=path.join(dir,'as.json');
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const store=createAsStore(file,options),service=createAsService(store);
  return {dir,file,store,service};
}
test('durable retries return one UUID, number and audit event even after reopening the store',async t=>{
  const {file,service}=fixture(t),key=randomUUID();
  const [first,retry]=await Promise.all([service.create(base,[],owner,key),service.create(base,[],owner,key)]);
  assert.equal(first.item.id,retry.item.id);assert.equal(first.item.asNo,retry.item.asNo);assert.match(first.item.id,/^[a-f0-9-]{36}$/);
  const reopened=createAsService(createAsStore(file));const again=await reopened.create(base,[],owner,key);
  assert(again.replayed);assert.equal((await reopened.list()).length,1);assert.equal((await reopened.history(first.item.id,owner)).length,1);
  await denied(()=>service.create({...base,reason:'changed'},[],owner,key),409);
});
test('month numbering recovers a missing counter, uses Seoul and never reuses deleted numbers',async t=>{
  const {file,store}=fixture(t);fs.writeFileSync(file,JSON.stringify({list:[{...base,id:'legacy',asNo:'AS-2611-08',status:'접수',createdById:owner.id}],monthSeq:{}}));
  const service=createAsService(store,{clock:()=>new Date('2026-10-31T15:00:01Z')});
  const first=await service.create(base,[],owner,randomUUID());assert.equal(first.item.asNo,'AS-2611-09');
  await service.remove(first.item.id,{version:0,changeReason:'duplicate fixture'},owner,randomUUID());
  assert.equal((await service.create(base,[],owner,randomUUID())).item.asNo,'AS-2611-10');
});
test('common version prevents edits, workflow, or deletion from silently overwriting each other',async t=>{
  const {service}=fixture(t);let {item}=await service.create(base,[],owner,randomUUID());
  const outcomes=await Promise.allSettled([owner,other].map(actor=>service.update(item.id,{version:0,remark:actor.id},[],actor,randomUUID())));
  assert.equal(outcomes.filter(r=>r.status==='fulfilled').length,1);assert.equal(outcomes.find(r=>r.status==='rejected').reason.status,409);
  await denied(()=>service.remove(item.id,{version:0,changeReason:'stale'},owner,randomUUID()),409);
  await denied(()=>service.advance(item.id,{version:0,action:'advance',next:'제작 요청'},[],owner,randomUUID()),409);
  item=(await service.advance(item.id,{version:1,action:'advance',next:'제작 요청'},[],other,randomUUID())).item;
  assert.equal(item.updatedById,other.id);assert.equal(item.createdById,owner.id);
  assert.equal(item.version,2);assert.equal(item.workflow.revision,2);
  await denied(()=>service.update(item.id,{version:2,deliveryAgreedDate:''},[],owner,randomUUID()),400);
  await denied(()=>service.update(item.id,{remark:'no version'},[],owner,randomUUID()),428);
});

test('number month and audit timestamps use one instant even at the Seoul month boundary',async t=>{
  const {store}=fixture(t);let ticks=0;
  const service=createAsService(store,{clock:()=>new Date(ticks++===0?'2026-10-31T14:59:59.999Z':'2026-10-31T15:00:00.001Z')});
  const {item}=await service.create(base,[],owner,randomUUID());
  assert.match(item.asNo,/^AS-2610-/);assert.equal(item.createdAt,'2026-10-31T14:59:59.999Z');
  assert.equal((await service.history(item.id,owner))[0].at,item.createdAt);assert.equal(ticks,1);
});
test('required fields, category, amount and real dates reject malformed API inputs without writes',async t=>{
  const {service}=fixture(t);
  for(const field of ['ship','block','reason'])for(const value of ['', '  ',[],{},42,null])await denied(()=>service.create({...base,[field]:value},[],owner,randomUUID()),400);
  for(const value of ['0000-01-01','2026-02-30','invalid',null,20261020])await denied(()=>service.create({...base,deliveryAgreedDate:value},[],owner,randomUUID()),400);
  for(const value of ['-1','1.5','1e3','1,23','NaN','Infinity','9007199254740992',[],{},true])await denied(()=>service.create({...base,amount:value},[],owner,randomUUID()),400);
  await denied(()=>service.create({...base,category:'unknown'},[],owner,randomUUID()),400);assert.deepEqual(await service.list(),[]);
  let {item}=await service.create({...base,amount:'1,234,567'},[],owner,randomUUID());assert.equal(item.amount,1234567);
  for(const value of ['0','','9007199254740991']){item=(await service.update(item.id,{version:item.version,amount:value},[],owner,randomUUID())).item;assert.equal(item.amount,value===''?null:Number(value));}
  for(const field of ['ship','block','reason'])await denied(()=>service.update(item.id,{version:item.version,[field]:''},[],owner,randomUUID()),400);
  for(const value of ['null','{}','[1]'])await denied(()=>service.update(item.id,{version:item.version,removeFiles:value},[],owner,randomUUID()),400);
  for(const input of [null,[],5])await denied(()=>service.advance(item.id,input,[],owner,randomUUID()),400);
  await denied(()=>service.advance(item.id,{version:item.version,action:'advance',next:'제작 요청',changeReason:{}},[],owner,randomUUID()),400);
});

test('legacy records without creator IDs remain editable by any active staff without inventing ownership',async t=>{
  const {file,service}=fixture(t);
  fs.writeFileSync(file,JSON.stringify({list:[{...base,id:'legacy',asNo:'AS-2610-01',status:'검토 요청',createdBy:owner.name}]}));
  const {item}=await service.update('legacy',{version:0,status:'접수',remark:'reviewed'},[],other,randomUUID());
  assert.equal(item.status,'접수');assert.equal(item.legacyStatus,'검토 요청');assert.equal(item.remark,'reviewed');
  assert.equal(item.createdById,undefined);assert.equal(item.updatedById,other.id);
});

test('orphan cleanup is dry by default and preserves deleted, retired and recent files',async t=>{
  const {dir,file,store,service}=fixture(t),root=path.join(dir,'uploads');fs.mkdirSync(root);
  const names=['current.txt','retired.txt','abandoned.txt','recent.txt'];
  for(const name of names){fs.writeFileSync(path.join(root,name),'fixture');if(name!=='recent.txt')fs.utimesSync(path.join(root,name),new Date('2020-01-01'),new Date('2020-01-01'));}
  let {item}=await service.create(base,names.slice(0,2).map(filename=>({name:filename,filename,size:7})),owner,randomUUID());
  item=(await service.update(item.id,{version:0,removeFiles:['retired.txt']},[],owner,randomUUID())).item;
  await service.remove(item.id,{version:1,changeReason:'preserve attachments'},owner,randomUUID());
  const {collectOrphans}=require('./as-storage-maintenance');
  const dry=await collectOrphans(store,root);assert.deepEqual(dry.files,['abandoned.txt']);assert.equal(dry.applied,false);assert.equal(fs.readdirSync(root).length,4);
  await collectOrphans(store,root,{apply:true});assert.deepEqual(fs.readdirSync(root).sort(),['current.txt','recent.txt','retired.txt']);
  fs.writeFileSync(file,'corrupt');await denied(()=>collectOrphans(store,root,{apply:true}),503);assert.equal(fs.readdirSync(root).length,3);
});
test('all active staff can manage attachments, history, deletion and restore while preserving actor identity',async t=>{
  const {service}=fixture(t),file={name:'fixture.txt',filename:randomUUID()+'.txt',size:3,sha256:'test'};
  let {item}=await service.create(base,[file],owner,randomUUID());
  item=(await service.update(item.id,{version:0,removeFiles:JSON.stringify([file.filename]),amount:'12'},[],other,randomUUID())).item;
  assert.equal(item.files.length,0);assert.equal(item.retiredFiles[0].filename,file.filename);assert.equal(item.version,1);
  assert.equal(item.createdById,owner.id);assert.equal(item.retiredFiles[0].removedById,other.id);
  await denied(()=>service.remove(item.id,{version:1,changeReason:''},other,randomUUID()),400);
  const key=randomUUID();item=(await service.remove(item.id,{version:1,changeReason:'fixture removed'},other,key)).item;
  assert.equal((await service.list()).length,0);assert.equal((await service.trash(owner)).length,1);assert.equal((await service.trash(other)).length,1);
  assert((await service.remove(item.id,{version:1,changeReason:'fixture removed'},other,key)).replayed);
  assert.equal((await service.history(item.id,other)).length,3);
  await denied(()=>service.restore(item.id,{version:2,changeReason:''},other,randomUUID()),400);
  item=(await service.restore(item.id,{version:2,changeReason:'restore fixture'},other,randomUUID())).item;
  const history=await service.history(item.id,owner);assert.deepEqual(history.map(e=>e.type),['create','update','delete','restore']);
  assert.equal(history[1].before.amount,null);assert.equal(history[1].after.amount,12);assert.equal(history.at(-1).actorId,other.id);assert.equal(item.version,3);
});

test('shared AS access still rejects absent, inactive, reset-required and invalid staff actors',async t=>{
 const {service}=fixture(t);const {item}=await service.create(base,[],owner,randomUUID());
 for(const actor of [null,{...other,id:''},{...other,active:false},{...other,passwordResetRequired:true},{...other,role:'guest'}]){
  await denied(()=>service.update(item.id,{version:0,remark:'must not save'},[],actor,randomUUID()),401);
  await denied(()=>service.create(base,[],actor,randomUUID()),401);
  await denied(()=>service.history(item.id,actor),401);
  assert.deepEqual(await service.trash(actor),[]);
 }
 assert.equal((await service.list())[0].version,0);
});
test('completed records require correction reasons and workflow audit uses stable actor IDs',async t=>{
  const {service}=fixture(t);let {item}=await service.create(base,[],owner,randomUUID());
  for(const next of ['제작 요청','도장 요청','납품 요청','완료'])item=(await service.advance(item.id,{version:item.version,action:'advance',next,completedDate:'2020-01-01'},[],owner,randomUUID())).item;
  await denied(()=>service.update(item.id,{version:item.version,amount:'5'},[],owner,randomUUID()),400);
  item=(await service.update(item.id,{version:item.version,amount:'5',changeReason:'correct amount'},[],owner,randomUUID())).item;
  assert.equal(item.status,'완료');assert.equal(item.completedUserId,owner.id);assert(item.workflow.history.every(e=>e.byUserId===owner.id));
  assert.equal((await service.history(item.id,owner)).at(-1).reason,'correct amount');
});
test('atomic replacement failure preserves the previous generation and corrupt/missing stores fail closed',async t=>{
  const {file,service}=fixture(t);await service.create(base,[],owner,randomUUID());const before=fs.readFileSync(file,'utf8');
  const io={...fs,renameSync(source,dest){if(dest===file)throw Object.assign(new Error('fixture disk failure'),{code:'EIO'});fs.renameSync(source,dest);}};
  await assert.rejects(createAsService(createAsStore(file,{io})).create(base,[],owner,randomUUID()),/fixture disk failure/);
  assert.equal(fs.readFileSync(file,'utf8'),before);assert.equal(fs.readFileSync(file+'.bak','utf8'),before);
  fs.writeFileSync(file,'{invalid');await denied(()=>service.list(),503);assert.equal(fs.readFileSync(file,'utf8'),'{invalid');
  fs.unlinkSync(file);await denied(()=>service.list(),503);assert(!fs.existsSync(file));
});
test('duplicate legacy IDs/numbers and abandoned locks block writes without silent repair',async t=>{
  const {file,dir}=fixture(t);const row={id:'same',asNo:'AS-2610-01'};fs.writeFileSync(file,JSON.stringify({list:[row,{...row}]}));
  await denied(()=>createAsService(createAsStore(file)).create(base,[],owner,randomUUID()),503);
  assert.equal(JSON.parse(fs.readFileSync(file,'utf8')).list.length,2);
  fs.writeFileSync(file+'.lock','fixture abandoned lock');
  await denied(()=>createAsStore(file,{timeout:30}).read(()=>null),503);assert(fs.existsSync(path.join(dir,'as.json.lock')));
});
test('separate Node processes serialize monthly numbering and preserve every receipt',async t=>{
  const {file}=fixture(t);
  const script=`const {createAsService}=require(${JSON.stringify(require.resolve('./as-service'))});const {createAsStore}=require(${JSON.stringify(require.resolve('./as-store'))});const s=createAsService(createAsStore(process.argv[1]));(async()=>{for(let i=0;i<8;i++)await s.create({ship:'TEST',block:'B',reason:'fixture'},[],{id:'worker',name:'Fixture',role:'worker'},require('crypto').randomUUID());})().catch(e=>{console.error(e);process.exitCode=1});`;
  await Promise.all(Array.from({length:3},()=>new Promise((resolve,reject)=>{const child=spawn(process.execPath,['-e',script,file],{stdio:['ignore','ignore','pipe']});let stderr='';child.stderr.on('data',chunk=>stderr+=chunk);child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(Error(stderr)));})));
  const data=JSON.parse(fs.readFileSync(file,'utf8'));assert.equal(data.list.length,24);assert.equal(new Set(data.list.map(r=>r.asNo)).size,24);assert.equal(new Set(data.list.map(r=>r.id)).size,24);assert.equal(data.events.length,24);
});
test('real AS HTTP routes enforce auth, idempotency, uploads, versions and private downloads',async t=>{
  const express=require('express'),{installAsApi}=require('./as-api');const {dir,service}=fixture(t),uploadsDir=path.join(dir,'uploads');
  const app=express();app.use(express.json());
  installAsApi(app,{service,uploadsDir,authenticate(req,res,next){const who=req.get('X-Test-Actor');if(!who)return res.sendStatus(401);req.user=who==='owner'?owner:other;next();}});
  const server=await new Promise(resolve=>{const running=app.listen(0,'127.0.0.1',()=>resolve(running));});t.after(()=>new Promise(resolve=>server.close(resolve)));
  const url='http://127.0.0.1:'+server.address().port;
  const request=(route,{method='GET',body,key=randomUUID(),who='owner'}={})=>fetch(url+route,{method,headers:{'X-Test-Actor':who,'X-Requested-With':'process-server','Idempotency-Key':key,...(body instanceof FormData?{}:{'Content-Type':'application/json'})},body:body instanceof FormData?body:body?JSON.stringify(body):undefined});
  assert.equal((await fetch(url+'/api/as')).status,401);
  assert.equal((await fetch(url+'/api/as',{method:'POST',headers:{'X-Test-Actor':'owner'}})).status,403);
  function form(amount='0'){const data=new FormData();for(const [k,v] of Object.entries(base))data.append(k,v);data.append('amount',amount);data.append('files',new Blob(['fixture text']),'fixture.txt');return data;}
  assert.equal((await request('/api/as',{method:'POST',body:form('-1')})).status,400);assert.deepEqual(fs.readdirSync(uploadsDir),[]);
  const bad=form();bad.append('files',new Blob(['not a PNG']),'fake.png');assert.equal((await request('/api/as',{method:'POST',body:bad})).status,400);assert.deepEqual(fs.readdirSync(uploadsDir),[]);
  const key=randomUUID(),first=await request('/api/as',{method:'POST',body:form(),key});assert.equal(first.status,200);let {item}=await first.json();
  const retry=await request('/api/as',{method:'POST',body:form(),key});assert.equal(retry.status,200);assert((await retry.json()).replayed);assert.equal(fs.readdirSync(uploadsDir).length,1);
  const recorded=(await (await request('/api/as/requests/'+key)).json()).request;assert.equal(recorded.recordId,item.id);
  assert.equal((await (await request('/api/as/requests/'+key,{who:'other'})).json()).request,null);
  assert.equal((await fetch(url+'/uploads/'+item.files[0].filename)).status,401);
  const download=await request('/uploads/'+item.files[0].filename);assert.equal(download.status,200);assert.match(download.headers.get('content-disposition'),/attachment/);
  assert.equal((await request('/api/as/'+item.id,{method:'PUT',body:{remark:'missing version'}})).status,428);
  const updateKey=randomUUID(),updated=await request('/api/as/'+item.id,{method:'PUT',who:'other',key:updateKey,body:{version:0,remark:'updated'}});assert.equal(updated.status,200);item=(await updated.json()).item;
  assert.equal(item.updatedById,other.id);assert.equal(item.createdById,owner.id);
  assert.equal((await request('/api/as/'+item.id,{method:'DELETE',who:'other',body:{version:item.version,changeReason:'test'}})).status,200);
  assert.equal((await request('/uploads/'+item.files[0].filename)).status,404);assert.equal(fs.readdirSync(uploadsDir).length,1);
  const lateRetry=await request('/api/as/'+item.id,{method:'PUT',who:'other',key:updateKey,body:{version:0,remark:'updated'}});assert.equal(lateRetry.status,200);assert((await lateRetry.json()).replayed);
  assert.equal((await (await request('/api/as')).json()).list.length,0);
  assert.equal((await (await request('/api/as/trash',{who:'other'})).json()).list.length,1);
  assert.equal((await request('/api/as/'+item.id+'/restore',{method:'POST',who:'other',body:{version:2,changeReason:'restore test'}})).status,200);
  assert.equal((await (await request('/api/as/'+item.id+'/history',{who:'other'})).json()).events.at(-1).actorId,other.id);
});
