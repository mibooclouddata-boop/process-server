'use strict';
// The shared write path owns this indicator; it never invents a completion or timeout.
const AsWriteProgress=(()=>{
 const active=new Set();let dialog,slowTimer,returnFocus;
 const minimumVisibleMs=3000;
 function create(){
  if(dialog)return;
  const style=document.createElement('style');
  style.textContent=`
   #asWriteProgress{position:fixed;inset:0;margin:auto;box-sizing:border-box;width:min(340px,calc(100vw - 32px));height:fit-content;max-height:calc(100dvh - 32px);overflow:auto;padding:32px 24px;border:0;border-radius:18px;background:var(--card,#fff);color:var(--text,#191f28);font-family:'Pretendard Variable',Pretendard,'Malgun Gothic',sans-serif;text-align:center;box-shadow:none}
   #asWriteProgress::backdrop{background:rgba(15,23,42,.28)}
   #asWriteProgress h2{margin:20px 0 10px;font-family:inherit;font-size:20px;font-weight:700;line-height:1.4;letter-spacing:-.03em;outline:none}
   #asWriteProgress p{margin:0;font-family:inherit;font-size:15px;font-weight:500;line-height:1.6;letter-spacing:-.01em;color:var(--text2,#526174);word-break:keep-all}
   #asWriteProgress .as-write-ring{display:block;width:36px;height:36px;margin:0 auto;box-sizing:border-box;border:3px solid var(--border-strong,#e5e8eb);border-top-color:var(--brand,#0054a6);border-radius:50%;animation:asWriteSpin .8s linear infinite}
   @keyframes asWriteSpin{to{transform:rotate(360deg)}}
   @media(prefers-reduced-motion:reduce){#asWriteProgress .as-write-ring{animation:none}}
  `;
  document.head.append(style);
  dialog=document.createElement('dialog');dialog.id='asWriteProgress';
  dialog.setAttribute('aria-labelledby','asWriteProgressTitle');dialog.setAttribute('aria-describedby','asWriteProgressMessage');
  dialog.innerHTML='<span class="as-write-ring" aria-hidden="true"></span><h2 id="asWriteProgressTitle" tabindex="-1"></h2><p id="asWriteProgressMessage" role="status" aria-live="polite" aria-atomic="true"></p>';
  dialog.addEventListener('cancel',event=>event.preventDefault());
  document.body.append(dialog);
 }
 function start(url,method){
  create();const token={startedAt:performance.now()};active.add(token);
  if(active.size===1){
   returnFocus=document.activeElement;
   document.getElementById('asWriteProgressTitle').textContent=url.endsWith('/workflow')?'전산 처리 중':method==='DELETE'?'삭제 중':'저장 중';
   const message=document.getElementById('asWriteProgressMessage');message.textContent='처리가 완료될 때까지 잠시 기다려 주세요.';
   dialog.showModal();document.getElementById('asWriteProgressTitle').focus();
   slowTimer=setTimeout(()=>{if(active.size)message.textContent='응답이 지연되고 있습니다. 결과를 확인하고 있으니 잠시 기다려 주세요.';},8000);
  }
  let ended=false;
  return async()=>{
   if(ended)return;ended=true;
   // Only the presentation waits: the request starts immediately. A slow server
   // (including Supabase) must actually respond before this finish is called.
   const remaining=minimumVisibleMs-(performance.now()-token.startedAt);
   if(remaining>0)await new Promise(resolve=>setTimeout(resolve,remaining));
   active.delete(token);if(active.size)return;
   clearTimeout(slowTimer);
   if(dialog.open)dialog.close();
   const previous=returnFocus;returnFocus=null;
   // Callers re-enable their controls in finally, before the next frame.
   requestAnimationFrame(()=>{if(document.activeElement===document.body&&previous?.isConnected&&!previous.disabled&&previous.getClientRects().length)previous.focus();});
  };
 }
 return {start};
})();
