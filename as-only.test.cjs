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
  const names=fs.readdirSync(f.dir).filter(n=>n.endsWith('.json'));
  const before=Object.fromEntries(names.map(n=>[n,fs.readFileSync(path.join(f.dir,n),'utf8')]));
  for(const endpoint of removed)for(const method of ['GET','POST','PUT','PATCH','DELETE']){
   const response=await fetch(f.url+endpoint,{method,...(method==='GET'?{}:{headers:{'Content-Type':'application/json'},body:'{}'})});
   assert.equal(response.status,404,method+' '+endpoint);await response.text();
  }
  for(const n of names)assert.equal(fs.readFileSync(path.join(f.dir,n),'utf8'),before[n],n);
  assert.equal(fs.readFileSync(path.join(f.dir,'uploads/existing.txt'),'utf8'),'preserve attachment');
 }finally{await f.close();}
});
test('login, users, products, AS attachments and workflow operate without retired APIs',async()=>{
 const f=await startFixture();
 try{
  const json=async(endpoint,method='GET',body,cookie='')=>fetch(f.url+endpoint,{method,headers:{'Content-Type':'application/json',cookie},...(body?{body:JSON.stringify(body)}:{})});
  assert.equal((await json('/api/login','POST',{id:'admin',password:'wrong'})).status,401);
  const login=await json('/api/login','POST',{id:'admin',password:'1234'});assert.equal(login.status,200);
  const cookie=login.headers.get('set-cookie').split(';')[0];
  assert.equal((await json('/api/users/admin','PUT',{name:'수정 관리자',asReview:false,asApprove:true})).status,200);
  assert.deepEqual(f.read('data.json').users[0].allowedSteps,['incoming']);
  assert.deepEqual(f.read('data.json').records,[{id:'legacy-scan',barcode:'preserve'}]);
  assert.equal((await json('/api/users','POST',{id:'test',password:'1234',name:'테스트',role:'worker',department:'품질'})).status,200);
  assert.equal((await json('/api/users/test','DELETE')).status,200);
  assert.equal((await json('/api/users/admin','DELETE')).status,400);
  assert.equal((await json('/api/products','POST',{name:'신규 제품'})).status,200);
  assert.equal((await json('/api/products/'+encodeURIComponent('신규 제품'),'PUT',{newName:'변경 제품'})).status,200);
  const form=new FormData();
  for(const [key,value]of Object.entries({ship:'TEST',block:'A',product:'변경 제품',reason:'도장 불량',createdBy:'검증 관리자',deliveryAgreedDate:'2099-12-31',materialCode:'AS-MATERIAL',amount:'125000'}))form.set(key,value);
  form.append('files',new Blob(['attachment fixture'],{type:'text/plain'}),'fixture.txt');
  const created=await fetch(f.url+'/api/as',{method:'POST',body:form});assert.equal(created.status,200,await created.text());
  const listed=await (await json('/api/as')).json();const item=listed.list[0];assert(item);assert.equal(item.materialCode,'AS-MATERIAL');assert.equal(item.files.length,1);
  const attachment=await fetch(f.url+'/uploads/'+item.files[0].filename);assert.equal(await attachment.text(),'attachment fixture');
  const update=new FormData();update.set('remark','수정 확인');
  assert.equal((await fetch(f.url+'/api/as/'+item.id,{method:'PUT',body:update})).status,200);
  const transition=new FormData();transition.set('payload',JSON.stringify({action:'advance',next:'제작 요청',revision:0,owner:'제작 담당',dueDate:'2099-12-30'}));
  assert.equal((await fetch(f.url+'/api/as/'+item.id+'/workflow',{method:'PATCH',body:transition})).status,401);
  const progressed=await fetch(f.url+'/api/as/'+item.id+'/workflow',{method:'PATCH',body:transition,headers:{cookie}});assert.equal(progressed.status,200,await progressed.text());
  const after=await (await json('/api/as')).json();assert.equal(after.list[0].status,'제작 요청');assert.equal(after.list[0].files.length,1);
  assert.equal((await json('/api/logout','POST',{},cookie)).status,200);
  assert.equal((await fetch(f.url+'/api/as/'+item.id+'/workflow',{method:'PATCH',body:transition,headers:{cookie}})).status,401);
  assert.equal((await json('/api/as/'+item.id,'DELETE')).status,200);
  assert.equal((await json('/api/products/'+encodeURIComponent('변경 제품'),'DELETE')).status,200);
  for(const resource of ['/','/login.html','/dashboard.html','/as-workflow-ui.js','/as-amount.js','/cover-assets/user-management-basic.css'])assert.equal((await fetch(f.url+resource)).status,200,resource);
  for(const resource of ['/data.json','/as.json','/products.json','/dashboard_old.html','/dashboard%20(6).html'])assert.equal((await fetch(f.url+resource)).status,404,resource);
 }finally{await f.close();}
});
test('the retained UI has no retired API or navigation references',()=>{
 const html=fs.readFileSync(path.join(__dirname,'dashboard.html'),'utf8');
 assert(!/\/api\/(?:scan|records|tracking|master|map|location|erp|column-mappings|events)\b/.test(html));
 assert(!/id="(?:tabHome|tabTracking|tabErp|tabFloorplan|modalStepsGrid|devNotice)"/.test(html));
 assert(html.includes('data-sub="product"'));assert(html.includes('id="modalAsPerms"'));
});
