'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawn, spawnSync} = require('node:child_process');
const {once} = require('node:events');
const {hashPassword, verifyPassword, migratePasswords} = require('./passwords');
const {randomUUID}=require('node:crypto');
const password = 'Test-only-passphrase-2026!';

test('password hashing uses independent salts and migration is idempotent', async () => {
  const a = hashPassword(password), b = hashPassword(password);
  assert.notEqual(a,b);
  assert(await verifyPassword(password,a));
  assert.equal(await verifyPassword('incorrect',a),false);
  assert.equal(await verifyPassword(password,'scrypt$1$1$1$bad$bad'),false);
  const data={users:[{password:'1234'},{password:'legacy-nondefault'},{passwordHash:a,password:'stale'}]};
  assert(migratePasswords(data));
  assert.equal(data.users[0].passwordResetRequired,true);
  assert(await verifyPassword('legacy-nondefault',data.users[1].passwordHash));
  assert.equal(data.users[2].passwordHash,a);
  assert.equal(migratePasswords(data),false);
  assert(data.users.every(u=>!Object.hasOwn(u,'password')));
});

test('real HTTP authorization, web/mobile login, migration and business workflows', async t => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'process-auth-'));
  const write=(name,data)=>fs.writeFileSync(path.join(dir,name),JSON.stringify(data));
  write('data.json',{records:[],users:[
    {id:'root',name:'관리자',role:'sysadmin',password},
    {id:'disabled-admin',name:'Inactive fixture',role:'sysadmin',active:false,password},
    {id:'worker',name:'직원',role:'worker',password,allowedSteps:['incoming']},
    {id:'other',name:'다른 직원',role:'worker',password,allowedSteps:[]},
    {id:'manager',name:'업무 관리자',role:'admin',password},
    {id:'default',name:'전환 대상',role:'worker',password:'1234'},
  ]});
  const child=spawn(process.execPath,['server.js'],{cwd:__dirname,env:{...process.env,PROCESS_DATA_DIR:dir,PORT:'0',HOST:'127.0.0.1'},stdio:['ignore','pipe','pipe']});
  t.after(async()=>{child.kill();if(child.exitCode===null)await once(child,'exit');fs.rmSync(dir,{recursive:true,force:true});});
  const base=await new Promise((resolve,reject)=>{
    let output='';const timer=setTimeout(()=>reject(Error('Server startup timed out')),30000);
    child.stdout.on('data',chunk=>{output+=chunk;const m=output.match(/http:\/\/localhost:(\d+)/);if(m){clearTimeout(timer);resolve('http://127.0.0.1:'+m[1]);}});
    child.once('exit',code=>{clearTimeout(timer);reject(Error('Server exited '+code));});
  });
  const request=(route,{method='GET',token,cookie,body,headers={}}={})=>fetch(base+route,{method,headers:{'Idempotency-Key':randomUUID(),'X-Requested-With':'process-server',...(token?{Authorization:'Bearer '+token}:{}),...(cookie?{Cookie:cookie}:{}),...(body?{'Content-Type':'application/json'}:{}),...headers},...(body?{body:JSON.stringify(body)}:{})});
  const login=async(id,mobile=true)=>{
    const r=await request('/api/login',{method:'POST',body:{id,password},headers:mobile?{'X-Client-Type':'mobile'}:{}});
    assert.equal(r.status,200);return {response:r,...await r.json()};
  };
  await t.test('all registered business routes reject anonymous callers, including case variants',async()=>{
    const source=['server.js','as-api.js'].map(name=>fs.readFileSync(path.join(__dirname,name),'utf8')).join('\n');
    const routes=new Set([...source.matchAll(/app\.(get|post|put|patch|delete)\('(\/api\/[^']+)'/g)].map(m=>m[1].toUpperCase()+' '+m[2]));
    for(const route of routes){
      const [method,raw]=route.split(' ');if(raw==='/api/login')continue;
      const url=raw.replace(/:[^/]+/g,'fixture');
      const response=await request(url,{method});
      assert.equal(response.status,401,route);
    }
    assert.equal((await request('/API/UsErS/')).status,401);
    assert.equal((await request('/uploads/example.txt')).status,401);
    assert.equal((await request('/data.json')).status,404);
  });
  const admin=await login('root'), worker=await login('worker'), other=await login('other'), manager=await login('manager');
  await t.test('web cookies, CSRF and identity responses',async()=>{
    const web=await login('worker',false);
    assert.equal(web.token,undefined);
    const cookie=web.response.headers.get('set-cookie');
    assert.match(cookie,/HttpOnly/);assert.match(cookie,/SameSite=Strict/);
    assert.equal((await request('/api/me',{cookie:cookie.split(';')[0]})).status,200);
    const denied=await fetch(base+'/api/as',{method:'POST',headers:{Cookie:cookie.split(';')[0],'Content-Type':'application/json'},body:'{"records":[]}'});
    assert.equal(denied.status,403);
    const me=await (await request('/api/me',{token:worker.token})).json();
    assert.equal(me.user.password,undefined);assert.equal(me.user.passwordHash,undefined);
    const cors=await fetch(base+'/api/login',{method:'OPTIONS',headers:{Origin:'https://evil.example','Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'X-Requested-With'}});
    assert.equal(cors.headers.get('access-control-allow-origin'),null);
    assert.equal((await request('/api/login',{method:'POST',body:{id:'default',password:'1234'}})).status,401);
    assert.equal((await request('/api/login',{method:'POST',body:{id:{bad:true},password}})).status,400);
    const disk=JSON.parse(fs.readFileSync(path.join(dir,'data.json'),'utf8'));
    assert(disk.users.every(u=>!Object.hasOwn(u,'password')));
    assert.equal(disk.users.find(u=>u.id==='default').passwordResetRequired,true);
  });
  await t.test('staff and business admins cannot manage users and retired endpoints stay unavailable',async()=>{
    for(const token of [worker.token,manager.token]){
      for(const method of ['GET','POST','PUT','DELETE']){
        const route=method==='PUT'||method==='DELETE'?'/api/users/root':'/api/users';
        assert.equal((await request(route,{method,token,body:method==='POST'||method==='PUT'?{id:'evil',role:'sysadmin',password}:undefined})).status,403);
      }
      assert.equal((await request('/api/erp/all',{method:'DELETE',token})).status,404);
    }
    assert.equal((await request('/api/master/all',{method:'DELETE',token:worker.token})).status,404);
    assert.equal((await request('/api/erp/upload',{method:'POST',token:worker.token})).status,404);
    assert.equal((await request('/api/erp/columns/name',{method:'DELETE',token:worker.token})).status,404);
    assert.equal((await request('/api/users',{token:admin.token})).status,200);
    assert.equal((await request('/api/erp/all',{method:'DELETE',token:admin.token})).status,404);
  });
  let item;
  await t.test('AS attachments, ownership and workflow remain usable',async()=>{
    const fd=new FormData();for(const [key,value] of Object.entries({ship:'TEST',block:'TEST',reason:'테스트',createdBy:'관리자'}))fd.append(key,value);
    fd.append('files',new Blob(['fixture attachment'],{type:'text/plain'}),'fixture.txt');
    const created=await fetch(base+'/api/as',{method:'POST',headers:{'Idempotency-Key':randomUUID(),Authorization:'Bearer '+worker.token,'X-Requested-With':'process-server'},body:fd});
    assert.equal(created.status,200);item=(await created.json()).item;
    assert.equal(item.createdById,'worker');assert.equal(item.createdBy,'직원');
    const route='/uploads/'+item.files[0].filename;
    assert.equal((await request(route)).status,401);
    const attachment=await request(route,{token:worker.token});assert.equal(attachment.status,200);assert.equal(await attachment.text(),'fixture attachment');
    assert.equal((await request('/uploads/unreferenced.txt',{token:worker.token})).status,404);
    for(const method of ['PUT','DELETE'])assert.equal((await request('/api/as/'+item.id,{method,token:other.token,body:method==='PUT'?{remark:'tamper'}:undefined})).status,403);
    const payload={version:0,revision:0,action:'advance',next:'제작 요청',deliveryAgreedDate:'2026-12-31'};
    assert.equal((await request('/api/as/'+item.id+'/workflow',{method:'PATCH',token:other.token,body:{...payload,actorId:'root'}})).status,403);
    assert.equal((await request('/api/as/'+item.id+'/workflow',{method:'PATCH',token:worker.token,body:payload})).status,200);
    assert.equal((await request('/api/as/'+item.id,{method:'PUT',token:worker.token,body:{version:1,remark:'updated'}})).status,200);
  });
  await t.test('account creation, password reset, role changes and deletion revoke access',async()=>{
    assert.equal((await request('/api/users',{method:'POST',token:admin.token,body:{id:'new',name:'신규',password:'1234'}})).status,400);
    assert.equal((await request('/api/users',{method:'POST',token:admin.token,body:{id:'new',name:'신규',password,role:'worker'}})).status,200);
    const fresh=await login('new');
    assert.equal((await request('/api/users/new',{method:'PUT',token:admin.token,body:{role:'admin'}})).status,200);
    assert.equal((await request('/api/me',{token:fresh.token})).status,401);
    const elevated=await login('new');
    assert.equal((await request('/api/users/new',{method:'PUT',token:admin.token,body:{password:password+'new'}})).status,200);
    assert.equal((await request('/api/me',{token:elevated.token})).status,401);
    assert.equal((await request('/api/users/new',{method:'DELETE',token:admin.token})).status,200);
    assert.equal((await request('/api/users/default',{method:'PUT',token:admin.token,body:{password}})).status,200);
    assert((await login('default')).token);
    assert.equal((await request('/api/users/root',{method:'PUT',token:admin.token,body:{role:'worker'}})).status,400);
    assert.equal((await request('/api/users/root',{method:'DELETE',token:admin.token})).status,400);
    assert.equal((await request('/api/logout',{method:'POST',token:worker.token})).status,200);
    assert.equal((await request('/api/me',{token:worker.token})).status,401);
    assert.equal((await request('/uploads/'+item.files[0].filename,{token:worker.token})).status,401);
  });
  await t.test('login throttling bounds repeated failures',async()=>{
    let status;
    for(let i=0;i<22;i++){status=(await request('/api/login',{method:'POST',body:{id:'missing',password:'bad'}})).status;if(status===429)break;}
    assert.equal(status,429);
  });
});

test('offline bootstrap and recovery do not create a fixed default credential',async t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'process-reset-'));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const env={...process.env,PROCESS_DATA_DIR:dir,PROCESS_ACCOUNT_PASSWORD:password};
  const run=args=>spawnSync(process.execPath,['reset-account.cjs',...args],{cwd:__dirname,env,encoding:'utf8'});
  const first=run(['operator','--bootstrap']);assert.equal(first.status,0);assert(!first.stdout.includes(password));
  assert.equal(run(['second','--bootstrap']).status,1);
  env.PROCESS_ACCOUNT_PASSWORD=password+'changed';
  assert.equal(run(['operator']).status,0);
  const data=JSON.parse(fs.readFileSync(path.join(dir,'data.json'),'utf8'));
  assert.equal(data.users.length,1);assert.equal(data.users[0].role,'sysadmin');
  assert(await verifyPassword(env.PROCESS_ACCOUNT_PASSWORD,data.users[0].passwordHash));
});
