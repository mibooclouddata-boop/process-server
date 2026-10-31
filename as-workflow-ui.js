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
function asJobCanEdit(item){return !String(item.id).startsWith('list-example-')&&!!currentUser&&!!currentUser.id&&currentUser.active!==false&&!currentUser.passwordResetRequired&&['sysadmin','admin','worker'].includes(currentUser.role);}
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
 +(!active&&!missingDeadline?'<p class="as-job-request-message">접수 내용대로 제작을 요청합니다.</p>':'')
 +(active?'<label>'+(item.status==='납품 요청'?'실제 납품일':item.status.replace(' 요청','')+' 완료일')+'<input id="asJobCompleted" type="date" required'+(previousDate?' min="'+asJobEsc(previousDate)+'"':'')+' max="'+asJobToday()+'"></label>':'')
 +'<p id="asJobError" role="alert"></p><footer><button type="button" onclick="document.getElementById(&quot;asJobDialog&quot;).close()">취소</button><button type="submit" class="as-job-primary"'+(missingDeadline&&!legacyDeadline?' disabled':'')+'>'+(active?'완료하기':'요청하기')+'</button></footer></form>'
 :'<footer><button type="button" onclick="document.getElementById(&quot;asJobDialog&quot;).close()">닫기</button></footer>');
 if(!dialog.open)dialog.showModal();
}
async function saveAsJob(action){
 if(asJobState.busy)return;
 const item=asJobState.item,get=id=>document.getElementById(id)?.value||'';
  const payload={action,version:asRecordVersion(item),revision:item.workflow?.revision||0,next:asJobNext(item),completedDate:get('asJobCompleted'),completionNote:get('asJobCompletionNote')};
 if(!item.deliveryAgreedDate&&item.legacyStatus)payload.deliveryAgreedDate=get('asJobLegacyDeadline');
 const form=new FormData();form.append('payload',JSON.stringify(payload));
 const files=document.getElementById('asJobFiles')?.files||[];
 const error=document.getElementById('asJobError');
 if(files.length>10){error.textContent='첨부파일은 최대 10개입니다.';return;}
 for(const f of files)form.append('files',f);
 const dialog=document.getElementById('asJobDialog');asJobState.busy=true;dialog.querySelectorAll('button').forEach(b=>b.disabled=true);error.textContent='';
 try{
   await asWrite(`${SERVER}/api/as/${encodeURIComponent(item.id)}/workflow`,'PATCH',form,'workflow:'+item.id);
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
.as-job-dialog .as-job-request-message{display:flex;align-items:center;justify-content:center;min-height:77px;margin:22px 24px 0;font-size:14px;font-weight:600;line-height:1.5;color:var(--text-body,#333d4b)}
#asJobError{color:var(--danger,#dc2626)}#asJobError:empty{display:none}
.as-job-dialog .as-job-note{color:var(--text2,#6b7684)}
@media(max-width:600px){.as-job-dialog input{font-size:16px}}
@media(max-width:380px){.as-job-dialog header{padding:0 20px}.as-job-dialog label,.as-job-dialog p{margin-left:20px;margin-right:20px}}
@media(prefers-reduced-motion:no-preference){.as-job-dialog[open]{animation:asJobEnter .16s ease-out}.as-job-dialog button{transition:background-color .15s,border-color .15s,transform .1s}@keyframes asJobEnter{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:translateY(0)}}}
`;document.head.appendChild(asJobStyle);
function asJobDocument(raw){
 const e=asJobEsc, date=value=>e((value||'').slice(0,10).replace(/-/g,'.'));
 const section=(title,value)=>'<section class="section"><h3>'+title+'</h3><div class="section-body">'+e(value||'—')+'</div></section>';
 return '<article class="page"><header class="as-doc-header"><div class="as-doc-heading"><h1>A/S 접수서</h1><dl class="as-doc-details"><div><dt>접수번호</dt><dd>'+e(raw.asNo||'—')+'</dd></div><div><dt>접수일</dt><dd>'+(date(raw.createdAt)||'—')+'</dd></div><div><dt>납품 협의일</dt><dd>'+(date(raw.deliveryAgreedDate)||'미정')+'</dd></div></dl></div>'+asJobApprovalLine(raw)+'</header>'
 +'<section class="section"><h3>자재 정보</h3><table class="info-table"><colgroup><col style="width:12%"><col style="width:38%"><col style="width:12%"><col style="width:38%"></colgroup><tbody><tr><th scope="row">호선</th><td>'+e(raw.ship||'')+'</td><th scope="row">블록</th><td>'+e(raw.block||'')+'</td></tr><tr><th scope="row">엘레멘트</th><td>'+e(raw.element||'')+'</td><th scope="row">자재코드</th><td>'+e(raw.materialCode||'')+'</td></tr><tr><th scope="row">자재명</th><td colspan="3">'+e(raw.product||'')+'</td></tr></tbody></table></section>'
 +section('접수 사유',raw.reason)+section('후속조치',raw.action)+section('비고',raw.remark)
 +'<section class="section"><h3>첨부파일</h3><ul class="as-doc-files">'+((raw.files||[]).length?(raw.files||[]).map((f,i)=>'<li><span>'+String(i+1).padStart(2,'0')+'</span><span class="as-doc-file-name">'+e(f.name)+'</span><small>별첨</small></li>').join(''):'<li>첨부 없음</li>')+'</ul></section></article>';
}
function asJobApprovalLine(item){
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
 return '<table class="as-doc-approval" aria-label="스탬프 결재선"><thead><tr>'+slots.map(s=>'<th scope="col">'+e(s.role||'')+'</th>').join('')+'</tr></thead><tbody><tr>'+slots.map(s=>'<td class="as-doc-signature"><div class="as-doc-stamp-slot">'+(s.date?'<span class="as-doc-approval-stamp" aria-label="'+e(s.label)+' 완료">승인</span>':'')+'</div>'+(s.date?'<time datetime="'+e(s.date.slice(0,10))+'">'+e(s.date.slice(0,10).replace(/-/g,'.'))+'</time>':'<span class="as-doc-approval-date">—</span>')+'<span class="as-doc-signer">'+e(s.date?(s.name||'—'):'대기')+'</span></td>').join('')+'</tr></tbody></table>';
}
function getAsCssStr(){return `
@page{size:A4 portrait;margin:12mm}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Pretendard Variable',Pretendard,'Malgun Gothic',sans-serif;font-size:16px;line-height:1.65;color:#111;background:#eee;padding:28px 16px}
.page,.attach-page{width:100%;max-width:880px;margin:0 auto 28px;padding:38px 40px;background:#fff;border:1px solid #d1d1d1;overflow-wrap:anywhere}
.as-doc-header{display:grid;grid-template-columns:minmax(170px,1fr) minmax(0,420px);align-items:start;gap:24px;padding-bottom:22px;margin-bottom:24px;border-bottom:2px solid #111;break-inside:avoid}
.as-doc-heading{min-width:0}.as-doc-heading h1{font-size:28px;line-height:1.3;font-weight:700;letter-spacing:2px;color:#111}
.as-doc-details{display:grid;gap:7px;margin-top:16px}.as-doc-details>div{display:grid;grid-template-columns:78px minmax(0,1fr);gap:10px;align-items:baseline;line-height:1.6}.as-doc-details dt{font-size:13px;color:#222}.as-doc-details dd{font-size:14px;font-weight:650;font-variant-numeric:tabular-nums;min-width:0}
.as-doc-approval{width:100%;border-collapse:collapse;table-layout:fixed;break-inside:avoid}
.as-doc-approval th,.as-doc-approval td{border:1px solid #aaa;text-align:center;overflow-wrap:anywhere}
.as-doc-approval th{background:#f5f5f5;font-size:13px;font-weight:650;padding:7px 2px}
.as-doc-signature{padding:0 3px 10px;vertical-align:top}
.as-doc-stamp-slot{display:flex;align-items:center;justify-content:center;height:50px;margin:10px auto 8px}
.as-doc-approval-stamp{display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;width:50px;height:50px;border:2px solid #000;border-radius:50%;outline:1px solid #000;outline-offset:-5px;color:#000;font-size:18px;font-weight:750;line-height:1;letter-spacing:0;print-color-adjust:exact;-webkit-print-color-adjust:exact}
.as-doc-signature time,.as-doc-approval-date{display:block;font-size:12px;font-weight:600;line-height:1.5;font-variant-numeric:tabular-nums;color:#111}
.as-doc-signer{display:block;font-size:13px;font-weight:600;line-height:1.65;margin-top:5px;color:#111}
.section{margin-bottom:24px;break-inside:auto}.section:last-child{margin-bottom:0}.section h3{font-size:14px;font-weight:750;line-height:1.5;margin-bottom:10px;color:#111;break-after:avoid}
.info-table{width:100%;table-layout:fixed;border-collapse:collapse;break-inside:avoid}.info-table th,.info-table td{border:1px solid #bcbcbc;padding:12px;vertical-align:middle;overflow-wrap:anywhere}.info-table th{background:#f5f5f5;color:#333;font-size:13px;font-weight:550;text-align:left;white-space:normal}.info-table td{font-size:16px;font-weight:550;font-variant-numeric:tabular-nums}
.section-body{border:1px solid #bcbcbc;padding:16px 18px;min-height:60px;font-size:16px;line-height:1.65;white-space:pre-wrap;overflow-wrap:anywhere;orphans:3;widows:3}
.as-doc-files{list-style:none;border-top:1px solid #bcbcbc;font-size:13px;color:#333}.as-doc-files li{display:flex;gap:12px;align-items:baseline;padding:12px 0;border-bottom:1px solid #bcbcbc;break-inside:avoid}.as-doc-files li>span:first-child{flex-shrink:0;font-size:12px}.as-doc-file-name{min-width:0;overflow-wrap:anywhere}.as-doc-files small{margin-left:auto;flex-shrink:0;font-size:12px;white-space:nowrap}
.attach-label{font-size:18px;font-weight:700;border-bottom:1px solid #bcbcbc;margin-bottom:20px;padding-bottom:12px;text-align:center;letter-spacing:4px}.attach-body{display:flex;flex-direction:column;align-items:center}.attach-file{display:inline-block;max-width:100%;padding:5px 10px;margin:2px 4px 2px 0;border:1px solid #bcbcbc;background:#f5f5f5;font-size:13px}.img-wrap{max-width:100%;margin:14px 0;break-inside:avoid}.img-wrap img{display:block;max-width:100%;max-height:240mm;width:auto;height:auto;object-fit:contain;border:1px solid #bcbcbc}.img-caption{font-size:12px;color:#444;margin-top:6px;text-align:center}
@media screen and (max-width:760px){.page,.attach-page{padding:26px 22px}.as-doc-header{grid-template-columns:1fr;gap:22px}.as-doc-approval{max-width:420px;justify-self:end}.info-table th,.info-table td{padding:10px}}
@media screen and (max-width:460px){body{padding:12px 8px}.page,.attach-page{padding:24px 16px}.as-doc-header{gap:20px}.as-doc-approval th{font-size:12px}.as-doc-signature time,.as-doc-approval-date{font-size:11px}.as-doc-signer{font-size:12px}.info-table colgroup{display:none}.info-table tbody,.info-table tr{display:block}.info-table tr{display:grid;grid-template-columns:84px minmax(0,1fr)}.info-table th,.info-table td{display:block;margin-right:-1px;margin-bottom:-1px;min-width:0}.info-table th{display:flex;align-items:center}.section-body{padding:14px}.as-doc-files li{gap:8px}}
@media print{body{padding:0;background:#fff;font-size:12px}.page,.attach-page{width:100%;max-width:none;margin:0;padding:0;border:0;break-before:page;page-break-before:always}.page:first-child,.attach-page:first-child{break-before:auto;page-break-before:auto}.as-doc-header{grid-template-columns:minmax(150px,.9fr) minmax(0,1.3fr);gap:22px;padding-bottom:14px;margin-bottom:18px}.as-doc-heading h1{font-size:26px}.as-doc-details{margin-top:12px;gap:5px}.as-doc-details>div{grid-template-columns:64px minmax(0,1fr);gap:8px}.as-doc-details dt,.as-doc-details dd{font-size:11px}.as-doc-approval th{font-size:11px;padding:6px 2px}.as-doc-stamp-slot{height:46px;margin:8px auto 6px}.as-doc-approval-stamp{width:46px;height:46px;font-size:16px}.as-doc-signature{padding-bottom:8px}.as-doc-signature time,.as-doc-approval-date,.as-doc-signer{font-size:11px}.section{margin-bottom:16px}.section h3{font-size:12px;margin-bottom:8px}.info-table th,.info-table td{padding:8px;font-size:12px}.section-body{padding:10px 12px;min-height:0;font-size:12px}.as-doc-files{font-size:12px}.as-doc-files li{padding:8px 0}.attach-file,.img-caption{font-size:11px}.img-wrap img{max-height:240mm}*{print-color-adjust:exact;-webkit-print-color-adjust:exact}}
`;}
