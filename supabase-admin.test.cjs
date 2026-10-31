'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {createStaffAdmin}=require('./supabase-admin');
function fixture({dbFailure=false,authFailure=false}={}){
  const calls=[],authId=randomUUID();
  return {calls,service:createStaffAdmin({auth:{admin:{
    createUser:async input=>{calls.push(['create',input]);return {data:{user:{id:authId}}};},
    deleteUser:async id=>{calls.push(['delete',id]);return {};},
    updateUserById:async(id,input)=>{calls.push(['password',id,input]);return authFailure?{error:{message:'secret'}}:{data:{}};}
  }},rpc:async(name,input)=>{calls.push([name,input]);return dbFailure?{error:{code:'23505'}}:{data:name==='server_staff_change'?{operation:randomUUID(),authId}:randomUUID()};}})};
}
test('staff creation hides real login from Auth and compensates a failed mapping',async()=>{
  const input={id:'EMP-001',name:'Worker',password:'test-password-long'};
  const f=fixture();await f.service.create(randomUUID(),input);
  assert.match(f.calls[0][1].email,/^[0-9a-f-]{36}@staff\.invalid$/);
  assert.equal(f.calls[0][1].email_confirm,true);
  assert.equal(f.calls[1][1].input_profile.id,input.id);
  assert.equal(f.calls[1][1].input_profile.password,undefined);
  const fail=fixture({dbFailure:true});await assert.rejects(fail.service.create(randomUUID(),input),{status:409});
  assert.equal(fail.calls[2][0],'delete');
});
test('invalid input never reaches Auth or privileged SQL',async()=>{
  const f=fixture();
  for(const input of [{id:'x',name:'y',password:'short'},{id:'x',name:'y',password:'long-password',role:'owner'},{id:'x',name:'y',password:'long-password',auth_user_id:randomUUID()}])
    await assert.rejects(f.service.create(randomUUID(),input),{status:400});
  assert.equal(f.calls.length,0);
});
test('password reset locks/revokes before Auth and resumes only on confirmed success',async()=>{
  for(const authFailure of [false,true]){
    const f=fixture({authFailure});const action=f.service.update(randomUUID(),randomUUID(),{password:'test-password-long'});
    if(authFailure)await assert.rejects(action,{status:503});else await action;
    assert.deepEqual(f.calls.map(c=>c[0]),['server_staff_change','password','server_staff_finish_reset']);
    assert.equal(f.calls[0][1].input_reset,true);
    assert.equal(f.calls[2][1].input_success,!authFailure);
    assert.equal(f.calls[0][1].input_changes.password,undefined);
  }
});

test('retired AS permission inputs are rejected before any Auth or database operation',async()=>{
 const f=fixture();
 for(const key of ['asReview','asApprove']){
  await assert.rejects(f.service.create(randomUUID(),{id:'fixture',name:'Fixture',password:'test-password-long',[key]:true}),{status:400});
  await assert.rejects(f.service.update(randomUUID(),randomUUID(),{[key]:true}),{status:400});
 }
 assert.equal(f.calls.length,0);
});
