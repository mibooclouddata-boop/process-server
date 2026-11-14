'use strict';
(() => {
 const modal=document.getElementById('asModal');
 if(!modal)return;
 const box=modal.querySelector('.modal-box'),body=modal.querySelector('.modal-body'),footer=modal.querySelector('.modal-footer');
 const byId=id=>document.getElementById(id),field=id=>byId(id).closest('.modal-field');
 const originalOpen=window.openAsModal,originalClose=window.closeAsModal,originalSubmit=window.submitAs;
 let step=0,returnFocus=null;
 const names=['자재 · 위치','접수 내용','금액 · 첨부'];
 const titles=['자재 정보','접수 내용','금액 및 첨부'];
 const descriptions=['사내·사외를 선택하고 AS가 발생한 위치를 입력하세요.','발생 사유와 처리할 내용을 입력하세요.','확인된 금액과 관련 자료를 추가하세요.'];
 modal.classList.add('as-intake-wizard');modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');modal.setAttribute('aria-labelledby','asModalTitle');
 const identity=document.createElement('div');
 const subtitle=document.createElement('p');subtitle.className='as-wizard-identity';subtitle.textContent='자재 정보 · 접수 내용 · 금액 및 첨부';
 identity.append(byId('asModalTitle'),subtitle);modal.querySelector('.modal-header').prepend(identity);
 const nav=document.createElement('ol');nav.id='asIntakeSteps';nav.setAttribute('aria-label','AS 접수 단계');
 nav.innerHTML=names.map((name,i)=>`<li><button type="button" data-intake-step="${i}"><span>${i+1}</span>${name}</button></li>`).join('');
 box.insertBefore(nav,body);
 const heading=document.createElement('div');heading.className='as-wizard-heading';
 heading.innerHTML='<h4 id="asIntakeHeading" tabindex="-1"></h4><p id="asIntakeDescription"></p>';
 const panels=names.map((name,i)=>{const panel=document.createElement('section');panel.dataset.intakePanel=i;panel.setAttribute('aria-label',name);return panel;});
 body.append(...panels);
 const group=(title,nodes)=>{const section=document.createElement('section');section.className='as-wizard-group';if(title){const h=document.createElement('h4');h.textContent=title;section.append(h);}section.append(...nodes);return section;};
 const material=body.querySelector('.as-intake-section');
 const category=byId('asCategory');category.hidden=true;
 const choices=document.createElement('fieldset');choices.id='asCategoryChoices';choices.setAttribute('aria-label','구분');
 choices.innerHTML=['사내','사외','기타'].map(value=>`<label${value==='기타'?' hidden':''}><input type="radio" name="asIntakeCategory" value="${value}"${value==='기타'?' hidden':''}><span>${value}</span></label>`).join('');
 field('asCategory').append(choices);
 panels[0].append(group('',[field('asCategory')]),group('정보',[material.querySelector('.as-intake-location')]),group('대상 자재',[material.querySelector('.as-intake-material')]));
 field('asElement').querySelector('label').textContent='엘레멘탈';
 byId('asElement').placeholder='엘레멘탈';
 const actionRow=document.createElement('div');actionRow.className='modal-row as-wizard-action-row';actionRow.append(field('asActionSelect'),field('asDeliveryAgreedDate'));
 panels[1].append(field('asReasonSelect'),actionRow,field('asRemark'));
 const attachments=field('asFiles');panels[2].append(field('asAmount'),attachments);
 body.replaceChildren(heading,...panels,byId('asStatus'));
 byId('asAmountHint').textContent='금액을 입력하는 경우 이체 영수증을 첨부하세요.';
 const progress=document.createElement('span');progress.id='asIntakeProgress';footer.prepend(progress);
 const previous=document.createElement('button');previous.type='button';previous.id='asIntakePrevious';previous.className='admin-btn admin-btn-secondary';previous.textContent='이전';
 const submit=footer.querySelector('[onclick="submitAs()"]');submit.id='asIntakeNext';footer.insertBefore(previous,submit);
 const cancel=footer.querySelector('[onclick="closeAsModal()"]');
 const message=byId('asModalMsg');message.setAttribute('role','alert');message.setAttribute('aria-live','polite');
 function updateAction(){byId('asDeliveryAgreedDateHint').textContent=byId('asActionSelect').value==='현장 시수'?'현장 시수는 납품 협의일을 입력하지 않아도 됩니다.':'미정이면 비워두고 제작 요청 전에 지정하세요.';}
 function paint(focus=false){
  panels.forEach((panel,i)=>panel.hidden=i!==step);
  nav.querySelectorAll('button').forEach((button,i)=>{if(i===step)button.setAttribute('aria-current','step');else button.removeAttribute('aria-current');});
  byId('asIntakeHeading').textContent=titles[step];byId('asIntakeDescription').textContent=descriptions[step];
  progress.textContent=`${step+1} / 3 단계`;previous.hidden=step===0;cancel.hidden=step>0;
  submit.textContent=['접수 내용으로','금액·첨부로','저장'][step];body.scrollTop=0;
  if(focus)byId('asIntakeHeading').focus({preventScroll:true});
 }
 function invalid(id,text){const input=byId(id);input.setAttribute('aria-invalid','true');message.className='modal-msg error';message.textContent=text;input.focus();return false;}
 function validate(){
  if(step===0){
   if(!['사내','사외','기타'].includes(category.value))return invalid('asShip','구분을 선택하세요.');
   if(!byId('asShip').value.trim())return invalid('asShip','호선을 입력하세요.');
   if(!byId('asBlock').value.trim())return invalid('asBlock','블록을 입력하세요.');
  }
  if(step===1){
   if(!byId('asReasonSelect').value)return invalid('asReasonSelect','사유를 선택하세요.');
   if(byId('asReasonSelect').value==='기타'&&!byId('asReason').value.trim())return invalid('asReason','기타 사유를 입력하세요.');
   if(byId('asActionSelect').value==='기타'&&!byId('asAction').value.trim())return invalid('asAction','기타 후속조치를 입력하세요.');
   if(!byId('asDeliveryAgreedDate').checkValidity())return invalid('asDeliveryAgreedDate','납품 협의일을 올바르게 입력하세요.');
  }
  return true;
 }
 window.openAsModal=function(item){
  if(asSaving)return;
  returnFocus=document.activeElement;originalOpen(item);
  if(!modal.classList.contains('open'))return;
  step=0;message.textContent='';modal.querySelectorAll('[aria-invalid]').forEach(input=>input.removeAttribute('aria-invalid'));
  choices.querySelectorAll('input').forEach(input=>{input.checked=input.value===category.value;input.hidden=input.value==='기타'&&category.value!=='기타';input.closest('label').hidden=input.hidden;});
  updateAction();paint();byId('asShip').focus({preventScroll:true});
 };
 window.closeAsModal=function(){if(asSaving)return;originalClose();if(returnFocus?.isConnected)returnFocus.focus({preventScroll:true});};
 window.submitAs=async function(){
  if(asSaving||!validate())return;
  if(step<2){step++;message.textContent='';paint(true);return;}
  // Keep the original API, attachment list, permissions, versioning and retry identity.
  await originalSubmit();
 };
 previous.addEventListener('click',()=>{if(asSaving)return;step--;message.textContent='';paint(true);});
 nav.addEventListener('click',event=>{const button=event.target.closest('button');if(!button||asSaving)return;const target=Number(button.dataset.intakeStep);if(target<=step||(target===step+1&&validate())){step=target;message.textContent='';paint(true);}});
 choices.addEventListener('change',event=>{if(event.target.matches('input'))category.value=event.target.value;});
 byId('asActionSelect').addEventListener('change',updateAction);
 modal.addEventListener('input',event=>{event.target.removeAttribute('aria-invalid');message.textContent='';});
 modal.addEventListener('keydown',event=>{
  if(event.key==='Escape'){event.preventDefault();window.closeAsModal();}
  if(event.key==='Enter'&&!event.isComposing&&event.target.matches('input:not([type=file]):not([type=radio]):not([type=date])')){event.preventDefault();void window.submitAs();}
  if(event.key==='Tab'){
   const visible=[...modal.querySelectorAll('button,input,select,textarea')].filter(el=>!el.disabled&&el.getClientRects().length);
   const first=visible[0],last=visible.at(-1);
   if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
  }
 });
 paint();
})();
