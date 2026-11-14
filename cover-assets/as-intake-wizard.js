'use strict';
(() => {
 const modal=document.getElementById('asModal');
 if(!modal)return;
 const box=modal.querySelector('.modal-box'),body=modal.querySelector('.modal-body'),footer=modal.querySelector('.modal-footer');
 const byId=id=>document.getElementById(id),field=id=>byId(id).closest('.modal-field');
 const originalOpen=window.openAsModal,originalClose=window.closeAsModal,originalSubmit=window.submitAs;
 let step=0,returnFocus=null;
 const names=['기본 정보','접수 내용','금액·첨부'];
 const titles=['AS가 필요한 자재를 알려주세요.','어떤 문제가 발생했나요?','관련 금액과 자료를 첨부해 주세요.'];
 const descriptions=['자재명과 코드, 호선·블록·엘레멘탈을 입력해 주세요.','발생 사유와 처리 방법, 상세 내용을 입력해 주세요.','금액과 현장 사진, 도면, 이체 영수증을 추가해 주세요.'];
 modal.classList.add('as-intake-wizard');modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');modal.setAttribute('aria-labelledby','asModalTitle');
 const nav=document.createElement('ol');nav.id='asIntakeSteps';nav.setAttribute('aria-label','AS 접수 단계');
 nav.innerHTML=names.map((name,i)=>`<li><button type="button" data-intake-step="${i}"><span>${i+1}</span>${name}</button></li>`).join('');
 box.insertBefore(nav,body);
 const heading=document.createElement('div');heading.className='as-wizard-heading';
 heading.innerHTML='<h4 id="asIntakeHeading" tabindex="-1"></h4><p id="asIntakeDescription"></p>';
 const panels=names.map((name,i)=>{const panel=document.createElement('section');panel.dataset.intakePanel=i;panel.setAttribute('aria-label',name);return panel;});
 body.append(...panels);
 const material=body.querySelector('.as-intake-section');
 const category=byId('asCategory');category.hidden=true;
 const choices=document.createElement('fieldset');choices.id='asCategoryChoices';choices.setAttribute('aria-label','구분');
 choices.innerHTML=['사내','사외','기타'].map(value=>`<label${value==='기타'?' hidden':''}><input type="radio" name="asIntakeCategory" value="${value}"${value==='기타'?' hidden':''}><span>${value}</span></label>`).join('');
 field('asCategory').append(choices);
 field('asCategory').querySelector('label').hidden=true;
 panels[0].append(field('asCategory'),material.querySelector('.as-intake-material'),material.querySelector('.as-intake-location'));
 field('asElement').querySelector('label').textContent='엘레멘탈';
 byId('asElement').placeholder='엘레멘탈 입력';
 byId('asShip').placeholder='호선 입력';byId('asBlock').placeholder='블록 입력';
 field('asReasonSelect').querySelector('label').textContent='발생 사유';
 byId('asReasonSelect').setAttribute('aria-required','true');
 field('asActionSelect').querySelector('label').textContent='처리 방법';
 byId('asReasonSelect').options[0].textContent='발생 사유 선택';
 byId('asActionSelect').options[0].textContent='처리 방법 선택';
 byId('asAction').placeholder='처리할 방법을 입력하세요';
 field('asRemark').querySelector('label').textContent='상세 내용';
 byId('asRemark').placeholder='불량 상태, 수량, 현장 요청사항 등을 입력하세요';
 for(const id of ['asShip','asBlock']){
  const label=field(id).querySelector('label');label.textContent=label.textContent.replace(/\s*\*$/,'');
  const required=document.createElement('small');required.textContent='필수';label.append(required);byId(id).setAttribute('aria-required','true');
 }
 const actionRow=document.createElement('div');actionRow.className='modal-row as-wizard-action-row';actionRow.append(field('asActionSelect'),field('asDeliveryAgreedDate'));
 panels[1].append(field('asReasonSelect'),actionRow,field('asRemark'));
 const attachments=field('asFiles');panels[2].append(field('asAmount'),attachments);
 const fileInput=byId('asFiles'),oldPicker=fileInput.closest('label'),picker=document.createElement('div');picker.className='as-wizard-file-picker';
 const attachmentLabel=attachments.querySelector('label');attachmentLabel.textContent='첨부';
 const fileButton=document.createElement('button');fileButton.type='button';fileButton.id='asFileUpload';attachmentLabel.htmlFor=fileButton.id;
 fileButton.innerHTML='<span class="as-upload-caption"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V3m-4 4 4-4 4 4M4 15v5a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-5"/></svg><span>파일 업로드</span></span><span class="as-upload-limit">파일당 최대 20MB · 최대 10개</span>';
 fileButton.setAttribute('aria-label','파일 업로드');fileButton.querySelector('.as-upload-limit').id='asUploadLimit';fileButton.setAttribute('aria-describedby','asUploadLimit');
 fileButton.addEventListener('click',()=>{if(!asSaving&&!fileInput.disabled)fileInput.click();});
 oldPicker.replaceWith(picker);picker.append(fileButton,fileInput);
 body.replaceChildren(heading,...panels,byId('asStatus'));
 byId('asAmountHint').textContent='';byId('asAmountHint').hidden=true;
 const submit=footer.querySelector('[onclick="submitAs()"]');submit.id='asIntakeNext';
 const cancel=footer.querySelector('[onclick="closeAsModal()"]');cancel.id='asIntakeCancel';
 const message=byId('asModalMsg');message.setAttribute('role','alert');message.setAttribute('aria-live','polite');
 const deliveryDate=byId('asDeliveryAgreedDate'),dateControl=document.createElement('div'),clearDate=document.createElement('button');
 dateControl.className='as-date-control';deliveryDate.before(dateControl);dateControl.append(deliveryDate);
 clearDate.type='button';clearDate.className='as-date-clear';clearDate.textContent='×';clearDate.setAttribute('aria-label','납품 협의일 지우기');dateControl.append(clearDate);
 function syncDateClear(){clearDate.hidden=!deliveryDate.value||deliveryDate.disabled||deliveryDate.readOnly;}
 clearDate.addEventListener('click',()=>{
  if(deliveryDate.disabled||deliveryDate.readOnly||asSaving)return;
  deliveryDate.value='';deliveryDate.dispatchEvent(new Event('input',{bubbles:true}));deliveryDate.dispatchEvent(new Event('change',{bubbles:true}));deliveryDate.focus();
 });
 deliveryDate.addEventListener('input',syncDateClear);deliveryDate.addEventListener('change',syncDateClear);
 function updateAction(){
  const hint=byId('asDeliveryAgreedDateHint'),date=byId('asDeliveryAgreedDate'),onSite=byId('asActionSelect').value==='현장 시수';
  hint.textContent='';hint.hidden=true;date.disabled=onSite;date.closest('.modal-field').classList.toggle('as-date-inactive',onSite);
  if(onSite)date.removeAttribute('aria-invalid');
  syncDateClear();
 }
 function paint(focus=false){
  byId('asIntakeHeading').textContent=titles[step];byId('asIntakeDescription').textContent=descriptions[step];
  panels.forEach((panel,i)=>panel.hidden=i!==step);
  nav.querySelectorAll('button').forEach((button,i)=>{if(i===step)button.setAttribute('aria-current','step');else button.removeAttribute('aria-current');});
  submit.textContent=['다음','다음','저장'][step];body.scrollTop=0;
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
  updateAction();paint();byId('asProduct').focus({preventScroll:true});
 };
 window.closeAsModal=function(){if(asSaving)return;originalClose();if(returnFocus?.isConnected)returnFocus.focus({preventScroll:true});};
 window.submitAs=async function(){
  if(asSaving||!validate())return;
  if(step<2){step++;message.textContent='';paint(true);return;}
  // Keep the original API, attachment list, permissions, versioning and retry identity.
  await originalSubmit();
 };
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
