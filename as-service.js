'use strict';
const {randomUUID,createHash} = require('node:crypto');
const workflow = require('./as-workflow');
const amount = require('./as-amount');
const error = (message, status=400) => Object.assign(new Error(message), {status});
const fail = (message,status) => {throw error(message,status);};
const fields = {ship:100,block:100,element:200,product:300,materialCode:100,reason:2000,action:2000,remark:2000};
function objectInput(input) {if(!input||typeof input!=='object'||Array.isArray(input))fail('올바른 접수 정보가 필요합니다.');}
function text(value, name, max, required=false) {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim()) || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) fail(name+' 값을 확인하세요.');
  return value.trim();
}
function canManage(actor) {
  return !!actor && typeof actor.id==='string' && !!actor.id && actor.active!==false && !actor.passwordResetRequired && ['sysadmin','admin','worker'].includes(actor.role);
}
function authorize(actor) {if (!canManage(actor)) fail('다시 로그인하세요.',401);}
function versionOf(item) {return item.version ?? item.workflow?.revision ?? 0;}
function expectedVersion(value) {
  if (typeof value==='string' && /^(0|[1-9]\d*)$/.test(value)) value=Number(value);
  if (!Number.isSafeInteger(value)||value<0) fail('접수 버전이 필요합니다. 목록을 새로고침하세요.',428);
  return value;
}
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value==='object') return Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])]));
  return value;
}
function createAsService(store, {clock=()=>new Date()} = {}) {
  const visible = row => ({...workflow.normalize(structuredClone(row)),version:versionOf(row)});
  function event(data,type,before,after,actor,reason,at) {
    data.events.push({id:randomUUID(),recordId:after.id,type,version:after.version,at,
      actorId:actor.id,actorName:actor.name,reason,before:before||null,after:structuredClone(after)});
  }
  function mutate(operation,id,input,files,actor,key,apply) {
    authorize(actor);
    if (typeof key!=='string'||! /^[A-Za-z0-9_-]{16,128}$/.test(key)) fail('저장 요청 키가 필요합니다. 화면을 새로고침하세요.',428);
    const digest=createHash('sha256').update(JSON.stringify(canonical({operation,id,input,files:files.map(({name,size,sha256})=>({name,size,sha256}))}))).digest('hex');
    return store.transaction(data=>{
      let item=id?data.list.find(row=>row.id===id):null;
      if(id&&!item)fail('AS 건을 찾을 수 없습니다.',404);
      const prior=data.requests.find(r=>r.actorId===actor.id&&r.key===key);
      if(prior){
        if(prior.hash!==digest)fail('이 요청은 이미 다른 내용으로 처리됐습니다. 목록을 확인한 뒤 새 작업으로 저장하세요.',409);
        return {...structuredClone(prior.result),replayed:true};
      }
      if(item){
        if(item.deletedAt && operation!=='restore')fail('삭제된 AS 건입니다.',410);
        if(expectedVersion(input.version)!==versionOf(item))fail('다른 사용자가 변경했습니다. 목록을 새로고침한 뒤 다시 확인하세요.',409);
      }
      const before=item?structuredClone(item):null;
      const now=clock();
      item=apply(data,item,now);
      item.version=before?versionOf(before)+1:0;
      if(!Number.isSafeInteger(item.version))fail('접수 버전 범위를 초과했습니다.',409);
      item.updatedAt=now.toISOString();item.updatedById=actor.id;
      if(item.workflow)item.workflow.revision=item.version;
      event(data,operation,before,item,actor,input.changeReason||'',item.updatedAt);
      const result={success:true,item:visible(item)};
      data.requests.push({actorId:actor.id,key,hash:digest,operation,recordId:item.id,at:item.updatedAt,result:structuredClone(result)});
      return result;
    });
  }
  function validateInput(input, creating=false) {
    objectInput(input);
    const result={};
    for(const [name,max] of Object.entries(fields)) if(input[name]!==undefined||creating&&['ship','block','reason'].includes(name)) result[name]=text(input[name],name,max,['ship','block','reason'].includes(name));
    if(input.category!==undefined||creating){result.category=input.category===undefined?'사내':input.category;if(!['사내','사외','기타'].includes(result.category))fail('구분 값을 확인하세요.');}
    if(input.amount!==undefined||creating){try{result.amount=amount.parse(input.amount);}catch(e){fail(e.message);}}
    if(input.deliveryAgreedDate!==undefined||creating){const date=input.deliveryAgreedDate===undefined?'':input.deliveryAgreedDate;if(date!==''&&!workflow.dateValid(date))fail('납품 협의일을 올바른 날짜로 입력하세요.');result.deliveryAgreedDate=date;}
    return result;
  }
  function appendFiles(item,files) {
    const current=item.files||[];
    if(current.length+files.length>50||[...current,...files].reduce((n,f)=>n+(f.size||0),0)>200*1024*1024)fail('접수당 첨부파일은 50개, 합계 200MB까지입니다.');
    item.files=[...current,...files];
  }
  function retire(item,names,actor,now) {
    if(!Array.isArray(names)||names.length>50||names.some(n=>typeof n!=='string'))fail('첨부 해제 목록을 확인하세요.');
    if(names.some(n=>!(item.files||[]).some(f=>f.filename===n)))fail('첨부 목록이 변경되었습니다. 새로고침하세요.',409);
    item.retiredFiles=[...(item.retiredFiles||[]),...(item.files||[]).filter(f=>names.includes(f.filename)).map(f=>({...f,removedAt:now.toISOString(),removedById:actor.id}))];
    item.files=(item.files||[]).filter(f=>!names.includes(f.filename));
  }
  return {
    list:()=>store.read(data=>data.list.filter(r=>!r.deletedAt).map(visible)),
    trash:actor=>store.read(data=>data.list.filter(r=>r.deletedAt&&canManage(actor)).map(visible)),
    requestStatus:(key,actor)=>store.read(data=>{const request=data.requests.find(r=>r.actorId===actor.id&&r.key===key);return request?{recordId:request.recordId,asNo:request.result.item.asNo,operation:request.operation,version:request.result.item.version}:null;}),
    history:(id,actor)=>store.read(data=>{authorize(actor);const item=data.list.find(r=>r.id===id);if(!item)fail('AS 건을 찾을 수 없습니다.',404);return structuredClone(data.events.filter(e=>e.recordId===id));}),
    attachment:filename=>store.read(data=>data.list.some(r=>!r.deletedAt&&(r.files||[]).some(f=>f.filename===filename))),
    check:(id,actor)=>store.read(data=>{authorize(actor);const item=data.list.find(r=>r.id===id);if(!item)fail('AS 건을 찾을 수 없습니다.',404);}),
    create(input,files,actor,key) {
      const values=validateInput(input,true);
      return mutate('create',null,values,files,actor,key,(data,unused,now)=>{
        const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
        const ym=day.slice(2,4)+day.slice(5,7),prefix='AS-'+ym+'-';
        const observed=data.list.filter(r=>r.asNo.startsWith(prefix)).map(r=>Number(r.asNo.slice(prefix.length)));
        const saved=data.monthSeq?.[ym]??0;
        if(!Number.isSafeInteger(saved)||saved<0||observed.some(n=>!Number.isSafeInteger(n)||n<1))fail('접수번호 카운터를 확인해야 합니다.',503);
        const seq=observed.reduce((max,n)=>Math.max(max,n),saved)+1;
        if(!Number.isSafeInteger(seq))fail('접수번호 범위를 초과했습니다.',503);
        data.monthSeq={...data.monthSeq,[ym]:seq};
        const item={...values,id:randomUUID(),asNo:prefix+String(seq).padStart(2,'0'),status:'접수',createdById:actor.id,createdBy:actor.name,createdDept:actor.department||'',createdPos:actor.position||'',createdAt:now.toISOString(),files:[]};
        appendFiles(item,files);data.list.push(item);return item;
      });
    },
    update(id,input,files,actor,key) {
      const values=validateInput(input),version=expectedVersion(input.version);
      let removed=[];try{removed=typeof input.removeFiles==='string'?JSON.parse(input.removeFiles):input.removeFiles??[];}catch{fail('첨부 해제 목록을 확인하세요.');}
      const changeReason=input.changeReason===undefined?'':text(input.changeReason,'변경 사유',500);
      return mutate('update',id,{...values,version,status:input.status,removeFiles:removed,changeReason},files,actor,key,(data,item,now)=>{
        if(input.status!==undefined&&input.status!==workflow.normalize(item).status)fail('상태는 진행 관리에서 변경하세요.');
        if(item.status==='완료'&&!changeReason)fail('완료된 접수의 정정 사유를 입력하세요.');
        if(workflow.normalize(item).status!=='접수'&&values.deliveryAgreedDate==='')fail('진행 중이거나 완료된 접수의 납품 협의일은 지울 수 없습니다.');
        Object.assign(item,values);retire(item,removed,actor,now);appendFiles(item,files);return item;
      });
    },
    advance(id,input,files,actor,key) {
      objectInput(input);
      const version=expectedVersion(input.version);
      const changeReason=input.changeReason===undefined?'':text(input.changeReason,'변경 사유',500);
      const request={version,changeReason};
      for(const field of ['action','next','completedDate','deliveryAgreedDate','completionNote'])if(input[field]!==undefined)request[field]=input[field];
      return mutate('workflow',id,request,files,actor,key,(data,item,now)=>{
        const normalized=visible(item);
        normalized.workflow=normalized.workflow||{stages:{},history:[]};normalized.workflow.revision=version;
        const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
        const next=workflow.applyWorkflow(normalized,{...request,revision:version},actor,day,now.toISOString());
        appendFiles(next,files);data.list[data.list.indexOf(item)]=next;return next;
      });
    },
    remove(id,input,actor,key) {
      objectInput(input);
      const version=expectedVersion(input.version),changeReason=text(input.changeReason,'삭제 사유',500,true);
      return mutate('delete',id,{version,changeReason},[],actor,key,(data,item,now)=>{item.deletedAt=now.toISOString();item.deletedById=actor.id;item.deleteReason=changeReason;return item;});
    },
    restore(id,input,actor,key) {
      objectInput(input);
      const version=expectedVersion(input.version),changeReason=text(input.changeReason,'복원 사유',500,true);
      return mutate('restore',id,{version,changeReason},[],actor,key,(data,item)=>{if(!item.deletedAt)fail('삭제된 접수가 아닙니다.',409);delete item.deletedAt;delete item.deletedById;delete item.deleteReason;return item;});
    }
  };
}
module.exports={createAsService,canManage,versionOf};
