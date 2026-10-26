'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const vm = require('node:vm');
const {spawn} = require('node:child_process');
const {once} = require('node:events');
const {randomUUID, randomBytes} = require('node:crypto');
const {configuration} = require('./supabase-auth');

test('Supabase configuration fails closed without secrets or secure production transport',()=>{
  assert.throws(()=>configuration({}));
  const c={SUPABASE_URL:'https://example.supabase.co',SUPABASE_PUBLISHABLE_KEY:'test-public',SUPABASE_SECRET_KEY:'test-secret',SESSION_ENCRYPTION_KEY:'ab'.repeat(32)};
  assert.throws(()=>configuration({...c,SUPABASE_URL:'http://untrusted.example'}));
  assert.throws(()=>configuration({...c,NODE_ENV:'production'}));
  assert.throws(()=>configuration({...c,NODE_ENV:'production',SESSION_COOKIE_SECURE:'true',SUPABASE_URL:'http://127.0.0.1:54321'}));
  assert.equal(configuration({...c,NODE_ENV:'production',SESSION_COOKIE_SECURE:'true'}).url,c.SUPABASE_URL);
});

test('official SDK → local Supabase HTTP double → real Express server', async t=>{
  // Entirely synthetic identities. No project credentials or production data are loaded.
  const publicKey='test-public-key', secretKey='test-server-secret', password='Test-only-password-2026!';
  const profiles=new Map(), tokens=new Map(), sessions=new Map(), attempts=new Map();
  let authUnavailable=false, authCalls=0, verifyCalls=0;
  const add=(login,role,extra={})=>{
    const p={id:randomUUID(),auth_user_id:randomUUID(),login_id:login,name:'동명이인',role,active:true,session_version:1,
      allowed_steps:[],as_review:false,as_approve:false,department:'테스트',position:'',icon:'',...extra};
    profiles.set(login,p);return p;
  };
  const worker=add('staff01','worker',{allowed_steps:['incoming']}), other=add('staff02','worker');
  const root=add('root','sysadmin'), manager=add('manager','admin'), reviewer=add('reviewer','worker',{as_review:true});
  add('inactive','worker',{active:false});
  const attachmentId=randomUUID(),attachmentPath=randomUUID()+'/'+attachmentId;
  const email=p=>p.auth_user_id+'@staff.invalid';
  const fake=http.createServer(async(req,res)=>{
    const url=new URL(req.url,'http://localhost');let body='';for await(const chunk of req)body+=chunk;
    const input=body?JSON.parse(body):{};
    const send=(value,status=200)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(value));};
    const bearer=req.headers.authorization?.replace(/^Bearer /,'');
    if(url.pathname==='/auth/v1/token'){
      authCalls++;assert.equal(req.headers.apikey,publicKey);
      if(authUnavailable)return send({message:'private upstream detail'},503);
      const p=[...profiles.values()].find(p=>email(p)===input.email);
      if(!p||input.password!==password)return send({message:'Invalid login credentials',error_code:'invalid_credentials'},400);
      const jwt=[{alg:'HS256',typ:'JWT'},{sub:p.auth_user_id,exp:Math.floor(Date.now()/1000)+3600,email:email(p)},'signature']
        .map(x=>Buffer.from(typeof x==='string'?x:JSON.stringify(x)).toString('base64url')).join('.');
      tokens.set(jwt,p.auth_user_id);
      return send({access_token:jwt,refresh_token:'test-refresh-never-return',token_type:'bearer',expires_in:3600,user:{id:p.auth_user_id,email:email(p)}});
    }
    if(url.pathname==='/auth/v1/user'){
      verifyCalls++;if(authUnavailable)return send({message:'private upstream detail'},503);
      const id=tokens.get(bearer);return id?send({id}):send({message:'invalid JWT'},401);
    }
    if(url.pathname==='/rest/v1/rpc/server_resolve_staff_login'){
      assert.equal(req.headers.apikey,secretKey);
      const p=profiles.get(input.input_login);return send(p?[{staff_id:p.id,auth_user_id:p.auth_user_id,internal_email:email(p)}]:[]);
    }
    if(url.pathname==='/rest/v1/rpc/server_take_login_attempt'){
      assert.equal(req.headers.apikey,secretKey);assert.match(input.input_key,/^[a-f0-9]{64}$/);
      const count=(attempts.get(input.input_key)||0)+1;attempts.set(input.input_key,count);return send(count<=20);
    }
    if(url.pathname==='/rest/v1/staff_profiles'){
      if(req.headers.apikey===secretKey)return send([...profiles.values()]);
      assert.equal(req.headers.apikey,publicKey);
      const id=tokens.get(bearer),p=[...profiles.values()].find(p=>p.auth_user_id===id&&p.active);
      return send(p?[p]:[]);
    }
    if(url.pathname==='/rest/v1/app_sessions'){
      assert.equal(req.headers.apikey,secretKey);
      const key=url.searchParams.get('token_hash')?.slice(3);
      if(req.method==='POST'){sessions.set(input.token_hash,input);return send(null,201);}
      if(req.method==='DELETE'){sessions.delete(key);return send(null);}
      return send(sessions.has(key)?[sessions.get(key)]:[]);
    }
    if(url.pathname==='/rest/v1/as_attachments'){
      assert.equal(req.headers.apikey,publicKey);assert(tokens.has(bearer));
      return send(url.searchParams.get('id')==='eq.'+attachmentId?[{id:attachmentId,storage_path:attachmentPath,original_name:'비공개 문서.txt'}]:[]);
    }
    if(url.pathname==='/storage/v1/object/as-attachments/'+attachmentPath){
      assert.equal(req.headers.apikey,publicKey);assert(tokens.has(bearer));
      res.writeHead(200,{'Content-Type':'text/plain'});return res.end('private fixture');
    }
    send({message:'unknown test endpoint'},404);
  });
  await new Promise(resolve=>fake.listen(0,'127.0.0.1',resolve));
  t.after(()=>{fake.closeAllConnections();fake.close();});
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'process-supabase-'));
  const legacyFixture={records:[],users:[{id:'legacy-only',password:'test-legacy-unchanged'}]};
  fs.writeFileSync(path.join(dir,'data.json'),JSON.stringify(legacyFixture));
  const child=spawn(process.execPath,['server.js'],{cwd:__dirname,env:{...process.env,NODE_ENV:'test',
    AUTH_PROVIDER:'supabase',PROCESS_DATA_DIR:dir,PORT:'0',HOST:'127.0.0.1',CORS_ORIGINS:'',SESSION_COOKIE_SECURE:'false',
    SUPABASE_URL:'http://127.0.0.1:'+fake.address().port,SUPABASE_PUBLISHABLE_KEY:publicKey,SUPABASE_SECRET_KEY:secretKey,
    SESSION_ENCRYPTION_KEY:randomBytes(32).toString('hex')},stdio:['ignore','pipe','pipe']});
  let logs='';child.stderr.on('data',chunk=>{logs+=chunk;});
  t.after(async()=>{
    child.kill();if(child.exitCode===null)await once(child,'exit');
    assert(path.resolve(dir).startsWith(path.resolve(os.tmpdir())+path.sep));fs.rmSync(dir,{recursive:true,force:true});
  });
  const base=await new Promise((resolve,reject)=>{
    let out='';const timer=setTimeout(()=>reject(Error('Test server startup timed out')),15000);
    child.stdout.on('data',chunk=>{out+=chunk;const m=out.match(/http:\/\/localhost:(\d+)/);if(m){clearTimeout(timer);resolve('http://127.0.0.1:'+m[1]);}});
    child.once('exit',()=>{clearTimeout(timer);reject(Error('Test server stopped'));});
  });
  const request=(route,{method='GET',token,cookie,body,headers={}}={})=>fetch(base+route,{method,
    headers:{'X-Requested-With':'process-server',...(token?{Authorization:'Bearer '+token}:{}),...(cookie?{Cookie:cookie}:{}),
      ...(body?{'Content-Type':'application/json'}:{}),...headers},...(body?{body:JSON.stringify(body)}:{})});
  const login=async(id,mobile=true)=>{
    const r=await request('/api/login',{method:'POST',body:{id,password},headers:mobile?{'X-Client-Type':'mobile'}:{}});
    assert.equal(r.status,200);const body=await r.json();return {...body,cookie:r.headers.get('set-cookie')};
  };
  let w,o,r,m,review;
  await t.test('anonymous, forged identity, missing CSRF and public secret paths are blocked',async()=>{
    for(const route of ['/api/me','/api/users','/api/as','/API/UsErS/','/uploads/no-file'])assert.equal((await request(route)).status,401,route);
    assert.equal((await request('/api/me',{token:'a'.repeat(64),headers:{'X-User-Id':root.id}})).status,401);
    assert.equal((await fetch(base+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,403);
    for(const route of ['/.env.local','/supabase-auth.js','/data.json','/supabase/migrations/202610260001_auth_foundation.sql'])assert.equal((await request(route)).status,404);
    const preflight=await fetch(base+'/api/login',{method:'OPTIONS',headers:{Origin:'https://evil.example','Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'X-Requested-With'}});
    assert.equal(preflight.headers.get('access-control-allow-origin'),null);
  });
  await t.test('unknown, wrong password and inactive account have identical login failures',async()=>{
    const results=[];
    for(const [id,pw] of [['missing',password],['staff01','wrong'],['inactive',password]]){
      const resp=await request('/api/login',{method:'POST',body:{id,password:pw}});assert.equal(resp.status,401);results.push(await resp.text());
    }
    assert.equal(new Set(results).size,1);assert.equal(authCalls,3);
  });
  await t.test('web and mobile profiles expose only approved fields and tokens remain opaque',async()=>{
    const web=await login('staff01',false);assert.equal(web.token,undefined);assert.match(web.cookie,/HttpOnly/);assert.match(web.cookie,/SameSite=Strict/);
    assert.equal((await request('/api/me',{cookie:web.cookie.split(';')[0]})).status,200);
    w=await login('staff01');o=await login('staff02');r=await login('root');m=await login('manager');review=await login('reviewer');
    assert.match(w.token,/^[a-f0-9]{64}$/);assert.equal(w.cookie,null);assert.equal(w.user.id,worker.id);assert.equal(w.user.loginId,'staff01');
    const result=await (await request('/api/me',{token:w.token})).json();assert.equal(result.user.id,worker.id);
    for(const value of [JSON.stringify(w),JSON.stringify(result),logs]){
      for(const forbidden of ['@staff.invalid','auth_user_id','refresh_token',secretKey,worker.auth_user_id])assert(!value.includes(forbidden));
    }
    assert(verifyCalls>0);
    for(const [key,session] of sessions){assert.notEqual(key,w.token);assert(!session.encrypted_access_token.includes('@staff.invalid'));assert(!tokens.has(session.encrypted_access_token));}
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir,'data.json'),'utf8')),legacyFixture);
  });
  await t.test('roles, process permission, immutable actors and AS privileges are enforced server-side',async()=>{
    for(const account of [w,o,m,review])assert.equal((await request('/api/users',{token:account.token})).status,403);
    assert.equal((await request('/api/users',{token:r.token})).status,200);
    assert.equal((await request('/api/users',{method:'POST',token:r.token,body:{id:'no-json-fallback'}})).status,400);
    assert.equal((await request('/api/scan',{method:'POST',token:w.token,body:{}})).status,404);
    const response=await request('/api/as',{method:'POST',token:w.token,body:{ship:'TEST',block:'TEST',reason:'테스트',createdById:root.id,createdBy:'위조'}});
    assert.equal(response.status,200);const item=(await response.json()).item;assert.equal(item.createdById,worker.id);
    assert.equal((await request('/api/as/'+item.id,{method:'PUT',token:o.token,body:{remark:'동명이인'}})).status,403);
    assert.equal((await request('/api/as/'+item.id,{method:'PUT',token:m.token,body:{remark:'업무관리자만으로 부족'}})).status,403);
    assert.equal((await request('/api/as/'+item.id,{method:'PUT',token:review.token,body:{remark:'검토 권한'}})).status,200);
    worker.name='변경된 이름';
    assert.equal((await request('/api/as/'+item.id,{method:'PUT',token:w.token,body:{remark:'이름 변경 후 동일 작성자'}})).status,200);
    const flow=await request('/api/as/'+item.id+'/workflow',{method:'PATCH',token:w.token,body:{revision:0,action:'advance',next:'제작 요청',deliveryAgreedDate:'2027-01-01',actorId:root.id}});
    assert.equal(flow.status,200);
    const updated=(await (await request('/api/as',{token:w.token})).json()).list.find(x=>x.id===item.id);
    assert(updated.workflow.history.every(h=>h.byUserId===worker.id));
    assert.equal((await request('/api/erp/all',{method:'DELETE',token:m.token})).status,404);
  });
  await t.test('private Storage download uses an employee JWT and streams without a public URL',async()=>{
    assert.equal((await request('/api/as-attachments/'+attachmentId)).status,401);
    const response=await request('/api/as-attachments/'+attachmentId,{token:w.token});
    assert.equal(response.status,200);assert.match(response.headers.get('content-disposition'),/^attachment;/);
    assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(await response.text(),'private fixture');
    assert.equal((await request('/api/as-attachments/'+randomUUID(),{token:w.token})).status,404);
    worker.active=false;assert.equal((await request('/api/as-attachments/'+attachmentId,{token:w.token})).status,401);worker.active=true;
  });
  await t.test('deactivation, permission revision, expiry, invalid upstream token, logout and outages fail closed',async()=>{
    worker.active=false;assert.equal((await request('/api/me',{token:w.token})).status,401);worker.active=true;
    worker.session_version++;assert.equal((await request('/api/me',{token:w.token})).status,401);
    w=await login('staff01');
    const session=[...sessions.values()].find(s=>s.staff_id===worker.id&&s.session_version===worker.session_version);
    session.expires_at='2000-01-01T00:00:00Z';assert.equal((await request('/api/me',{token:w.token})).status,401);
    w=await login('staff01');
    authUnavailable=true;const unavailable=await request('/api/me',{token:w.token});assert.equal(unavailable.status,503);assert(!(await unavailable.text()).includes('private upstream'));authUnavailable=false;
    assert.equal((await request('/api/logout',{method:'POST',token:w.token})).status,200);assert.equal((await request('/api/me',{token:w.token})).status,401);
    tokens.clear();assert.equal((await request('/api/me',{token:o.token})).status,401);
  });
  await t.test('shared login rate limits stop repeated attempts without storing identifiers',async()=>{
    attempts.clear();let last;
    for(let i=0;i<21;i++)last=await request('/api/login',{method:'POST',body:{id:'missing',password}});
    assert.equal(last.status,429);assert([...attempts.keys()].every(k=>/^[a-f0-9]{64}$/.test(k)));
  });
});
