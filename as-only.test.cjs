const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {startFixture}=require('./test-support/as-fixture.cjs');
const removed=[
'/api/scan','/api/records','/api/records/example','/api/tracking','/api/master/upload','/api/master','/api/master/lookup','/api/master/all','/api/master/example',
'/api/map','/api/map/areas','/api/map/assign','/api/map/assign/example','/api/location','/api/locations','/api/location/example',
'/api/erp/preview','/api/erp/upload','/api/erp','/api/erp/columns','/api/erp/columns/rename','/api/erp/columns/add','/api/erp/columns/example','/api/erp/all',
'/api/column-mappings','/api/column-mappings/example','/api/column-mappings/reset','/api/events'
];
test('retired APIs return 404 for every method and leave all fixture data untouched',async()=>{
 const f=await startFixture();
 try{
  const session=await fetch(f.url+'/api/login',{method:'POST',headers:{'Content-Type':'application/json','X-Requested-With':'process-server'},body:JSON.stringify({id:'admin',password:'Fixture-passphrase-2026!'})});
  assert.equal(session.status,200);const cookie=session.headers.get('set-cookie').split(';')[0];
  const names=fs.readdirSync(f.dir).filter(n=>n.endsWith('.json'));
  const before=Object.fromEntries(names.map(n=>[n,fs.readFileSync(path.join(f.dir,n),'utf8')]));
  for(const endpoint of removed)for(const method of ['GET','POST','PUT','PATCH','DELETE']){
   const response=await fetch(f.url+endpoint,{method,headers:{cookie,'X-Requested-With':'process-server','Content-Type':'application/json'},...(method==='GET'?{}:{body:'{}'})});
   assert.equal(response.status,404,method+' '+endpoint);await response.text();
  }
  for(const n of names)assert.equal(fs.readFileSync(path.join(f.dir,n),'utf8'),before[n],n);
  assert.equal(fs.readFileSync(path.join(f.dir,'uploads/existing.txt'),'utf8'),'preserve attachment');
 }finally{await f.close();}
});
test('login, users, products, AS attachments and workflow operate without retired APIs',async()=>{
 const f=await startFixture();
 try{
  let cookie='';
  const request=(endpoint,method='GET',body)=>fetch(f.url+endpoint,{method,headers:{cookie,'X-Requested-With':'process-server',...(body instanceof FormData?{}:{'Content-Type':'application/json'})},...(body?{body:body instanceof FormData?body:JSON.stringify(body)}:{})});
  const login=async()=>{const r=await request('/api/login','POST',{id:'admin',password:'Fixture-passphrase-2026!'});assert.equal(r.status,200);cookie=r.headers.get('set-cookie').split(';')[0];};
  assert.equal((await request('/api/login','POST',{id:'admin',password:'wrong'})).status,401);
  await login();
  assert.equal((await request('/api/users/admin','PUT',{name:'Updated admin',asReview:false,asApprove:true})).status,200);
  assert.equal((await request('/api/me')).status,401);await login();
  assert.deepEqual(f.read('data.json').users[0].allowedSteps,['incoming']);
  assert.deepEqual(f.read('data.json').records,[{id:'legacy-scan',barcode:'preserve'}]);
  assert.equal((await request('/api/users','POST',{id:'test',password:'Fixture-passphrase-2026!',name:'Test',role:'worker'})).status,200);
  assert.equal((await request('/api/users/test','DELETE')).status,200);
  assert.equal((await request('/api/users/admin','DELETE')).status,400);
  assert.equal((await request('/api/products','POST',{name:'Product'})).status,200);
  assert.equal((await request('/api/products/Product','PUT',{newName:'Renamed'})).status,200);
  const form=new FormData();for(const [key,value]of Object.entries({ship:'TEST',block:'A',product:'Renamed',reason:'도장 불량',deliveryAgreedDate:'2099-12-31',materialCode:'AS-MATERIAL',amount:'125000'}))form.set(key,value);
  form.append('files',new Blob(['attachment fixture'],{type:'text/plain'}),'fixture.txt');
  const created=await request('/api/as','POST',form);assert.equal(created.status,200);const item=(await created.json()).item;
  assert.equal(item.materialCode,'AS-MATERIAL');assert.equal(item.files.length,1);
  assert.equal(await (await request('/uploads/'+item.files[0].filename)).text(),'attachment fixture');
  const update=new FormData();update.set('remark','Updated');assert.equal((await request('/api/as/'+item.id,'PUT',update)).status,200);
  const transition=new FormData();transition.set('payload',JSON.stringify({action:'advance',next:'제작 요청',revision:0,owner:'Owner',dueDate:'2099-12-30'}));
  assert.equal((await request('/api/as/'+item.id+'/workflow','PATCH',transition)).status,200);
  assert.equal((await request('/api/as/'+item.id,'DELETE')).status,200);
  assert.equal((await request('/api/products/Renamed','DELETE')).status,200);
  assert.equal((await request('/api/logout','POST',{})).status,200);
  assert.equal((await request('/api/as')).status,401);
  for(const resource of ['/','/login.html','/dashboard.html','/auth-client.js','/as-workflow-ui.js','/as-amount.js','/cover-assets/user-management-basic.css'])assert.equal((await fetch(f.url+resource)).status,200,resource);
  for(const resource of ['/data.json','/as.json','/products.json','/dashboard_old.html','/dashboard%20(6).html'])assert.equal((await fetch(f.url+resource)).status,404,resource);
 }finally{await f.close();}
});

test('the retained UI has no retired API or navigation references',()=>{
 const html=fs.readFileSync(path.join(__dirname,'dashboard.html'),'utf8');
 assert(!/\/api\/(?:scan|records|tracking|master|map|location|erp|column-mappings|events)\b/.test(html));
 assert(!/id="(?:tabHome|tabTracking|tabErp|tabFloorplan|modalStepsGrid|devNotice)"/.test(html));
 assert(html.includes('data-sub="product"'));assert(html.includes('id="modalAsPerms"'));
});
