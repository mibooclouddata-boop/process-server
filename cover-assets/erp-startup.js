(() => {
 'use strict';
 const link=document.querySelector('.story .enter');
 if(!link)return;
 const desktop=document.body.dataset.desktopStartup==='true';
 const destination=new URL(link.getAttribute('href'),location.href);
 const action=document.createElement('button');
 action.type='button';action.id='action';action.className='enter startup-action';
 const label=document.createElement('span');label.className='action-label';label.textContent='업무시스템 접속';
 const progress=document.createElement('progress');progress.max=100;progress.hidden=true;progress.setAttribute('aria-label','업데이트 다운로드');
 const dots=document.createElement('span');dots.className='startup-dots';dots.hidden=true;dots.setAttribute('aria-hidden','true');
 for(let i=0;i<3;i++)dots.append(document.createElement('i'));
 action.append(progress,label,dots);link.replaceWith(action);
 const status=document.createElement('p');status.id='connection-status';status.className='startup-status';status.setAttribute('role','status');status.setAttribute('aria-live','polite');status.hidden=true;
 action.after(status);
 const minimumConnectionMs=5000;
 const waitForConnection=()=>new Promise(resolve=>setTimeout(resolve,minimumConnectionMs));
 let checkingStarted=performance.now(),stateTimer;
 let next='desktop-update-check';
 const updatePending='erp-update-access-pending';
 function pendingAccess(value){
  try{
   if(value===true)localStorage.setItem(updatePending,'true');
   if(value===false)localStorage.removeItem(updatePending);
   return localStorage.getItem(updatePending)==='true';
  }catch{return false;}
 }
 function busy(text,updating=false){label.textContent=text;action.disabled=true;action.setAttribute('aria-busy','true');action.classList.add('is-loading');action.classList.toggle('is-connecting',!updating);dots.hidden=!updating;progress.hidden=updating;progress.removeAttribute('value');}
 function ready(text){label.textContent=text;action.disabled=false;action.setAttribute('aria-busy','false');action.classList.remove('is-loading','is-connecting');progress.hidden=true;dots.hidden=true;}
 function connecting(){busy('업무시스템 접속 중',true);progress.hidden=true;}
 window.renderUpdate=data=>{
  clearTimeout(stateTimer);
  if(data.state==='checking')checkingStarted=performance.now();
  const remaining=minimumConnectionMs-(performance.now()-checkingStarted);
  if(['ready','available'].includes(data.state)&&remaining>0){
   stateTimer=setTimeout(()=>renderUpdateNow(data),remaining);return;
  }
  renderUpdateNow(data);
 };
 const renderUpdateNow=data=>{
  status.hidden=true;status.textContent='';
  busy('업무시스템 접속 중');
  if(data.state==='ready'){
   ready('업무시스템 접속');next='desktop-access';pendingAccess(false);
  }else if(data.state==='connecting'){
   connecting();
  }else if(data.state==='available'){
   ready('업데이트 시작');next='desktop-update-install';
  }else if(data.state==='downloading'){
   busy('업데이트 설치 중',true);
   if(data.total>0)progress.value=Math.max(0,Math.min(100,Math.floor(data.downloaded/data.total*100)));
  }else if(data.state==='installing'){
   busy('업데이트 설치 중',true);
  }else if(data.state==='error'){
   if(next==='desktop-update-install')pendingAccess(false);
   ready('다시 시도');next='desktop-update-check';status.hidden=false;status.textContent=data.message;
  }
 };
 const emit=async event=>{
  if(event==='desktop-update-install')pendingAccess(true);
  if(event==='desktop-access')connecting();
  else busy(event==='desktop-update-install'?'업데이트 설치 중':'업무시스템 접속 중',event==='desktop-update-install');
  try{if(event==='desktop-access')await waitForConnection();await window.__TAURI_INTERNALS__.invoke('plugin:event|emit',{event:event==='desktop-access'?'desktop-update-check':event,payload:null});}
  catch{window.renderUpdate({state:'error',message:'연결을 시작하지 못했습니다. 다시 시도해 주세요.'});}
 };
 action.addEventListener('click',async()=>{
  if(action.disabled)return;
  if(desktop){await emit(next);return;}
  connecting();status.hidden=true;
  try{
   const [response]=await Promise.all([fetch(destination,{method:'HEAD',cache:'no-store',credentials:'same-origin',signal:AbortSignal.timeout(10000)}).catch(()=>null),waitForConnection()]);
   if(!response?.ok)throw Error('Server unavailable');
   location.assign(destination.href);
  }catch{ready('다시 시도');status.hidden=false;status.textContent='업무시스템에 연결할 수 없습니다. 서버 연결을 확인한 뒤 다시 시도해 주세요.';}
 });
 if(desktop){window.renderUpdate({state:'checking'});emit('desktop-update-check');}
})();
