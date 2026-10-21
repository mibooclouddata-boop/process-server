/* AS job scheduling UI. Dates use the company's Korea business calendar. */
const appDateState={input:null,view:null,dialog:null};
function appDateAllowed(input,value){return (!input.min||value>=input.min)&&(!input.max||value<=input.max);}
function appDateFmt(date){return date.getFullYear()+'-'+String(date.getMonth()+1).padStart(2,'0')+'-'+String(date.getDate()).padStart(2,'0');}
function openAppDatePicker(input){
 if(input.disabled||input.readOnly)return;
 let dialog=appDateState.dialog;
 if(!dialog){
  dialog=document.createElement('dialog');dialog.id='appDatePicker';dialog.setAttribute('aria-label','날짜 선택');document.body.appendChild(dialog);appDateState.dialog=dialog;
  dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close();});
  dialog.addEventListener('close',()=>{const target=appDateState.input;if(target?.isConnected)target.focus();});
 }
 appDateState.input=input;
 const anchor=input.value||input.max||asJobToday();
 appDateState.view=new Date(Number(anchor.slice(0,4)),Number(anchor.slice(5,7))-1,1);
 renderAppDatePicker();if(!dialog.open)dialog.showModal();
 dialog.querySelector('.single:not(:disabled),.today:not(:disabled),.toss-cal-cell:not(:disabled)')?.focus();
}
function moveAppDatePicker(delta){const d=appDateState.view;appDateState.view=new Date(d.getFullYear(),d.getMonth()+delta,1);renderAppDatePicker();}
function pickAppDate(value){
 const input=appDateState.input;if(!input||input.disabled||(value&&!appDateAllowed(input,value)))return;
 input.value=value;input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));appDateState.dialog.close();
}
function renderAppDatePicker(){
 const {input,view,dialog}=appDateState,y=view.getFullYear(),m=view.getMonth(),today=asJobToday();
 const start=new Date(y,m,1).getDay();let days='';
 for(let i=0;i<42;i++){
  const d=new Date(y,m,i-start+1),value=appDateFmt(d),out=d.getMonth()!==m,disabled=out||!appDateAllowed(input,value);
  days+='<button type="button" class="toss-cal-cell'+(out?' out':'')+(value===today?' today':'')+(value===input.value?' single':'')+'" aria-label="'+value+'" aria-pressed="'+(value===input.value)+'"'+(disabled?' disabled':'')+' onclick="pickAppDate(\''+value+'\')">'+d.getDate()+'</button>';
 }
 const prevEnd=appDateFmt(new Date(y,m,0)),nextStart=appDateFmt(new Date(y,m+1,1));
 dialog.innerHTML='<div class="toss-cal-pop is-open"><div class="toss-cal-header"><button type="button" class="toss-cal-nav" aria-label="이전 달" onclick="moveAppDatePicker(-1)"'+(input.min&&prevEnd<input.min?' disabled':'')+'>‹</button><div class="toss-cal-title">'+y+'년 '+(m+1)+'월</div><button type="button" class="toss-cal-nav" aria-label="다음 달" onclick="moveAppDatePicker(1)"'+(input.max&&nextStart>input.max?' disabled':'')+'>›</button></div><div class="toss-cal-weekdays">'+['일','월','화','수','목','금','토'].map((w,i)=>'<div class="toss-cal-weekday '+(i===0?'sun':i===6?'sat':'')+'">'+w+'</div>').join('')+'</div><div class="toss-cal-grid">'+days+'</div><div class="toss-cal-quick"><button type="button" class="toss-cal-quick-btn" onclick="pickAppDate(\''+today+'\')"'+(!appDateAllowed(input,today)?' disabled':'')+'>오늘</button><button type="button" class="toss-cal-quick-btn reset" onclick="pickAppDate(\'\')">초기화</button><button type="button" class="toss-cal-quick-btn" onclick="appDateState.dialog.close()">닫기</button></div></div>';
}
document.addEventListener('click',event=>{
 const input=event.target.closest('input[type="date"]');if(!input)return;event.preventDefault();input.classList.add('app-date-input');openAppDatePicker(input);
});
document.addEventListener('keydown',event=>{
 const input=event.target.closest('input[type="date"]');if(input&&(event.key==='Enter'||event.key===' '||(event.altKey&&event.key==='ArrowDown'))){event.preventDefault();openAppDatePicker(input);}
});
const AS_JOB_STAGES=['제작 요청','도장 요청','납품 요청'];
const asJobState={item:null,busy:false};
function asJobEsc(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function asJobToday(){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());}
function asWorkflowDelayHtml(item,showDate=true){
 const due=item.deliveryAgreedDate;
 if(!due)return '<small class="as-job-due">일정 미협의</small>';
 const completed=item.deliveredDate||item.workflow?.stages?.['납품 요청']?.completedDate;
 const days=Math.round((Date.parse(completed||asJobToday())-Date.parse(due))/86400000);
 const label=item.status==='완료'?(completed?(days>0?days+'일 지연 완료':'기한 내 완료'):'완료'):(days>0?days+'일 지연':days===0?'오늘 납품':'D-'+(-days));
 return '<small class="as-job-due">'+(showDate?'납품 '+asJobEsc(due)+' · ':'')+(days>0?'<b>'+label+'</b>':label)+'</small>';
}
function openSelectedAsWorkflow(){const items=_getSelectedAsItems();if(!items)return;if(items.length!==1){showAlert('처리할 AS 건을 하나만 선택하세요.','warn');return;}openAsWorkflow(items[0]);}
function asJobCanEdit(item){return !String(item.id).startsWith('list-example-')&&currentUser&&(currentUser.role==='sysadmin'||currentUser.asReview||currentUser.asApprove||currentUser.name===item.createdBy);}
function asJobHistoryText(h){
 if(h.type==='deadline')return '납품 협의일: '+(h.previousDate?h.previousDate+' → ':'')+h.date;
 if(h.type==='schedule')return h.stage+' 일정: '+(h.previousDueDate? h.previousDueDate+' → ':'')+h.dueDate+' / 담당 '+h.owner;
 if(h.type==='complete')return h.stage+' 완료: '+h.completedDate;
 if(h.type==='skip')return h.stage+' 생략: '+h.reason;
 return h.from+' → '+h.to;
}
function asJobActionLabel(item){return ({'접수':'제작 요청','제작 요청':'제작 완료','도장 요청':'도장 완료','납품 요청':'납품 완료'})[item.status]||'완료';}
function asJobNext(item){return ({'접수':'제작 요청','제작 요청':'도장 요청','도장 요청':'납품 요청','납품 요청':'완료'})[item.status];}
function openAsWorkflow(item){
 if(asJobState.busy)return;
 asJobState.item=item;
 let dialog=document.getElementById('asJobDialog');
 if(!dialog){dialog=document.createElement('dialog');dialog.id='asJobDialog';dialog.className='as-job-dialog';dialog.setAttribute('aria-labelledby','asJobTitle');document.body.appendChild(dialog);dialog.addEventListener('cancel',e=>{if(asJobState.busy)e.preventDefault();});}
 const previousDate=item.workflow?.stages?.[AS_JOB_STAGES[AS_JOB_STAGES.indexOf(item.status)-1]]?.completedDate;
 const active=AS_JOB_STAGES.includes(item.status);
 const editable=asJobCanEdit(item)&&!!asJobNext(item);
 const missingDeadline=!item.deliveryAgreedDate;
 const legacyDeadline=missingDeadline&&!!item.legacyStatus;
 const label=asJobActionLabel(item);
 dialog.innerHTML='<header><h2 id="asJobTitle" tabindex="-1" autofocus>'+label+'</h2></header>'
 +(editable?'<form id="asJobForm" onsubmit="event.preventDefault();saveAsJob(&quot;advance&quot;)">'
 +(legacyDeadline?'<label>납품 협의일<input id="asJobLegacyDeadline" type="date" required></label>':missingDeadline?'<p class="as-job-note">접수 내용의 수정 화면에서 납품 협의일을 먼저 지정해주세요.</p>':'')
 +(active?'<label>'+(item.status==='납품 요청'?'실제 납품일':item.status.replace(' 요청','')+' 완료일')+'<input id="asJobCompleted" type="date" required'+(previousDate?' min="'+asJobEsc(previousDate)+'"':'')+' max="'+asJobToday()+'"></label>':'')
 +'<p id="asJobError" role="alert"></p><footer><button type="button" onclick="document.getElementById(&quot;asJobDialog&quot;).close()">취소</button><button type="submit" class="as-job-primary"'+(missingDeadline&&!legacyDeadline?' disabled':'')+'>'+(active?'완료하기':'요청하기')+'</button></footer></form>'
 :'<footer><button type="button" onclick="document.getElementById(&quot;asJobDialog&quot;).close()">닫기</button></footer>');
 if(!dialog.open)dialog.showModal();
}
async function saveAsJob(action){
 if(asJobState.busy)return;
 const item=asJobState.item,get=id=>document.getElementById(id)?.value||'';
 const payload={action,revision:item.workflow?.revision||0,next:asJobNext(item),completedDate:get('asJobCompleted'),completionNote:get('asJobCompletionNote')};
 if(!item.deliveryAgreedDate&&item.legacyStatus)payload.deliveryAgreedDate=get('asJobLegacyDeadline');
 const form=new FormData();form.append('payload',JSON.stringify(payload));
 const files=document.getElementById('asJobFiles')?.files||[];
 const error=document.getElementById('asJobError');
 if(files.length>10){error.textContent='첨부파일은 최대 10개입니다.';return;}
 for(const f of files)form.append('files',f);
 const dialog=document.getElementById('asJobDialog');asJobState.busy=true;dialog.querySelectorAll('button').forEach(b=>b.disabled=true);error.textContent='저장 중입니다.';
 try{
  const response=await fetch(`${SERVER}/api/as/${encodeURIComponent(item.id)}/workflow`,{method:'PATCH',body:form});
  const data=await response.json();if(!response.ok)throw new Error(data.error||'저장에 실패했습니다.');
  dialog.close();await loadAsList();
  if(typeof _viewerAsItem!=='undefined' && _viewerAsItem?.id===item.id)closeFileViewer();
  showToast({title:'저장 완료',message:'처리가 완료되었습니다.',type:'success'});
 }catch(e){error.textContent=e.message;}finally{asJobState.busy=false;dialog.querySelectorAll('button').forEach(b=>b.disabled=false);}
}
const asJobStyle=document.createElement('style');asJobStyle.textContent=`
.as-job-due{display:block;margin-top:5px;font-size:12px;color:#526174;white-space:nowrap}.as-job-due b{color:#ac3434}
.as-job-dialog{position:fixed;inset:0;margin:auto;box-sizing:border-box;width:min(340px,calc(100vw - 32px));height:fit-content;max-height:calc(100dvh - 32px);overflow:auto;padding:28px 0 0;border:0;border-radius:18px;background:var(--card,#fff);color:var(--text,#191f28);font-family:'Pretendard Variable',Pretendard,'Malgun Gothic',sans-serif;box-shadow:none}
.as-job-dialog::backdrop{background:rgba(15,23,42,.28)}
.as-job-dialog header{display:block;margin:0;padding:0 24px}
.as-job-dialog h2{margin:0;font-size:20px;font-weight:700;line-height:1.4;letter-spacing:-.03em;text-align:center;color:var(--text,#191f28);outline:none}
#asJobTitle:focus{outline:none!important;box-shadow:none!important}
.as-job-dialog form{margin:0;padding:0}
.as-job-dialog label{display:flex;flex-direction:column;gap:8px;margin:22px 24px 0;font-size:14px;font-weight:600;line-height:1.5;color:var(--text-body,#333d4b)}
.as-job-dialog input{box-sizing:border-box;display:block;width:100%;min-width:0;height:48px;padding:12px 14px;border:1px solid var(--border-strong,#e5e8eb);border-radius:var(--r-lg,12px);background:var(--surface-muted,#f9fafb);color:var(--text,#191f28);font:inherit;font-size:15px;font-weight:500;color-scheme:light}
.as-job-dialog footer{display:grid;grid-template-columns:1fr 1fr;gap:0;margin-top:28px;padding:0;border-top:1px solid var(--border-strong,#e5e8eb)}
.as-job-dialog footer>button:only-child{grid-column:1/-1}
.as-job-dialog button{box-sizing:border-box;min-width:0;height:54px;padding:0 16px;border:0;border-radius:0;background:var(--card,#fff);color:var(--text2,#6b7684);font:inherit;font-size:15px;font-weight:650;line-height:1;white-space:nowrap;cursor:pointer;box-shadow:none}
.as-job-dialog footer>button:not(:last-child){border-right:1px solid var(--border-strong,#e5e8eb)}
.as-job-dialog button:hover{background:var(--border-strong,#e5e8eb)}
.as-job-dialog .as-job-primary{background:var(--brand-softer,#f2f6fb);color:var(--brand,#004a93);font-weight:750}
.as-job-dialog .as-job-primary:hover{background:var(--brand-soft,#e6eef7)}
.as-job-dialog button:active:not(:disabled){filter:brightness(.97)}
.as-job-dialog button:disabled{opacity:.45;cursor:not-allowed}
.as-job-dialog button:focus-visible,.as-job-dialog input:focus-visible{outline:2px solid var(--brand,#004a93);outline-offset:-3px}
.as-job-dialog p{margin:16px 24px 0;font-size:13px;line-height:1.6}
#asJobError{color:var(--danger,#dc2626)}#asJobError:empty{display:none}
.as-job-dialog .as-job-note{color:var(--text2,#6b7684)}
@media(max-width:600px){.as-job-dialog input{font-size:16px}}
@media(max-width:380px){.as-job-dialog header{padding:0 20px}.as-job-dialog label,.as-job-dialog p{margin-left:20px;margin-right:20px}}
@media(prefers-reduced-motion:no-preference){.as-job-dialog[open]{animation:asJobEnter .16s ease-out}.as-job-dialog button{transition:background-color .15s,border-color .15s,transform .1s}@keyframes asJobEnter{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:translateY(0)}}}
`;document.head.appendChild(asJobStyle);
function asJobDocument(raw){
  const a=Object.fromEntries(Object.entries(raw).map(([key,value])=>[key,typeof value==='string'?asJobEsc(value):value]));
  const date=(a.createdAt||'').slice(0,10).replace(/-/g,'.');
  const asFiles=(raw.files||[]).map(f=>({...f,name:asJobEsc(f.name)}));
  const _statusColor='#555555',_statusLabel=a.status||'접수';
  return `<div class="page">
  ${asJobApprovalLine(raw)}
  <table class="info-table"><colgroup><col style="width:16%"><col style="width:34%"><col style="width:16%"><col style="width:34%"></colgroup><tbody><tr><th scope="row">호선</th><td>${a.ship||''}</td><th scope="row">블록</th><td>${a.block||''}</td></tr><tr><th scope="row">엘레멘트</th><td>${a.element||''}</td><th scope="row">자재코드</th><td>${a.materialCode||''}</td></tr><tr><th scope="row">자재명</th><td colspan="3">${a.product||''}</td></tr></tbody></table>
  <div class="section"><div class="section-head"><div class="section-label">사유</div></div><div class="section-body">${(a.reason||'').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</div></div>
  <div class="section"><div class="section-head"><div class="section-label">후속조치</div></div><div class="section-body">${(a.action||'').replace(/</g,'&lt;').replace(/>/g,'&gt;') || '&nbsp;'}</div></div>
  <div class="section"><div class="section-head"><div class="section-label">납품 협의일</div></div><div class="section-body compact">${a.deliveryAgreedDate||'미정'}</div></div>
  ${(a.remark||'') ? '<div class="section"><div class="section-head"><div class="section-label">비고</div></div><div class="section-body">'+(a.remark||'').replace(/</g,'&lt;').replace(/>/g,'&gt;')+'</div></div>' : ''}
  ${asFiles.length ? '<div class="section"><div class="section-head"><div class="section-label">첨부</div></div><div class="section-body compact" style="font-size:11px;color:#64748b;white-space:pre-line;line-height:2.1">별첨 참조 ('+asFiles.length+'건)\\n'+asFiles.map(f=>'  - '+f.name).join('\\n')+'</div></div>' : ''}
  <div class="section"><div class="section-head"><div class="section-label">처리 이력</div></div><div class="history-wrap"><div class="history-row head-row"><div class="history-cell stage head">단계</div><div class="history-cell name head">담당자</div><div class="history-cell dept head">부서 / 직급</div><div class="history-cell time head">일시</div></div><div class="history-row"><div class="history-cell stage">접수</div><div class="history-cell name">${a.createdBy||'-'}</div><div class="history-cell dept">${a.createdDept||''} ${a.createdPos||''}</div><div class="history-cell time">${a.createdAt ? a.createdAt.slice(0,10)+' '+a.createdAt.slice(11,16) : '-'}</div></div>${a.reviewer ? '<div class="history-row"><div class="history-cell stage">검토</div><div class="history-cell name">'+a.reviewer+'</div><div class="history-cell dept">'+(a.reviewerDept||'')+' '+(a.reviewerPos||'')+'</div><div class="history-cell time">'+(a.reviewedAt?a.reviewedAt.slice(0,10)+' '+a.reviewedAt.slice(11,16):'-')+'</div></div>' : ''}${a.approver ? '<div class="history-row"><div class="history-cell stage">승인</div><div class="history-cell name">'+a.approver+'</div><div class="history-cell dept">'+(a.approverDept||'')+' '+(a.approverPos||'')+'</div><div class="history-cell time">'+(a.approvedAt?a.approvedAt.slice(0,10)+' '+a.approvedAt.slice(11,16):'-')+'</div></div>' : ''}${a.completedBy ? '<div class="history-row"><div class="history-cell stage">완료</div><div class="history-cell name">'+a.completedBy+'</div><div class="history-cell dept">'+(a.completedDept||'')+' '+(a.completedPos||'')+'</div><div class="history-cell time">'+(a.completedAt?a.completedAt.slice(0,10)+' '+a.completedAt.slice(11,16):'-')+'</div></div>' : ''}</div></div>
  <div class="doc-footer">본 문서는 사내 A/S 관리 시스템에서 자동 생성되었습니다. &copy; ${new Date().getFullYear()}</div>
</div>`;
}
﻿function asJobApprovalLine(item){
 const slots=[{role:'접수',name:item.createdBy,date:item.createdAt,label:'접수'},
  ...AS_JOB_STAGES.map(stage=>{
   const record=item.workflow?.stages?.[stage];
   const completion=(item.workflow?.history||[]).filter(h=>h.type==='complete'&&h.stage===stage).at(-1);
   const date=record?.completedDate||completion?.completedDate;
   return {role:stage.replace(' 요청',' 완료'),label:stage.replace(' 요청',''),date,
    name:date?(record?.completedBy||completion?.by||''):''};
  })
 ];
 const e=asJobEsc;
 return '<table class="as-doc-approval" aria-label="결재선"><tbody><tr><th class="as-doc-approval-label" rowspan="3" scope="rowgroup">결재</th>'+slots.map(s=>'<th scope="col">'+e(s.role||'')+'</th>').join('')+'</tr><tr>'+slots.map(s=>'<td class="as-doc-signature">'+(s.date?'<span>'+e(s.label)+' 완료</span><time>'+e(s.date.slice(0,10))+'</time>':'')+'</td>').join('')+'</tr><tr>'+slots.map(s=>'<td class="as-doc-signer">'+e(s.name||'')+'</td>').join('')+'</tr></tbody></table>';
}
function getAsCssStr(){return getLegacyAsCssStr().replace(/#(?:1e293b|334155|475569|64748b|94a3b8|0f172a|f8fafc|d1d5db)/gi,color=>({'#1e293b':'#333333','#334155':'#444444','#475569':'#555555','#64748b':'#666666','#94a3b8':'#777777','#0f172a':'#333333','#f8fafc':'#f3f3f3','#d1d5db':'#222222'}[color.toLowerCase()]))+`
body{font-family:'Pretendard Variable',Pretendard,'Malgun Gothic','Apple SD Gothic Neo',sans-serif}
@media screen{.page{padding:0 12px 20px}}
.doc-title{color:#333333}
.doc-header{border-bottom-color:#222222}
.info-table td,.history-row:not(.head-row),.as-doc-signer{background:#ffffff}
.status-badge{background:#f3f3f3;color:#555555;border-color:#222222}
.info-table th{width:auto;white-space:normal;word-break:keep-all}
.info-table th,.info-table td{padding:10px 12px;vertical-align:middle}
.info-table td{overflow-wrap:anywhere;line-height:1.6}
.as-doc-approval{width:100%;border-collapse:separate;border-spacing:0;table-layout:fixed;margin:0 0 20px;border:1px solid #222222;border-radius:6px;overflow:hidden;color:#555555;font-size:13px;break-inside:avoid}
.as-doc-approval th,.as-doc-approval td{border:0;border-right:1px solid #222222;border-bottom:1px solid #222222;text-align:center;vertical-align:middle;padding:7px 3px;font-weight:400;overflow-wrap:anywhere}
.as-doc-approval th{background:#f3f3f3;height:30px}.as-doc-approval .as-doc-approval-label{width:72px;font-family:inherit;font-size:13px;font-weight:700;color:#555555;background:#f3f3f3}
.as-doc-approval .as-doc-signature{height:74px;background:#fff}.as-doc-signature span{display:block;color:#a53d43;font-size:11px;margin:4px 0 8px}.as-doc-signature time{display:block;font-size:11px;color:#555555;white-space:nowrap}
.as-doc-approval .as-doc-signer{height:30px;font-size:13px}
.as-doc-approval tr>:last-child{border-right:0}.as-doc-approval tr:last-child td,.as-doc-approval .as-doc-approval-label{border-bottom:0}
@media print{.as-doc-approval{break-inside:avoid}.as-doc-approval .as-doc-signature{height:20mm}}
`;}
