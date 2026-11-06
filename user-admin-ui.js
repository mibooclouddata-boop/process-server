'use strict';
const userAdmin={users:[],editing:null,busy:false,baseline:'',page:1,selected:new Set(),visibleIds:[],tab:'info',pending:{},inflight:{},saving:null,failed:false,invalid:null,loadSequence:0};
const userEl=id=>document.getElementById(id);
const userRoles={sysadmin:'시스템 관리자',admin:'관리자',worker:'작업자'};
const userStatuses={active:'활성화',suspended:'비활성화'};
const userAsPermissions={create:'AS 접수',production:'제작 완료',painting:'도장 완료',delivery:'납품 완료'};
function paintUserPermissions(user){
 const container=userEl('userPermissionChoices');
 if(!container.childElementCount)for(const [key,title] of Object.entries(userAsPermissions)){
  const label=document.createElement('label'),copy=document.createElement('span'),name=document.createElement('strong'),description=document.createElement('small'),input=document.createElement('input');
  label.className='user-permission-option';name.textContent=title;description.textContent=({create:'접수 등록·수정·삭제와 제작 요청',production:'제작 완료 처리 및 도장 단계로 이동',painting:'도장 완료 처리 및 납품 단계로 이동',delivery:'납품 완료 처리'})[key];copy.append(name,description);
  input.type='checkbox';input.dataset.asPermission=key;input.setAttribute('aria-label',title+' 권한');input.onchange=()=>{const current=desiredAdminUser();if(!current||current.role==='sysadmin'||userAdmin.busy||userAdmin.failed)return;const values=current.asPermissions||[];queueUserChange({asPermissions:Object.keys(userAsPermissions).filter(value=>value===key?input.checked:values.includes(value))});};label.append(copy,input);container.append(label);
 }
 for(const input of container.querySelectorAll('input')){input.checked=user.role==='sysadmin'||(user.asPermissions||[]).includes(input.dataset.asPermission);input.disabled=!userAdmin.editing||user.role==='sysadmin'||userAdmin.busy||userAdmin.failed;}
 userEl('userPermissionsHint').textContent=user.role==='sysadmin'?'시스템 관리자는 모든 AS 권한을 가집니다.':user.active===false?'비활성화된 계정은 권한을 부여해도 작업할 수 없습니다.':'체크한 AS 작업만 수행할 수 있습니다. 변경은 즉시 저장됩니다.';
}
function normalizeAdminUser(user){return {...user,status:user.active===false?'suspended':'active'};}
function userLoginId(user){return user.loginId||user.id;}
async function userApi(url,options){const response=await fetch(url,options);let data;try{data=await response.json();}catch{throw Error('서버 응답을 확인할 수 없습니다. 최신 정보를 다시 불러오세요.');}if(!response.ok){const error=Error(data.error||'처리하지 못했습니다. 다시 시도하세요.');error.status=response.status;throw error;}return data;}
const userBasicFields={modalUserName:'name',modalUserDept:'department',modalUserPos:'position',modalUserRole:'role'};
function desiredAdminUser(){return userAdmin.editing?{...userAdmin.editing,...userAdmin.inflight,...userAdmin.pending}:null;}
function userSelf(user){return !!user&&user.id===currentUser?.id;}
function userForm(){const data={id:userEl('modalUserId').value.trim(),name:userEl('modalUserName').value.trim(),role:userEl('modalUserRole').value,department:userEl('modalUserDept').value.trim(),position:userEl('modalUserPos').value.trim()};if(!userAdmin.editing&&userEl('modalUserPw').value)data.password=userEl('modalUserPw').value;return data;}
function showModalMsg(text){const el=userEl('modalMsg');el.textContent=text;el.className='modal-msg error';el.setAttribute('role','alert');}
function openUserModal(user){
 if(userAdmin.busy||userAdmin.saving)return;setupUserModal();userAdmin.editing=user?{...user,allowedSteps:[...(user.allowedSteps||[])]}:null;userAdmin.pending={};userAdmin.inflight={};userAdmin.failed=false;userAdmin.invalid=null;userAdmin.tab='info';userAdmin.createStep=0;clearUserCreateErrors();
 for(const [id,key] of Object.entries({modalUserId:'id',modalUserName:'name',modalUserDept:'department',modalUserPos:'position'}))userEl(id).value=user?(key==='id'?userLoginId(user):user[key]||''):'';
 userEl('modalUserId').disabled=!!user;userEl('modalUserPw').value='';userEl('userReplacementPassword').value='';userEl('modalUserRole').value=user?.role||'worker';userEl('modalMsg').textContent='';userEl('modalMsg').className='modal-msg';userEl('userErrorName').textContent='';userEl('modalUserName').removeAttribute('aria-invalid');userEl('userIdHint').textContent=user?'이력 연결을 위해 기존 아이디는 변경할 수 없습니다.':'영문·숫자·마침표·밑줄·하이픈, 최대 64자';
 for(const detail of document.querySelectorAll('#userModal details'))detail.open=false;
 userEl('modalUserPw').type='password';userEl('userCreatePasswordToggle').setAttribute('aria-label','비밀번호 보기');userEl('userCreatePasswordToggle').setAttribute('aria-pressed','false');
 userEl('userSaveStatus').textContent=user?'변경 즉시 저장 · 본인 계정 수정 후 다시 로그인':'마지막 단계에서 사용자 등록을 누르면 저장됩니다.';paintUserModal();selectUserModalTab('info',false);userAdmin.baseline=JSON.stringify(userForm());if(!userEl('userModal').open)userEl('userModal').showModal();userEl(user?'userTabInfo':'modalUserName').focus({preventScroll:true});
}
async function closeUserModal(force=false){if(userAdmin.busy&&!userAdmin.saving)return;if(!force){if(userAdmin.editing){const active=document.activeElement;if(active?.dataset.userField&&!commitUserField(active))return;await flushUserChanges();if(userAdmin.failed&&!confirm('서버에 반영하지 못한 변경을 버리고 닫으시겠습니까?'))return;if(userAdmin.invalid){userEl(userAdmin.invalid).focus();return;}}else if(JSON.stringify(userForm())!==userAdmin.baseline&&!confirm('입력한 사용자 정보를 버리고 닫으시겠습니까?'))return;}userEl('userModal').close();userEl('modalUserPw').value='';userAdmin.editing=null;userAdmin.pending={};userAdmin.inflight={};userAdmin.failed=false;userAdmin.invalid=null;}
function selectUserModalTab(tab,focus=false){if(userAdmin.invalid){userEl(userAdmin.invalid).focus();return;}if(tab!=='info'&&!userAdmin.editing)return;userAdmin.tab=tab;for(const [key,suffix] of [['info','Info'],['account','Account'],['permissions','Permissions']]){const active=key===tab,button=userEl('userTab'+suffix);button.setAttribute('aria-selected',String(active));button.tabIndex=active?0:-1;userEl('userPanel'+suffix).hidden=userAdmin.editing?!active:key!=='info';}userEl('userModal').querySelector('.modal-body').scrollTop=0;if(focus)userEl('userTab'+({info:'Info',account:'Account',permissions:'Permissions'}[tab])).focus();}
function setupUserModal(){const modal=userEl('userModal');if(modal.dataset.ready)return;modal.dataset.ready='true';modal.addEventListener('keydown',e=>{if(!userAdmin.editing&&e.key==='Enter'&&!e.isComposing&&e.target.matches('input:not([type=radio])')){e.preventDefault();submitModalUser();}});modal.addEventListener('change',e=>{if(!userAdmin.editing&&e.target.name==='userCreateRole'){userEl('modalUserRole').value=e.target.value;paintUserModal();}});modal.addEventListener('cancel',e=>{e.preventDefault();closeUserModal();});for(const id of Object.keys(userBasicFields)){const field=userEl(id);field.addEventListener('change',()=>{if(userAdmin.editing)commitUserField(field);else if(id==='modalUserRole')paintUserModal();});field.addEventListener('keydown',e=>{if(!userAdmin.editing)return;if(e.key==='Enter'){e.preventDefault();if(commitUserField(field))field.blur();}if(e.key==='Escape'){e.preventDefault();e.stopPropagation();field.value=desiredAdminUser()[userBasicFields[id]]||'';clearUserFieldError();field.blur();}});}userEl('userModalTabs').addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;const tabs=[...userEl('userModalTabs').querySelectorAll('[role=tab]')].filter(b=>!b.hidden),index=tabs.indexOf(document.activeElement);if(index<0)return;e.preventDefault();const next=e.key==='Home'?0:e.key==='End'?tabs.length-1:(index+(e.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;selectUserModalTab(tabs[next].dataset.userTab,true);});}
function clearUserFieldError(){userAdmin.invalid=null;userEl('modalUserName').removeAttribute('aria-invalid');userEl('userErrorName').textContent='';}
const userCreateFields={modalUserName:'userErrorName',modalUserId:'userCreateErrorId',modalUserPw:'userCreateErrorPassword'};
function clearUserCreateErrors(){for(const [id,errorId] of Object.entries(userCreateFields)){userEl(id).removeAttribute('aria-invalid');userEl(errorId).textContent='';}}
function paintUserCreation(){
 const creating=!userAdmin.editing,step=userAdmin.createStep||0,modal=userEl('userModal');
 modal.classList.toggle('user-creating',creating);userEl('userCreateSteps').hidden=!creating;
 userEl('userCreateDescription').hidden=!creating;
 userEl('userCreateRoleChoices').hidden=!creating;userEl('userRoleLabel').hidden=creating;userEl('modalUserRole').hidden=creating;userEl('userBasicHelp').hidden=creating;
 userEl('userCreatePrevious').hidden=!creating||step===0;userEl('userCreatePrevious').disabled=userAdmin.busy;
 userEl('userModalCancel').hidden=creating&&step>0;userEl('userModalCancel').textContent=creating?'취소':'닫기';
 userEl('modalUserId').disabled=!creating||userAdmin.busy;userEl('modalUserPw').disabled=userAdmin.busy;userEl('userCreatePasswordToggle').disabled=userAdmin.busy;
 for(const field of modal.querySelectorAll('[data-create-step]'))field.hidden=creating?Number(field.dataset.createStep)!==step:field.id==='userCreatePassword';
 for(const row of userEl('userPanelInfo').querySelectorAll('.modal-row'))row.hidden=[...row.children].every(field=>field.hidden);
 for(const radio of userEl('userCreateRoleChoices').querySelectorAll('input')){radio.checked=radio.value===userEl('modalUserRole').value;radio.disabled=userAdmin.busy;}
 userEl('userPanelInfo').setAttribute('role',creating?'region':'tabpanel');userEl('userPanelInfo').setAttribute('aria-labelledby',creating?'userCreateHeading':'userTabInfo');
 if(!creating){userEl('userCreateHeading').textContent='기본정보';return;}
 const titles=['어떤 분이 함께하나요?','로그인 정보를 입력해주세요.','역할을 부여해 주세요.'];
 const descriptions=['이름, 부서, 직급을 입력해주세요.','직원에게 전달할 아이디와 초기 비밀번호입니다.','세부 권한은 사용자 등록 후 권한 부여 탭에서 설정합니다.'];
 userEl('userModalIdentity').textContent='함께 일할 직원의 계정 정보를 입력하세요.';
 userEl('userCreateHeading').textContent=titles[step];userEl('userCreateDescription').textContent=descriptions[step];
 [...userEl('userCreateSteps').children].forEach((item,index)=>{if(index===step)item.setAttribute('aria-current','step');else item.removeAttribute('aria-current');});
 userEl('userModalFooterHint').textContent=(step+1)+' / 3 단계';userEl('userCreateSubmit').textContent=userAdmin.busy?'등록 중…':step===2?'사용자 등록':'다음';
}
function changeUserCreateStep(step){
 if(userAdmin.editing||userAdmin.busy||step<0||step>2)return;
 userAdmin.createStep=step;clearUserCreateErrors();userEl('modalMsg').textContent='';userEl('modalMsg').className='modal-msg';paintUserModal();userEl('userModal').querySelector('.modal-body').scrollTop=0;userEl('userCreateHeading').focus();
}
function validateUserCreateStep(step){
 const data=userForm();let id,message;
 if(step===0&&!data.name){id='modalUserName';message='이름을 입력하세요.';}
 if(step===1){if(!/^[a-zA-Z0-9._-]{1,64}$/.test(data.id)){id='modalUserId';message='아이디는 영문·숫자·마침표·밑줄·하이픈, 최대 64자로 입력하세요.';}else if(!data.password||data.password.length<12||data.password.length>128){id='modalUserPw';message='비밀번호는 12~128자로 입력하세요.';}}
 if(!id)return true;
 changeUserCreateStep(step);if(id==='modalUserPw')void userEl(id).offsetWidth;userEl(id).setAttribute('aria-invalid','true');userEl(userCreateFields[id]).textContent=message;showModalMsg(message);userEl(id).focus();return false;
}
function toggleUserCreatePassword(){if(userAdmin.busy)return;const field=userEl('modalUserPw'),show=field.type==='password';field.type=show?'text':'password';userEl('userCreatePasswordToggle').setAttribute('aria-pressed',String(show));userEl('userCreatePasswordToggle').setAttribute('aria-label',show?'비밀번호 숨기기':'비밀번호 보기');}
function commitUserField(field){if(!userAdmin.editing)return true;if(userAdmin.failed)return false;const key=userBasicFields[field.id],value=field.value.trim();if(!key)return true;if(userAdmin.invalid&&userAdmin.invalid!==field.id){field.value=desiredAdminUser()[key]||'';userEl(userAdmin.invalid).focus();return false;}if(key==='name'&&!value){userAdmin.invalid=field.id;field.setAttribute('aria-invalid','true');field.setAttribute('aria-describedby','userErrorName');userEl('userErrorName').textContent='이름을 입력하세요.';return false;}if(key==='name')clearUserFieldError();if(userSelf(userAdmin.editing)&&key==='role'){field.value=userAdmin.editing.role;return true;}field.value=value;const desired=desiredAdminUser();if(value!==desired[key])queueUserChange({[key]:value});return true;}
function paintUserModal(){const editing=!!userAdmin.editing,user=desiredAdminUser()||userForm(),self=userSelf(user),blocked=userAdmin.failed,creating=userAdmin.busy&&(!editing||self);
 userEl('modalTitle').textContent=editing?user.name:'새 사용자 추가';userEl('userModalIdentity').textContent=editing?[user.department||'부서 미지정',user.position||'직급 미지정',userLoginId(user)].join(' · '):'계정 정보와 담당 업무를 입력하세요.';
 userEl('userModalTabs').hidden=!editing;userEl('userTabAccount').hidden=!editing;userEl('userTabPermissions').hidden=!editing;userEl('userCreatePassword').hidden=editing;userEl('userCreateSubmit').hidden=editing;userEl('userCreateSubmit').disabled=creating;userEl('userCreateSubmit').textContent=creating?'등록 중…':'사용자 등록';userEl('userReloadCurrent').hidden=!blocked;userEl('userSaveStatus').classList.toggle('user-save-error',blocked);userEl('userModalFooterHint').textContent=editing?'변경은 서버에 바로 저장됩니다.':'기본정보 · 초기 비밀번호 입력 후 등록';userEl('userBasicHelp').textContent=editing?'이름·부서·직급은 입력을 마치면, 역할은 선택하면 바로 저장됩니다.':'기본정보와 초기 비밀번호를 입력하세요. AS 작업 권한은 등록 후 권한 부여 탭에서 설정합니다.';
 for(const id of Object.keys(userBasicFields))userEl(id).disabled=blocked||creating||(id==='modalUserRole'&&editing&&self);
 userEl('userAccountStatus').textContent=userStatuses[user.status]||'활성화';userEl('userAccountStatus').className='user-status user-status-'+(user.status||'active');userEl('userToggleAccount').textContent=user.passwordResetRequired?'비밀번호 재설정 필요':user.status==='active'?'계정 비활성화':'계정 활성화';userEl('userToggleAccount').disabled=blocked||!editing||self||user.passwordResetRequired===true;userEl('userDeleteAccount').disabled=blocked||!editing||self||userAdmin.busy||(user.authProvider!=='supabase'&&user.id==='admin');userEl('userDeleteAccount').textContent=user.authProvider==='supabase'?'계정 비활성화':'사용자 삭제';userEl('userDeleteHint').textContent=user.authProvider==='supabase'?'이력 보존을 위해 계정을 비활성화합니다. 명부와 기존 기록은 유지됩니다.':'사용자 명부에서 계정을 삭제합니다. 기존 AS 기록은 유지됩니다.';userEl('userChangePassword').disabled=blocked||!editing||userAdmin.busy;userEl('userReplacementPassword').disabled=blocked||userAdmin.busy;paintUserPermissions(user);paintUserCreation();
}
function queueUserChange(patch){if(!userAdmin.editing||userAdmin.failed||userAdmin.invalid)return Promise.resolve(false);Object.assign(userAdmin.pending,patch);userEl('modalMsg').textContent='';userEl('modalMsg').className='modal-msg';paintUserModal();return flushUserChanges();}
function flushUserChanges(){
 if(userAdmin.saving)return userAdmin.saving;if(userAdmin.failed)return Promise.resolve(false);if(!Object.keys(userAdmin.pending).length)return Promise.resolve(true);
 userAdmin.saving=(async()=>{userAdmin.busy=true;try{while(Object.keys(userAdmin.pending).length){
 const patch=userAdmin.pending;userAdmin.pending={};userAdmin.inflight=patch;userEl('userSaveStatus').textContent='변경 내용을 저장하고 있습니다…';paintUserModal();
 try{
  const original=userAdmin.editing;await userApi('/api/users/'+encodeURIComponent(original.id),{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(patch)});
  // Both providers revoke the edited account's sessions; do not issue a follow-up request as that account.
  if(userSelf(original)){userAdmin.pending={};userAdmin.inflight={};userEl('userSaveStatus').textContent='저장 완료 · 다시 로그인해주세요.';location.replace('/login.html');return true;}
  const data=await userApi('/api/users');const users=data.users.map(normalizeAdminUser),user=users.find(u=>u.id===original.id);if(!user)throw Error('사용자를 찾을 수 없습니다. 최신 정보를 확인하세요.');
  ++userAdmin.loadSequence;userAdmin.users=users;userAdmin.editing=user;userAdmin.inflight={};renderAdminUsers();paintUserModal();userEl('userSaveStatus').textContent='저장 완료 · 변경 즉시 반영';
 }catch(error){userAdmin.pending={...patch,...userAdmin.pending};userAdmin.inflight={};userAdmin.failed=true;showModalMsg(error.message);userEl('userSaveStatus').textContent='저장 결과를 확인하지 못했습니다. 최신 정보를 불러온 뒤 다시 변경하세요.';paintUserModal();return false;}
 }return true;}finally{userAdmin.busy=false;userAdmin.saving=null;paintUserModal();}})();return userAdmin.saving;
}
async function reloadEditingUser(){if(!userAdmin.editing||userAdmin.busy)return;if(userAdmin.failed&&!confirm('반영하지 못한 입력을 버리고 서버의 최신 정보를 불러오시겠습니까?'))return;const id=userAdmin.editing.id;userAdmin.busy=true;try{const data=await userApi('/api/users');const users=data.users.map(normalizeAdminUser);const user=users.find(u=>u.id===id);++userAdmin.loadSequence;userAdmin.users=users;renderAdminUsers();userAdmin.busy=false;if(!user){await closeUserModal(true);showToast('해당 사용자가 삭제되었습니다.');return;}openUserModal(user);}catch(error){showModalMsg(error.message);}finally{userAdmin.busy=false;}}
function toggleUserAccount(){const user=desiredAdminUser();if(!user||userSelf(user))return;queueUserChange({active:user.active===false});}
async function changeUserPassword(){if(!userAdmin.editing||userAdmin.failed||userAdmin.busy)return;const password=userEl('userReplacementPassword').value;if(password.length<12||password.length>128){showModalMsg('비밀번호는 12~128자로 입력하세요.');userEl('userReplacementPassword').focus();return;}const self=userSelf(userAdmin.editing);if(await queueUserChange({password})){userEl('userReplacementPassword').value='';showToast('비밀번호를 변경했습니다.');if(self)location.href='/login.html';}}
const userFilterDropdowns=new Map();
function setupUserFilterDropdown(id){
 const source=userEl(id),wrap=document.createElement('div'),button=document.createElement('button'),label=document.createElement('span'),panel=document.createElement('div');
 wrap.className='user-filter-dropdown';source.before(wrap);wrap.append(source,button,panel);source.hidden=true;source.classList.add('user-filter-source');
 button.type='button';button.id=id+'Button';button.className='user-filter-button';button.setAttribute('aria-haspopup','listbox');button.setAttribute('aria-controls',id+'Panel');button.setAttribute('aria-expanded','false');
 label.className='user-filter-label';button.append(label);button.insertAdjacentHTML('beforeend','<svg class="user-filter-chevron" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>');
 panel.id=id+'Panel';panel.className='user-filter-panel';panel.setAttribute('popover','auto');panel.setAttribute('role','listbox');panel.setAttribute('aria-label',source.getAttribute('aria-label'));
 function sync(){label.textContent=source.selectedOptions[0]?.textContent||'';button.setAttribute('aria-label',source.getAttribute('aria-label')+': '+label.textContent);button.classList.toggle('user-filter-applied',!!source.value);}
 function close(focus=false){if(panel.matches(':popover-open'))panel.hidePopover();if(focus)button.focus();}
 function open(){
  if(panel.matches(':popover-open'))return;
  panel.replaceChildren();
  for(const option of source.options){const item=document.createElement('button');item.type='button';item.className='user-filter-option';item.setAttribute('role','option');item.setAttribute('aria-selected',String(option.selected));item.tabIndex=-1;item.textContent=option.textContent;
   item.onclick=()=>{source.value=option.value;close(true);source.dispatchEvent(new Event('input',{bubbles:true}));};panel.append(item);}
  const rect=button.getBoundingClientRect(),width=Math.min(Math.max(180,rect.width),innerWidth-16),below=innerHeight-rect.bottom-14,above=rect.top-14;
  panel.style.width=width+'px';panel.style.left=Math.max(8,Math.min(rect.left,innerWidth-width-8))+'px';panel.style.maxHeight=Math.max(44,Math.min(320,Math.max(below,above)))+'px';
  panel.showPopover();const height=panel.getBoundingClientRect().height;panel.style.top=(below>=height?rect.bottom+6:Math.max(8,rect.top-height-6))+'px';
  if(!matchMedia('(prefers-reduced-motion: reduce)').matches)panel.animate([{opacity:0,transform:'translateY(-4px)'},{opacity:1,transform:'translateY(0)'}],{duration:150,easing:'ease'});
  const selected=panel.querySelector('[aria-selected=true]');selected?.focus({preventScroll:true});if(selected)panel.scrollTop=selected.offsetTop-panel.clientHeight/2+selected.offsetHeight/2;
 }
 button.onclick=()=>panel.matches(':popover-open')?close():open();
 button.onkeydown=event=>{if(['ArrowDown','ArrowUp'].includes(event.key)){event.preventDefault();open();}};
 panel.addEventListener('beforetoggle',event=>{button.setAttribute('aria-expanded',String(event.newState==='open'));if(event.newState==='closed')panel.getAnimations().forEach(animation=>animation.cancel());});
 panel.onkeydown=event=>{const items=[...panel.querySelectorAll('[role=option]')],index=items.indexOf(document.activeElement);if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?items.length-1:(index+(event.key==='ArrowDown'?1:-1)+items.length)%items.length;items[next]?.focus();}else if(event.key==='Escape'){event.preventDefault();close(true);}else if(event.key==='Tab'){close(true);}};
 window.addEventListener('resize',()=>close());
 window.addEventListener('scroll',event=>{if(!panel.contains(event.target))close();},true);
 userFilterDropdowns.set(id,{sync,button});sync();
}
function setupUserList(){
 if(userEl('userSearch'))return;
 const toolbar=document.querySelector('#tabUsers .user-toolbar');
 const resetIcon='<svg class="user-toolbar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 11a8 8 0 1 1 2 7M4 5v6h6"/></svg>';
 toolbar.insertAdjacentHTML('afterbegin','<div class="user-search-unified"><label class="user-search-field"><svg class="user-toolbar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg><input aria-label="사용자 검색" id="userSearch" type="search" placeholder="이름 · 아이디 · 부서 검색"></label><select aria-label="부서" id="userDepartmentFilter"><option value="">전체 부서</option></select><select aria-label="역할" id="userRoleFilter"><option value="">전체 역할</option><option value="sysadmin">시스템 관리자</option><option value="admin">관리자</option><option value="worker">작업자</option></select><select aria-label="계정 상태" id="userStatusFilter"><option value="">전체 상태</option><option value="active">활성화</option><option value="suspended">비활성화</option></select><button type="button" id="userReset" aria-label="검색 조건 초기화" title="검색 조건 초기화">'+resetIcon+'</button></div>');
 for(const id of ['userDepartmentFilter','userRoleFilter','userStatusFilter'])setupUserFilterDropdown(id);
 const card=document.querySelector('#tabUsers .toss-user-card');
 const chips=document.createElement('div');chips.id='userActiveFilters';chips.hidden=true;toolbar.after(chips);
 const pager=document.createElement('div');pager.className='user-pager';pager.innerHTML='<span id="userPage" role="status" aria-live="polite"></span><div><button type="button" id="userPrevious">이전</button><button type="button" id="userNext">다음</button></div>';card.append(pager);
 for(const id of ['userSearch','userDepartmentFilter','userRoleFilter','userStatusFilter'])userEl(id).addEventListener('input',()=>{userAdmin.page=1;userAdmin.selected.clear();renderAdminUsers();});
 userEl('userReset').onclick=()=>{for(const id of ['userSearch','userDepartmentFilter','userRoleFilter','userStatusFilter'])userEl(id).value='';userAdmin.page=1;userAdmin.selected.clear();renderAdminUsers();};
 userEl('userSelectPage').onchange=e=>{for(const id of userAdmin.visibleIds){if(e.target.checked)userAdmin.selected.add(id);else userAdmin.selected.delete(id);}renderAdminUsers();};
 userEl('userPrevious').onclick=()=>{userAdmin.page--;renderAdminUsers();};userEl('userNext').onclick=()=>{userAdmin.page++;renderAdminUsers();};
 userEl('modalUserPw').addEventListener('input',()=>{userEl('modalUserPw').removeAttribute('aria-invalid');userEl('userCreateErrorPassword').textContent='';});
 setupUserModal();
}
function updateUserSelection(){
 const ids=userAdmin.visibleIds,selected=ids.filter(id=>userAdmin.selected.has(id)).length;
 const all=userEl('userSelectPage');all.disabled=!ids.length;all.checked=!!ids.length&&selected===ids.length;all.indeterminate=selected>0&&selected<ids.length;
}
async function loadAdminUsers(){
 setupUserList();if(userAdmin.busy||userAdmin.saving)return;const sequence=++userAdmin.loadSequence;
 try{const data=await userApi('/api/users');if(sequence!==userAdmin.loadSequence)return;if(!Array.isArray(data.users))throw Error('사용자 목록을 확인할 수 없습니다.');userAdmin.users=data.users.map(normalizeAdminUser);userAdmin.selected.clear();renderAdminUsers();}
 catch(e){if(sequence!==userAdmin.loadSequence)return;userAdmin.users=[];userAdmin.selected.clear();renderAdminUsers();userEl('adminUserRows').firstElementChild.firstElementChild.textContent='사용자 목록을 불러오지 못했습니다. 화면을 새로고침한 후 다시 시도하세요.';showToast({message:e.message,type:'error'});}
}
function renderAdminUsers(){
 const users=userAdmin.users,query=userEl('userSearch').value.toLowerCase().trim(),role=userEl('userRoleFilter').value,status=userEl('userStatusFilter').value,department=userEl('userDepartmentFilter').value;
 const departmentFilter=userEl('userDepartmentFilter'),departments=[...new Set(users.map(u=>u.department).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ko'));
 departmentFilter.replaceChildren(new Option('전체 부서',''),...departments.map(d=>new Option(d,d)));departmentFilter.value=departments.includes(department)?department:'';
 const chips=userEl('userActiveFilters');chips.replaceChildren();for(const id of ['userDepartmentFilter','userRoleFilter','userStatusFilter']){const field=userEl(id);field.classList.toggle('user-filter-applied',!!field.value);if(!field.value)continue;const chip=document.createElement('button'),text=field.selectedOptions[0].textContent;chip.type='button';chip.textContent=text+' ×';chip.setAttribute('aria-label',text+' 조건 해제');chip.onclick=()=>{field.value='';userAdmin.page=1;userAdmin.selected.clear();renderAdminUsers();(userFilterDropdowns.get(id)?.button||field).focus();};chips.append(chip);}chips.hidden=!chips.childElementCount;userFilterDropdowns.forEach(dropdown=>dropdown.sync());
 const filtered=users.filter(u=>(!role||u.role===role)&&(!status||(u.status||'active')===status)&&(!departmentFilter.value||u.department===departmentFilter.value)&&[u.name,userLoginId(u),u.department].join(' ').toLowerCase().includes(query)).sort((a,b)=>a.name.localeCompare(b.name,'ko'));
 const pages=Math.max(1,Math.ceil(filtered.length/50));userAdmin.page=Math.min(pages,Math.max(1,userAdmin.page));const body=userEl('adminUserRows');body.replaceChildren();
 const visible=filtered.slice((userAdmin.page-1)*50,userAdmin.page*50);userAdmin.visibleIds=visible.map(u=>u.id);
 for(const user of visible){
  const row=document.createElement('tr'),cell=text=>{const td=document.createElement('td');td.textContent=text;row.append(td);return td;};
  row.classList.toggle('user-row-selected',userAdmin.selected.has(user.id));
  const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.setAttribute('aria-label',user.name+' 선택');checkbox.checked=userAdmin.selected.has(user.id);checkbox.onchange=()=>{if(checkbox.checked)userAdmin.selected.add(user.id);else userAdmin.selected.delete(user.id);row.classList.toggle('user-row-selected',checkbox.checked);updateUserSelection();};const checkLabel=document.createElement('label');checkLabel.className='user-check-target';checkLabel.append(checkbox);const selection=cell('');selection.className='user-select-cell';selection.append(checkLabel);
  const identity=cell(''),person=document.createElement('div'),copy=document.createElement('div'),name=document.createElement('button');person.className='user-roster-person';name.type='button';name.className='user-name-button';name.textContent=user.name;name.setAttribute('aria-label',user.name+' 사용자 관리');name.onclick=()=>openUserModal(user);copy.append(name);person.append(copy);identity.append(person);cell(userLoginId(user));
  cell(user.department||'미지정');cell(user.position||'미지정');
  cell(userRoles[user.role]||user.role);
  for(const [key,title] of Object.entries(userAsPermissions)){
   const permission=cell(''),badge=document.createElement('span'),allowed=AsPermissions.can(user,key);
   permission.className='user-permission-cell';badge.className='user-permission-indicator'+(allowed?' is-allowed':'');badge.setAttribute('role','img');badge.setAttribute('aria-label',title+' '+(allowed?'허용':'제한'));badge.title=badge.getAttribute('aria-label');permission.append(badge);
  }
  const state=cell(''),statusBadge=document.createElement('span');statusBadge.className='user-status user-status-'+(['active','suspended'].includes(user.status)?user.status:'active');statusBadge.textContent=userStatuses[user.status]||'활성화';state.append(statusBadge);
row.onclick=e=>{if(!e.target.closest('button,input,label,select,a'))openUserModal(user);};body.append(row);
 }
 if(!filtered.length){const row=body.insertRow(),td=row.insertCell();td.colSpan=11;td.className='user-roster-empty';td.textContent=users.length?'조건에 맞는 사용자가 없습니다. 검색어나 필터를 확인하세요.':'등록된 사용자가 없습니다.';}
 userEl('userPage').textContent=`${filtered.length}명 · ${userAdmin.page} / ${pages}페이지`;userEl('userPrevious').disabled=userAdmin.page===1;userEl('userNext').disabled=userAdmin.page===pages;
 updateUserSelection();
}
async function submitModalUser(){
 if(userAdmin.busy||userAdmin.editing)return;
 if(!validateUserCreateStep(userAdmin.createStep))return;
 if(userAdmin.createStep<2){changeUserCreateStep(userAdmin.createStep+1);return;}
 if(!validateUserCreateStep(0)||!validateUserCreateStep(1))return;const data=userForm();
 userAdmin.busy=true;paintUserModal();
 try{await userApi('/api/users',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});userAdmin.busy=false;await closeUserModal(true);showToast('사용자를 등록했습니다.');await loadAdminUsers();
 }catch(e){showModalMsg(e.message);userEl('modalMsg').focus();}finally{userAdmin.busy=false;paintUserModal();}
}
async function deleteAdminUser(user){
 if(!user||userSelf(user)||userAdmin.busy||userAdmin.failed)return;const id=user.id;if(!await flushUserChanges())return;user=userAdmin.users.find(u=>u.id===id)||user;
 const deactivate=user.authProvider==='supabase';if(!confirm(user.name+' ('+userLoginId(user)+') 계정을 '+(deactivate?'비활성화':'삭제')+'하시겠습니까? 기존 AS 기록은 유지됩니다.'))return;
 userAdmin.busy=true;paintUserModal();try{await userApi('/api/users/'+encodeURIComponent(id),{method:'DELETE'});userAdmin.busy=false;if(userAdmin.editing?.id===id)await closeUserModal(true);showToast(deactivate?'계정을 비활성화했습니다.':'사용자를 삭제했습니다.');await loadAdminUsers();}catch(e){showModalMsg(e.message);}finally{userAdmin.busy=false;paintUserModal();}
}
