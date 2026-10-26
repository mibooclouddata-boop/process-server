'use strict';
const {randomUUID} = require('node:crypto');
const steps=['incoming','inspect_wait','inspect_done','paint_wait','paint_done','deliver_wait','deliver_done'];
const error=(status,message)=>Object.assign(new Error(message),{status});
function validate(input,creating=false){
  if(!input||typeof input!=='object'||Array.isArray(input))throw error(400,'사용자 정보를 확인하세요.');
  const allowed=['name','role','allowedSteps','asReview','asApprove','department','position','icon','active','password',...(creating?['id']:[])];
  if(Object.keys(input).some(k=>!allowed.includes(k)))throw error(400,'지원하지 않는 사용자 필드입니다.');
  for(const k of ['id','name','department','position','icon'])if(input[k]!==undefined&&(typeof input[k]!=='string'||input[k].length>100))throw error(400,'사용자 정보를 확인하세요.');
  if((creating&&(!input.id?.trim()||!input.name?.trim()))||(input.name!==undefined&&!input.name.trim()))throw error(400,'아이디와 이름이 필요합니다.');
  if(input.role!==undefined&&!['sysadmin','admin','worker'].includes(input.role))throw error(400,'역할을 확인하세요.');
  for(const k of ['active','asReview','asApprove'])if(input[k]!==undefined&&typeof input[k]!=='boolean')throw error(400,'권한 값을 확인하세요.');
  if(input.allowedSteps!==undefined&&(!Array.isArray(input.allowedSteps)||input.allowedSteps.some(x=>!steps.includes(x))))throw error(400,'공정 권한을 확인하세요.');
  if((creating||input.password!==undefined)&&(typeof input.password!=='string'||input.password.length<12||input.password.length>128))throw error(400,'비밀번호는 12~128자로 입력하세요.');
  const out={...input};if(out.id)out.id=out.id.trim();if(out.name)out.name=out.name.trim();return out;
}
function result(r){
  if(!r.error)return r.data;
  if(r.error.code==='42501')throw error(403,'권한이 없습니다.');
  if(r.error.code==='23505')throw error(409,'이미 등록된 아이디입니다.');
  if(r.error.code==='P0002')throw error(404,'사용자를 찾을 수 없습니다.');
  if(r.error.code==='23514')throw error(409,'마지막 관리자이거나 진행 중인 변경이 있어 처리할 수 없습니다.');
  throw error(503,'계정 변경에 실패했습니다. 상태를 확인한 후 다시 시도하세요.');
}
function createStaffAdmin(admin){
  return {
    async create(actor,input){
      const values=validate(input,true),email=randomUUID()+'@staff.invalid';
      const {password,...profile}=values;
      const auth=await admin.auth.admin.createUser({email,password,email_confirm:true});
      if(auth.error||!auth.data?.user)throw error(503,'인증 계정을 생성하지 못했습니다.');
      try {
        const id=result(await admin.rpc('server_staff_create',{input_actor:actor,input_auth:auth.data.user.id,input_email:email,input_profile:profile}));
        return {success:true,id};
      }catch(e){
        // An orphan has no profile/mapping/RLS access even if upstream cleanup fails.
        try{await admin.auth.admin.deleteUser(auth.data.user.id);}catch{}
        throw e;
      }
    },
    async update(actor,id,input){
      if(!/^[0-9a-f-]{36}$/i.test(id))throw error(400,'사용자 ID를 확인하세요.');
      const {password,...changes}=validate(input);
      const operation=result(await admin.rpc('server_staff_change',{input_actor:actor,input_staff:id,input_changes:changes,input_reset:password!==undefined}));
      if(password!==undefined){
        let changed=false;
        try{
          const update=await admin.auth.admin.updateUserById(operation.authId,{password});
          if(update.error)throw error(503,'비밀번호 변경에 실패했습니다. 계정은 비활성 상태로 유지됩니다.');
          changed=true;
        }finally{
          // Never reactivate on unknown Auth outcome. A DB outage leaves the pending account locked.
          result(await admin.rpc('server_staff_finish_reset',{input_operation:operation.operation,input_success:changed}));
        }
      }
      return {success:true};
    }
  };
}
module.exports={createStaffAdmin,validate};
