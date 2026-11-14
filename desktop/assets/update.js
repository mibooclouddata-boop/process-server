(() => {
 const heading=document.querySelector('#heading'),status=document.querySelector('#connection-status'),action=document.querySelector('#action'),notes=document.querySelector('#notes'),progress=document.querySelector('progress');
 let next='desktop-update-check';
 window.renderUpdate = data => {
  action.disabled=true;progress.hidden=true;
  if(data.state==='available'){
   heading.textContent='업데이트가 필요합니다';document.querySelector('#version').textContent=`v${data.current} → v${data.version}`;
   status.textContent='최신 버전으로 업데이트한 뒤 ERP를 사용할 수 있습니다.';
   notes.textContent=data.notes||'안정성과 사용성을 개선했습니다.';notes.hidden=false;
   action.textContent='업데이트 시작';next='desktop-update-install';action.disabled=false;
  }else if(data.state==='downloading'){
   heading.textContent='업데이트 다운로드 중';progress.hidden=false;
   if(data.total){const pct=Math.min(100,Math.floor(data.downloaded/data.total*100));progress.value=pct;status.textContent=`${pct}% 다운로드했습니다.`;}else{progress.removeAttribute('value');status.textContent='설치 파일을 다운로드하고 있습니다.';}
   action.textContent='다운로드 중…';
  }else if(data.state==='installing'){
   heading.textContent='업데이트 설치 중';status.textContent='서명을 확인했습니다. 잠시 후 앱이 다시 실행됩니다.';action.textContent='설치 중…';
  }else if(data.state==='error'){
   heading.textContent='업데이트를 완료하지 못했습니다';status.textContent=data.message;action.textContent='다시 시도';next='desktop-update-check';action.disabled=false;
  }else if(data.state==='connecting'){
   heading.textContent='ERP에 연결 중';status.textContent='최신 버전입니다. 서버에 연결하고 있습니다.';action.textContent='연결 중…';
  }else{
   heading.textContent='업데이트 확인 중';status.textContent='최신 버전을 확인하고 있습니다.';action.textContent='확인 중…';
  }
 };
 const emit=async event=>{action.disabled=true;try{await window.__TAURI_INTERNALS__.invoke('plugin:event|emit',{event,payload:null});}catch{window.renderUpdate({state:'error',message:'업데이트를 시작하지 못했습니다. 다시 시도해 주세요.'});}};
 action.addEventListener('click',()=>emit(next));
 emit('desktop-update-check');
})();
