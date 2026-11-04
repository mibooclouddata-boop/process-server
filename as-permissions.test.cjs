'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const permissions=require('./as-permissions'),{createAsService}=require('./as-service');
const staff={id:'staff',name:'Staff',role:'worker'},admin={id:'root',name:'Root',role:'sysadmin'};
const base={ship:'Fixture',block:'B',reason:'test',deliveryAgreedDate:'2026-11-01'};
const denied=fn=>assert.rejects(Promise.resolve().then(fn),{status:403});
function fixture(){
 const data={list:[],events:[],requests:[]};
 const store={read:async fn=>fn(data),transaction:async fn=>{const draft=structuredClone(data);const result=fn(draft);Object.assign(data,draft);return result;}};
 return {data,service:createAsService(store,{clock:()=>new Date('2026-11-04T00:00:00Z')})};
}
test('permission helper denies missing grants and maps exact current stages',()=>{
 for(const key of permissions.keys){
  assert.equal(permissions.can(staff,key),false);assert(permissions.can(admin,key));
  for(const role of ['worker','admin'])assert(permissions.can({...staff,role,asPermissions:[key]},key));
  for(const change of [{active:false},{passwordResetRequired:true},{role:'guest'},{id:''}])assert.equal(permissions.can({...admin,...change},key),false);
 }
 for(const status of ['접수','검토 요청','승인 요청','처리 대기'])assert.equal(permissions.forStatus(status),'create');
 for(const [status,key] of [['제작 요청','production'],['도장 요청','painting'],['납품 요청','delivery']])assert.equal(permissions.forStatus(status),key);
 for(const status of ['완료','unknown','toString','__proto__',undefined])assert.equal(permissions.forStatus(status),null);
 assert.equal(permissions.can(admin,'unknown'),false);
});
test('registration permission controls create, update, deletion and restoration independently of stage grants',async()=>{
 const {service}=fixture();let {item}=await service.create(base,[],admin,randomUUID());
 for(const asPermissions of [undefined,[],['production','painting','delivery']]){
  const actor={...staff,asPermissions};
  await denied(()=>service.create(base,[],actor,randomUUID()));
  await denied(()=>service.update(item.id,{version:0,remark:'test'},[],actor,randomUUID()));
  await denied(()=>service.remove(item.id,{version:0,changeReason:'test'},actor,randomUUID()));
 }
 item=(await service.remove(item.id,{version:0,changeReason:'test'},admin,randomUUID())).item;
 await denied(()=>service.restore(item.id,{version:1,changeReason:'test'},staff,randomUUID()));
 await service.restore(item.id,{version:1,changeReason:'test'},{...staff,asPermissions:['create']},randomUUID());
});
test('each workflow action requires the current stage and retries recheck the original permission',async()=>{
 const {service,data}=fixture();let {item}=await service.create(base,[],admin,randomUUID());
 for(const [required,next] of [['create','제작 요청'],['production','도장 요청'],['painting','납품 요청'],['delivery','완료']]){
  const input={version:item.version,action:'advance',next,completedDate:'2026-11-04'};
  for(const key of permissions.keys.filter(key=>key!==required)){
   await denied(()=>service.advance(item.id,input,[],{...staff,asPermissions:[key]},randomUUID()));
   if(required!=='create')await denied(()=>service.advance(item.id,{version:item.version,action:'save'},[],{...staff,asPermissions:[key]},randomUUID()));
  }
  const actor={...staff,asPermissions:[required]},key=randomUUID();
  if(required!=='create'){
   item=(await service.advance(item.id,{version:item.version,action:'save'},[],actor,randomUUID())).item;
   input.version=item.version;
  }
  item=(await service.advance(item.id,input,[],actor,key)).item;
  assert((await service.advance(item.id,input,[],actor,key)).replayed);
  await denied(()=>service.advance(item.id,input,[],{...actor,asPermissions:permissions.keys.filter(k=>k!==required)},key));
  assert.equal(data.requests.find(r=>r.key===key).requiredPermission,required);
 }
 assert.equal(item.status,'완료');
});
