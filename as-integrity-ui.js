'use strict';
// Only opaque request keys and payload digests are retained, never form contents.
const asRequestMemory=new Map();
function asRequestStorage(scope){return 'as-write:'+String(currentUser?.id||'session')+':'+scope;}
async function asDigest(bytes){
  if(crypto.subtle)return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');
  // HTTP intranet compatibility: this is only a UI change detector, never authentication.
  // The server independently verifies a cryptographic hash before replaying any result.
  let a=2166136261,b=5381;for(const n of new Uint8Array(bytes)){a=Math.imul(a^n,16777619);b=Math.imul(b,33)^n;}
  return 'ui-'+(a>>>0).toString(16)+'-'+(b>>>0).toString(16)+'-'+bytes.byteLength;
}
async function asWrite(url,method,body,scope){
  const parts=[];
  if(body instanceof FormData){for(const [name,value] of body){parts.push([name,typeof value==='string'?value:{name:value.name,size:value.size,hash:await asDigest(await value.arrayBuffer())}]);}}
  else for(const name of Object.keys(body).sort())parts.push([name,body[name]]);
  const hash=await asDigest(new TextEncoder().encode(JSON.stringify([url,method,parts]))),storage=asRequestStorage(scope);
  let pending=asRequestMemory.get(storage);
  if(!pending){try{pending=JSON.parse(sessionStorage.getItem(storage)||'null');}catch{}}
  if(pending&&pending.hash!==hash){
    const status=await fetch(url.slice(0,url.indexOf('/api/as'))+'/api/as/requests/'+encodeURIComponent(pending.key),{credentials:'same-origin'});
    if(!status.ok)throw Error('이전 저장 결과를 확인하지 못했습니다. 연결을 확인하고 다시 시도하세요.');
    const {request}=await status.json();
    if(request){
      const message='이전 저장('+request.asNo+')은 완료되었습니다. 목록에서 확인할 수 있습니다. 현재 입력을 별도의 새 저장으로 처리할까요?';
      if(!await asConfirmWrite(message))throw Error('이전 저장은 완료되었습니다. 목록에서 확인하세요. 현재 입력은 추가 저장하지 않았습니다.');
      pending=null;
    }
    // If the first request is still running, retaining its key makes the first
    // committed payload win. Never create a second receipt to resolve uncertainty.
  }
  pending={hash,key:pending?.key||Array.from(crypto.getRandomValues(new Uint8Array(24)),n=>n.toString(16).padStart(2,'0')).join('')};
  asRequestMemory.set(storage,pending);try{sessionStorage.setItem(storage,JSON.stringify(pending));}catch{}
  const finish=typeof AsWriteProgress==='undefined'?()=>{}:AsWriteProgress.start(url,method);
  try{
    const response=await fetch(url,{method,credentials:'same-origin',headers:{'X-Requested-With':'process-server','Idempotency-Key':pending.key,...(body instanceof FormData?{}:{'Content-Type':'application/json'})},body:body instanceof FormData?body:JSON.stringify(body)});
    const data=await response.json();
    if(response.ok){asRequestMemory.delete(storage);try{sessionStorage.removeItem(storage);}catch{}}
    if(!response.ok)throw Error(data.error||'저장하지 못했습니다. 같은 내용으로 다시 시도하세요.');
    return data;
  }finally{await finish();}
}
function asRecordVersion(item){return item?.version??item?.workflow?.revision??0;}
function asConfirmWrite(message){
  return new Promise(resolve=>{
    const dialog=document.createElement('dialog');dialog.className='as-job-dialog';dialog.setAttribute('aria-label','이전 저장 결과 확인');
    const text=document.createElement('p');text.textContent=message;
    const footer=document.createElement('footer'),cancel=document.createElement('button'),save=document.createElement('button');
    cancel.textContent='취소';save.textContent='새 저장';save.className='as-job-primary';let confirmed=false;
    cancel.onclick=()=>dialog.close();save.onclick=()=>{confirmed=true;dialog.close();};footer.append(cancel,save);dialog.append(text,footer);
    dialog.addEventListener('close',()=>{dialog.remove();resolve(confirmed);},{once:true});document.body.append(dialog);dialog.showModal();cancel.focus();
  });
}
function asChangeReason(title){
  return new Promise(resolve=>{
    const dialog=document.createElement('dialog');dialog.className='as-job-dialog as-delete-dialog';dialog.setAttribute('aria-label',title);
    const header=document.createElement('header'),heading=document.createElement('h2');heading.textContent=title;header.append(heading);
    const form=document.createElement('form');
    const label=document.createElement('label');label.textContent='사유';const input=document.createElement('textarea');input.required=true;input.maxLength=500;input.rows=3;input.style.cssText='display:block;box-sizing:border-box;width:100%;padding:12px;border:1px solid var(--border-strong,#e5e8eb);border-radius:12px;font:inherit;resize:vertical';label.append(input);
    const confirm=document.createElement('button');confirm.type='submit';confirm.textContent='확인';confirm.className='as-job-primary';
    const cancel=document.createElement('button');cancel.type='button';cancel.textContent='취소';cancel.onclick=()=>dialog.close();
    let reason=null;form.onsubmit=e=>{e.preventDefault();if(!input.value.trim()){input.setCustomValidity('사유를 입력하세요.');input.reportValidity();return;}reason=input.value.trim();dialog.close();};input.oninput=()=>input.setCustomValidity('');
    const footer=document.createElement('footer');footer.append(cancel,confirm);form.append(label,footer);dialog.append(header,form);dialog.addEventListener('close',()=>{dialog.remove();resolve(reason);},{once:true});document.body.append(dialog);dialog.showModal();input.focus();
  });
}
