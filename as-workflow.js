'use strict';
const STAGES = ['제작 요청','도장 요청','납품 요청'];
const LEGACY = ['검토 요청','승인 요청','처리 대기'];
function normalize(item) {
  if (LEGACY.includes(item.status)) return {...item, legacyStatus:item.status, status:'접수'};
  return item;
}
function dateValid(value) {
  return typeof value==='string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0,10)===value;
}
function today() { return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()); }
function fail(message, code=400) { const e=new Error(message);e.status=code;throw e; }
function text(value,label,max=100) { if(typeof value!=='string'||!value.trim()||value.trim().length>max) fail(label+'을(를) 확인하세요.');return value.trim(); }
function applyWorkflow(source,input,actor,day=today(),now=new Date().toISOString()) {
  const item=structuredClone(normalize(source));
  if(!input || typeof input!=='object') fail('작업 정보가 필요합니다.');
  const revision=item.workflow?.revision||0;
  if(input.revision!==revision) fail('다른 사용자가 변경했습니다. 다시 열어 확인하세요.',409);
  if(item.status==='완료') fail('완료된 건은 변경할 수 없습니다.');
  if(!['접수',...STAGES].includes(item.status)) fail('지원하지 않는 상태입니다.');
  const action=input.action;
  if(!['save','advance'].includes(action)) fail('올바른 작업을 선택하세요.');
  const current=STAGES.indexOf(item.status);
  const wf=item.workflow||{revision:0,stages:{},history:[]};
  const history=(type,detail)=>wf.history.push({type,...detail,at:now,by:actor.name,byUserId:actor.id||''});
  const agreement=input.deliveryAgreedDate ?? item.deliveryAgreedDate;
  if(!dateValid(agreement)) fail('제작 요청 전에 납품 협의일을 입력하세요.');
  if(agreement!==item.deliveryAgreedDate) history('deadline',{previousDate:item.deliveryAgreedDate||'',date:agreement});
  item.deliveryAgreedDate=agreement;
  const plan=(stage)=>{
    const old=wf.stages[stage]||{};
    wf.stages[stage]={...old,requestedAt:old.requestedAt||now,requestedDate:old.requestedDate||day};
  };
  if(action==='save') {
    if(current<0) fail('먼저 작업을 요청하세요.');
    plan(item.status);
  } else {
    const next=STAGES.indexOf(input.next);
    if(input.next==='완료' ? current!==2 : next!==current+1 || next<0) fail('다음 작업 단계를 확인하세요.');
    let completedDate;
    if(current>=0) {
      const stage=wf.stages[item.status];
      if(!stage) fail('현재 작업 정보를 찾을 수 없습니다.');
      completedDate=input.completedDate;
      const previousDate=wf.stages[STAGES[current-1]]?.completedDate;
      if(!dateValid(completedDate)||completedDate>day) fail('실제 완료일은 오늘 또는 과거 날짜로 입력하세요.');
      if(previousDate && completedDate<previousDate) fail('이전 단계 완료일 이후의 날짜를 입력하세요.');
      stage.completedDate=completedDate;
      stage.completedBy=actor.name;
      stage.completedUserId=actor.id||'';
      stage.completedDept=actor.department||'';
      stage.completedPos=actor.position||'';
      stage.completedAt=now;
      history('complete',{stage:item.status,completedDate});
    }
    if(input.next==='완료') {
      if(input.completionNote) item.completionNote=text(input.completionNote,'최종 조치 내용',2000);
      item.deliveredDate=completedDate;
      item.completedBy=actor.name;item.completedUserId=actor.id||'';item.completedDept=actor.department||'';item.completedPos=actor.position||'';item.completedAt=now;
    } else {
      plan(input.next);
    }
    history('transition',{from:item.status,to:input.next});
    item.status=input.next;
  }
  wf.revision=revision+1;item.workflow=wf;return item;
}
module.exports={STAGES,normalize,dateValid,today,applyWorkflow};
