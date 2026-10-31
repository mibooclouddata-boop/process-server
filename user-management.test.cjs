'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const {startFixture}=require('./test-support/as-fixture.cjs');
const source=fs.readFileSync(require('node:path').join(__dirname,'user-admin-ui.js'),'utf8');
function setup(){
 const elements=new Map(),get=id=>{if(!elements.has(id))elements.set(id,{value:'',textContent:'',className:'',classList:{toggle(){}},setAttribute(){}});return elements.get(id);};
 const redirects=[],ctx={document:{getElementById:get},currentUser:{id:'root'},location:{replace:url=>redirects.push(url)},console};vm.createContext(ctx);vm.runInContext(source,ctx);
 vm.runInContext('paintUserModal=()=>{};renderAdminUsers=()=>{};',ctx);
 const run=s=>vm.runInContext(s,ctx);return {ctx,get,run,redirects};
}
test('provider identities and account status preserve the main contract',()=>{
 const {ctx}=setup();assert.equal(ctx.userLoginId({id:'uuid',loginId:'EMP-1'}),'EMP-1');
 assert.equal(ctx.normalizeAdminUser({active:false}).status,'suspended');assert.equal(ctx.normalizeAdminUser({passwordResetRequired:true}).status,'invited');
});

test('retired AS permission fields are not exposed or accepted by the local user API',async t=>{
 const f=await startFixture();t.after(()=>f.close());const password='Fixture-passphrase-2026!';
 const request=(url,method='GET',body,cookie='')=>fetch(f.url+url,{method,headers:{cookie,'X-Requested-With':'process-server','Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
 const login=await request('/api/login','POST',{id:'admin',password});const cookie=login.headers.get('set-cookie').split(';')[0];
 const profile=(await login.json()).user;const me=(await (await request('/api/me','GET',null,cookie)).json()).user;
 const users=(await (await request('/api/users','GET',null,cookie)).json()).users;
 for(const user of [profile,me,...users])for(const key of ['asReview','asApprove'])assert.equal(Object.hasOwn(user,key),false);
 for(const key of ['asReview','asApprove']){
  assert.equal((await request('/api/users','POST',{id:'retired',name:'Fixture',password,[key]:true},cookie)).status,400);
  assert.equal((await request('/api/users/admin','PUT',{[key]:true},cookie)).status,400);
 }
 assert.equal(f.read('data.json').users.length,1);
});
test('autosave serializes rapid edits, sends only supported fields and reloads server values',async()=>{
 const {ctx,run}=setup();run("userAdmin.editing={id:'worker',name:'Old'}");let release;const calls=[];let saved={id:'worker',name:'Old'};
 ctx.userApi=async(url,options)=>{if(options){const patch=JSON.parse(options.body);calls.push(patch);if(calls.length===1)await new Promise(r=>release=r);saved={...saved,...patch};return {success:true};}return {users:[saved]};};
 const pending=ctx.queueUserChange({name:'First'});ctx.queueUserChange({department:'품질'});release();assert.equal(await pending,true);
 assert.deepEqual(calls,[{name:'First'},{department:'품질'}]);assert.equal(run('userAdmin.editing.department'),'품질');assert.equal(run('userAdmin.saving'),null);
});
test('failed autosave retains the edit and blocks further writes until reload',async()=>{
 const {ctx,run,get}=setup();run("userAdmin.editing={id:'worker',name:'Old'}");let calls=0;ctx.userApi=async()=>{calls++;throw Error('fixture unavailable');};
 assert.equal(await ctx.queueUserChange({name:'New'}),false);assert.equal(run('userAdmin.failed'),true);assert.equal(run('userAdmin.pending.name'),'New');
 await ctx.queueUserChange({department:'Other'});assert.equal(calls,1);assert.match(get('modalMsg').textContent,/fixture unavailable/);
});
test('self edits redirect after successful save without a revoked-session follow-up request',async()=>{
 const {ctx,run,redirects}=setup();run("userAdmin.editing={id:'root',name:'Root'}");const calls=[];ctx.userApi=async(url,options)=>{calls.push({url,options});return {success:true};};
 await ctx.queueUserChange({name:'Changed'});assert.equal(calls.length,1);assert.deepEqual(redirects,['/login.html']);
});
test('stale list responses cannot replace the latest list',async()=>{
 const {ctx,run}=setup();ctx.setupUserList=()=>{};let release;ctx.userApi=()=>new Promise(r=>release=r);const first=ctx.loadAdminUsers();ctx.userApi=async()=>({users:[{id:'new'}]});await ctx.loadAdminUsers();release({users:[{id:'old'}]});await first;assert.equal(run('userAdmin.users[0].id'),'new');
});
test('bulk edits process self last and report partial failure accurately',async()=>{
 for(const fail of [false,true]){
  const {ctx,run,redirects}=setup(),calls=[],messages=[];let refreshed=0;
  ctx.prompt=()=> '품질';ctx.showToast=x=>messages.push(x);ctx.loadAdminUsers=async()=>{refreshed++;};
  run("userAdmin.users=[{id:'root'},{id:'worker'}];userAdmin.selected=new Set(['root','worker'])");
  ctx.userApi=async url=>{calls.push(url);if(fail&&url.endsWith('/root'))throw Error('fixture failure');return {success:true};};
  await ctx.bulkUserDepartment();assert.deepEqual(calls,['/api/users/worker','/api/users/root']);
  if(fail){assert.equal(refreshed,1);assert.match(messages[0].message,/1명 반영 후 중단/);assert.equal(redirects.length,0);}else{assert.equal(refreshed,0);assert.deepEqual(redirects,['/login.html']);}
 }
});
test('local account activation validates state, protects last admin and revokes sessions without changing AS data',async t=>{
 const f=await startFixture();t.after(()=>f.close());let cookie='';
 const req=(url,method='GET',data,auth=cookie)=>fetch(f.url+url,{method,headers:{cookie:auth,'X-Requested-With':'process-server','Content-Type':'application/json'},...(data?{body:JSON.stringify(data)}:{})});
 const login=async id=>{const r=await req('/api/login','POST',{id,password:'Fixture-passphrase-2026!'},'');assert.equal(r.status,200);return r.headers.get('set-cookie').split(';')[0];};
 cookie=await login('admin');const before=JSON.stringify(f.read('as.json'));
 assert.equal((await req('/api/users','POST',{id:'worker',name:'Fixture worker',password:'Fixture-passphrase-2026!',role:'worker'})).status,200);
 const worker=await login('worker');assert.equal((await req('/api/users/worker','PUT',{active:false},worker)).status,403);
 assert.equal((await req('/api/users/worker','PUT',{active:'false'})).status,400);
 assert.equal((await req('/api/users/worker','PUT',{name:'  '})).status,400);
 assert.equal((await req('/api/users/admin','PUT',{active:false})).status,400);
 assert.equal((await req('/api/users/worker','PUT',{active:false})).status,200);
 assert.equal((await req('/api/me','GET',null,worker)).status,401);
 assert.equal((await req('/api/as','GET',null,worker)).status,401);
 assert.equal((await req('/api/as','POST',{ship:'TEST',block:'B',reason:'must not save'},worker)).status,401);
 assert.equal((await req('/api/login','POST',{id:'worker',password:'Fixture-passphrase-2026!'})).status,401);
 assert.equal((await req('/api/users/worker','PUT',{active:true})).status,200);await login('worker');
 assert.equal((await req('/user-admin-ui.js')).status,200);assert.equal(JSON.stringify(f.read('as.json')),before);
 assert.deepEqual(f.read('data.json').users[0].allowedSteps,['incoming']);
});

test('new local accounts preserve explicit inactive state and default to active only when omitted',async t=>{
 const f=await startFixture();t.after(()=>f.close());
 const request=(url,data,cookie='')=>fetch(f.url+url,{method:'POST',headers:{cookie,'X-Requested-With':'process-server','Content-Type':'application/json'},body:JSON.stringify(data)});
 const password='Fixture-passphrase-2026!';
 const root=await request('/api/login',{id:'admin',password});assert.equal(root.status,200);const cookie=root.headers.get('set-cookie').split(';')[0];
 for(const [id,input,active] of [['inactive',{active:false},false],['active',{active:true},true],['default',{},true]]){
  assert.equal((await request('/api/users',{id,name:id,password,role:'worker',...input},cookie)).status,200);
  assert.equal(f.read('data.json').users.find(u=>u.id===id).active,active);
  const login=await request('/api/login',{id,password});assert.equal(login.status,active?200:401);
  if(active)assert.equal((await fetch(f.url+'/api/me',{headers:{cookie:login.headers.get('set-cookie').split(';')[0]}})).status,200);
 }
});
