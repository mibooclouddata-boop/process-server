'use strict';
const userAdmin={users:[],editing:null,busy:false,baseline:'',page:1,selected:new Set(),visibleIds:[],tab:'info',pending:{},inflight:{},saving:null,failed:false,invalid:null,loadSequence:0};
const userEl=id=>document.getElementById(id);
const userRoles={sysadmin:'시스템 관리자',admin:'관리자',worker:'작업자'};
const userStatuses={active:'사용 중',invited:'재설정 필요',suspended:'중지'};
function normalizeAdminUser(user){return {...user,status:user.active===false?'suspended':user.passwordResetRequired?'invited':'active'};}
function userLoginId(user){return user.loginId||user.id;}
async function userApi(url,options){const response=await fetch(url,options);let data;try{data=await response.json();}catch{throw Error('서버 응답을 확인할 수 없습니다. 최신 정보를 다시 불러오세요.');}if(!response.ok){const error=Error(data.error||'처리하지 못했습니다. 다시 시도하세요.');error.status=response.status;throw error;}return data;}
const userBasicFields={modalUserName:'name',modalUserDept:'department',modalUserPos:'position',modalUserRole:'role'};
function desiredAdminUser(){return userAdmin.editing?{...userAdmin.editing,...userAdmin.inflight,...userAdmin.pending}:null;}
function userSelf(user){return !!user&&user.id===currentUser?.id;}
function userForm(){const data={id:userEl('modalUserId').value.trim(),name:userEl('modalUserName').value.trim(),role:userEl('modalUserRole').value,department:userEl('modalUserDept').value.trim(),position:userEl('modalUserPos').value.trim()};if(!userAdmin.editing&&userEl('modalUserPw').value)data.password=userEl('modalUserPw').value;return data;}
function showModalMsg(text){const el=userEl('modalMsg');el.textContent=text;el.className='modal-msg error';el.setAttribute('role','alert');}
function openUserModal(user){
 if(userAdmin.busy||userAdmin.saving)return;setupUserModal();userAdmin.editing=user?{...user,allowedSteps:[...(user.allowedSteps||[])]}:null;userAdmin.pending={};userAdmin.inflight={};userAdmin.failed=false;userAdmin.invalid=null;userAdmin.tab='info';
 for(const [id,key] of Object.entries({modalUserId:'id',modalUserName:'name',modalUserDept:'department',modalUserPos:'position'}))userEl(id).value=user?(key==='id'?userLoginId(user):user[key]||''):'';
 userEl('modalUserId').disabled=!!user;userEl('modalUserPw').value='';userEl('userReplacementPassword').value='';userEl('modalUserRole').value=user?.role||'worker';userEl('modalMsg').textContent='';userEl('modalMsg').className='modal-msg';userEl('userErrorName').textContent='';userEl('modalUserName').removeAttribute('aria-invalid');userEl('userIdHint').textContent=user?'이력 연결을 위해 기존 아이디는 변경할 수 없습니다.':'영문·숫자·마침표·밑줄·하이픈, 최대 64자';
 for(const detail of document.querySelectorAll('#userModal details'))detail.open=false;
 userEl('userSaveStatus').textContent=user?'변경 즉시 저장 · 본인 계정 수정 후 다시 로그인':'기본정보와 초기 비밀번호를 입력한 뒤 등록하세요.';paintUserModal();selectUserModalTab('info',false);userAdmin.baseline=JSON.stringify(userForm());if(!userEl('userModal').open)userEl('userModal').showModal();userEl(user?'userTabInfo':'modalUserId').focus({preventScroll:true});
}
async function closeUserModal(force=false){if(userAdmin.busy&&!userAdmin.saving)return;if(!force){if(userAdmin.editing){const active=document.activeElement;if(active?.dataset.userField&&!commitUserField(active))return;await flushUserChanges();if(userAdmin.failed&&!confirm('서버에 반영하지 못한 변경을 버리고 닫으시겠습니까?'))return;if(userAdmin.invalid){userEl(userAdmin.invalid).focus();return;}}else if(JSON.stringify(userForm())!==userAdmin.baseline&&!confirm('입력한 사용자 정보를 버리고 닫으시겠습니까?'))return;}userEl('userModal').close();userAdmin.editing=null;userAdmin.pending={};userAdmin.inflight={};userAdmin.failed=false;userAdmin.invalid=null;}
function selectUserModalTab(tab,focus=false){if(userAdmin.invalid){userEl(userAdmin.invalid).focus();return;}if(tab==='account'&&!userAdmin.editing)return;userAdmin.tab=tab;for(const [key,suffix] of [['info','Info'],['account','Account']]){const active=key===tab,button=userEl('userTab'+suffix);button.setAttribute('aria-selected',String(active));button.tabIndex=active?0:-1;userEl('userPanel'+suffix).hidden=userAdmin.editing?!active:key==='account';}userEl('userModal').querySelector('.modal-body').scrollTop=0;if(focus)userEl('userTab'+({info:'Info',account:'Account'}[tab])).focus();}
function setupUserModal(){const modal=userEl('userModal');if(modal.dataset.ready)return;modal.dataset.ready='true';modal.addEventListener('cancel',e=>{e.preventDefault();closeUserModal();});for(const id of Object.keys(userBasicFields)){const field=userEl(id);field.addEventListener('change',()=>{if(userAdmin.editing)commitUserField(field);else if(id==='modalUserRole')paintUserModal();});field.addEventListener('keydown',e=>{if(!userAdmin.editing)return;if(e.key==='Enter'){e.preventDefault();if(commitUserField(field))field.blur();}if(e.key==='Escape'){e.preventDefault();e.stopPropagation();field.value=desiredAdminUser()[userBasicFields[id]]||'';clearUserFieldError();field.blur();}});}userEl('userModalTabs').addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;const tabs=[...userEl('userModalTabs').querySelectorAll('[role=tab]')].filter(b=>!b.hidden),index=tabs.indexOf(document.activeElement);if(index<0)return;e.preventDefault();const next=e.key==='Home'?0:e.key==='End'?tabs.length-1:(index+(e.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;selectUserModalTab(tabs[next].dataset.userTab,true);});}
function clearUserFieldError(){userAdmin.invalid=null;userEl('modalUserName').removeAttribute('aria-invalid');userEl('userErrorName').textContent='';}
function commitUserField(field){if(!userAdmin.editing)return true;if(userAdmin.failed)return false;const key=userBasicFields[field.id],value=field.value.trim();if(!key)return true;if(userAdmin.invalid&&userAdmin.invalid!==field.id){field.value=desiredAdminUser()[key]||'';userEl(userAdmin.invalid).focus();return false;}if(key==='name'&&!value){userAdmin.invalid=field.id;field.setAttribute('aria-invalid','true');field.setAttribute('aria-describedby','userErrorName');userEl('userErrorName').textContent='이름을 입력하세요.';return false;}if(key==='name')clearUserFieldError();if(userSelf(userAdmin.editing)&&key==='role'){field.value=userAdmin.editing.role;return true;}field.value=value;const desired=desiredAdminUser();if(value!==desired[key])queueUserChange({[key]:value});return true;}
function paintUserModal(){const editing=!!userAdmin.editing,user=desiredAdminUser()||userForm(),self=userSelf(user),blocked=userAdmin.failed,creating=userAdmin.busy&&(!editing||self);
 userEl('modalTitle').textContent=editing?user.name:'새 사용자 추가';userEl('userModalIdentity').textContent=editing?[user.department||'부서 미지정',user.position||'직급 미지정',userLoginId(user)].join(' · '):'계정 정보와 담당 업무를 입력하세요.';
 userEl('userModalTabs').hidden=!editing;userEl('userTabAccount').hidden=!editing;userEl('userCreatePassword').hidden=editing;userEl('userCreateSubmit').hidden=editing;userEl('userCreateSubmit').disabled=creating;userEl('userCreateSubmit').textContent=creating?'등록 중…':'사용자 등록';userEl('userReloadCurrent').hidden=!blocked;userEl('userSaveStatus').classList.toggle('user-save-error',blocked);userEl('userModalFooterHint').textContent=editing?'변경은 서버에 바로 저장됩니다.':'기본정보 · 초기 비밀번호 입력 후 등록';userEl('userBasicHelp').textContent=editing?'이름·부서·직급은 입력을 마치면, 역할은 선택하면 바로 저장됩니다.':'사용 중인 모든 직원은 AS를 함께 관리합니다. 필수 정보와 초기 비밀번호를 입력하세요.';
 for(const id of Object.keys(userBasicFields))userEl(id).disabled=blocked||creating||(id==='modalUserRole'&&editing&&self);
 userEl('userAccountStatus').textContent=userStatuses[user.status]||'사용 중';userEl('userAccountStatus').className='user-status user-status-'+(user.status||'active');userEl('userToggleAccount').textContent=user.status==='active'?'계정 중지':user.status==='invited'?'비밀번호 재설정 필요':'계정 복구';userEl('userToggleAccount').disabled=blocked||!editing||self||user.passwordResetRequired===true;userEl('userDeleteAccount').disabled=blocked||!editing||self||userAdmin.busy||(user.authProvider!=='supabase'&&user.id==='admin');userEl('userDeleteAccount').textContent=user.authProvider==='supabase'?'계정 비활성화':'사용자 삭제';userEl('userDeleteHint').textContent=user.authProvider==='supabase'?'이력 보존을 위해 계정을 비활성화합니다. 명부와 기존 기록은 유지됩니다.':'사용자 명부에서 계정을 삭제합니다. 기존 AS 기록은 유지됩니다.';userEl('userChangePassword').disabled=blocked||!editing||userAdmin.busy;userEl('userReplacementPassword').disabled=blocked||userAdmin.busy;
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
function setupUserList(){
 if(userEl('userSearch'))return;
 const toolbar=document.createElement('div');toolbar.className='user-toolbar';
 const resetIcon='<svg class="user-toolbar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 11a8 8 0 1 1 2 7M4 5v6h6"/></svg>';
 toolbar.innerHTML='<div class="user-search-unified"><label class="user-search-field"><svg class="user-toolbar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg><input aria-label="사용자 검색" id="userSearch" type="search" placeholder="이름 · 아이디 · 부서 검색"></label><select aria-label="부서" id="userDepartmentFilter"><option value="">전체 부서</option></select><select aria-label="역할" id="userRoleFilter"><option value="">전체 역할</option><option value="sysadmin">시스템 관리자</option><option value="admin">관리자</option><option value="worker">작업자</option></select><select aria-label="계정 상태" id="userStatusFilter"><option value="">전체 상태</option><option value="active">사용 중</option><option value="invited">재설정 필요</option><option value="suspended">중지</option></select><button type="button" id="userReset" aria-label="검색 조건 초기화" title="검색 조건 초기화">'+resetIcon+'</button></div>';
 const card=document.querySelector('#tabUsers .toss-user-card');card.querySelector('.user-roster-heading').after(toolbar);
 const refresh=document.createElement('button');refresh.type='button';refresh.id='userRefresh';refresh.setAttribute('aria-label','명부 새로고침');refresh.title='명부 새로고침';refresh.innerHTML=resetIcon;card.querySelector('.user-roster-heading').append(refresh);
 const actions=document.createElement('div');actions.className='user-list-actions';actions.id='userSelectionActions';actions.hidden=true;actions.innerHTML='<span id="userSelectionCount" role="status"></span><div><button type="button" id="userBulk" disabled>선택 사용자 부서 변경</button><button type="button" id="userClearSelection">선택 해제</button></div>';toolbar.after(actions);
 const chips=document.createElement('div');chips.id='userActiveFilters';chips.hidden=true;toolbar.after(chips);
 const pager=document.createElement('div');pager.className='user-pager';pager.innerHTML='<span id="userPage" role="status" aria-live="polite"></span><div><button type="button" id="userPrevious">이전</button><button type="button" id="userNext">다음</button></div>';card.append(pager);
 for(const id of ['userSearch','userDepartmentFilter','userRoleFilter','userStatusFilter'])userEl(id).addEventListener('input',()=>{userAdmin.page=1;userAdmin.selected.clear();renderAdminUsers();});
 userEl('userReset').onclick=()=>{for(const id of ['userSearch','userDepartmentFilter','userRoleFilter','userStatusFilter'])userEl(id).value='';userAdmin.page=1;userAdmin.selected.clear();renderAdminUsers();};
 userEl('userSelectPage').onchange=e=>{for(const id of userAdmin.visibleIds){if(e.target.checked)userAdmin.selected.add(id);else userAdmin.selected.delete(id);}renderAdminUsers();};
 userEl('userPrevious').onclick=()=>{userAdmin.page--;renderAdminUsers();};userEl('userNext').onclick=()=>{userAdmin.page++;renderAdminUsers();};userEl('userRefresh').onclick=loadAdminUsers;userEl('userBulk').onclick=bulkUserDepartment;
 userEl('userClearSelection').onclick=()=>{userAdmin.selected.clear();renderAdminUsers();userEl('userSelectPage').focus();};
 setupUserModal();
}
function updateUserSelection(){
 const count=userAdmin.selected.size,ids=userAdmin.visibleIds,selected=ids.filter(id=>userAdmin.selected.has(id)).length;
 userEl('userSelectionCount').textContent=count?`${count}명 선택`:'';userEl('userBulk').disabled=!count;userEl('userSelectionActions').hidden=!count;
 const all=userEl('userSelectPage');all.disabled=!ids.length;all.checked=!!ids.length&&selected===ids.length;all.indeterminate=selected>0&&selected<ids.length;
}
async function loadAdminUsers(){
 setupUserList();if(userAdmin.busy||userAdmin.saving)return;const sequence=++userAdmin.loadSequence;userEl('userRefresh').disabled=true;
 try{const data=await userApi('/api/users');if(sequence!==userAdmin.loadSequence)return;if(!Array.isArray(data.users))throw Error('사용자 목록을 확인할 수 없습니다.');userAdmin.users=data.users.map(normalizeAdminUser);userAdmin.selected.clear();renderAdminUsers();}
 catch(e){if(sequence!==userAdmin.loadSequence)return;userAdmin.users=[];userAdmin.selected.clear();renderAdminUsers();for(const id of ['uStatTotal','uStatActive','uStatInvited','uStatAdmin','userRosterCount'])userEl(id).textContent='—';userEl('adminUserRows').firstElementChild.firstElementChild.textContent='사용자 목록을 불러오지 못했습니다. 새로고침으로 다시 시도하세요.';showToast({message:e.message,type:'error'});}
 finally{if(sequence===userAdmin.loadSequence)userEl('userRefresh').disabled=false;}
}
function renderAdminUsers(){
 const users=userAdmin.users,query=userEl('userSearch').value.toLowerCase().trim(),role=userEl('userRoleFilter').value,status=userEl('userStatusFilter').value,department=userEl('userDepartmentFilter').value;
 const departmentFilter=userEl('userDepartmentFilter'),departments=[...new Set(users.map(u=>u.department).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ko'));
 departmentFilter.replaceChildren(new Option('전체 부서',''),...departments.map(d=>new Option(d,d)));departmentFilter.value=departments.includes(department)?department:'';
 const chips=userEl('userActiveFilters');chips.replaceChildren();for(const id of ['userDepartmentFilter','userRoleFilter','userStatusFilter']){const field=userEl(id);field.classList.toggle('user-filter-applied',!!field.value);if(!field.value)continue;const chip=document.createElement('button'),text=field.selectedOptions[0].textContent;chip.type='button';chip.textContent=text+' ×';chip.setAttribute('aria-label',text+' 조건 해제');chip.onclick=()=>{field.value='';userAdmin.page=1;userAdmin.selected.clear();renderAdminUsers();field.focus();};chips.append(chip);}chips.hidden=!chips.childElementCount;
 for(const [id,value] of Object.entries({uStatTotal:users.length,uStatActive:users.filter(u=>!u.status||u.status==='active').length,uStatInvited:users.filter(u=>u.status==='invited').length,uStatAdmin:users.filter(u=>['sysadmin','admin'].includes(u.role)).length}))userEl(id).textContent=value;
 const filtered=users.filter(u=>(!role||u.role===role)&&(!status||(u.status||'active')===status)&&(!departmentFilter.value||u.department===departmentFilter.value)&&[u.name,userLoginId(u),u.department].join(' ').toLowerCase().includes(query)).sort((a,b)=>a.name.localeCompare(b.name,'ko'));
 const pages=Math.max(1,Math.ceil(filtered.length/50));userAdmin.page=Math.min(pages,Math.max(1,userAdmin.page));const body=userEl('adminUserRows');body.replaceChildren();
 const visible=filtered.slice((userAdmin.page-1)*50,userAdmin.page*50);userAdmin.visibleIds=visible.map(u=>u.id);userEl('userRosterCount').textContent=users.length;
 for(const user of visible){
  const row=document.createElement('tr'),cell=text=>{const td=document.createElement('td');td.textContent=text;row.append(td);return td;};
  row.classList.toggle('user-row-selected',userAdmin.selected.has(user.id));
  const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.setAttribute('aria-label',user.name+' 선택');checkbox.checked=userAdmin.selected.has(user.id);checkbox.onchange=()=>{if(checkbox.checked)userAdmin.selected.add(user.id);else userAdmin.selected.delete(user.id);row.classList.toggle('user-row-selected',checkbox.checked);updateUserSelection();};const checkLabel=document.createElement('label');checkLabel.className='user-check-target';checkLabel.append(checkbox);const selection=cell('');selection.className='user-select-cell';selection.append(checkLabel);
  const identity=cell(''),person=document.createElement('div'),avatar=document.createElement('span'),copy=document.createElement('div'),name=document.createElement('button'),id=document.createElement('small');person.className='user-roster-person';avatar.className='user-roster-avatar';avatar.setAttribute('aria-hidden','true');avatar.textContent=(user.name||user.id).slice(0,1);name.type='button';name.className='user-name-button';name.textContent=user.name;name.setAttribute('aria-label',user.name+' 사용자 관리');name.onclick=()=>openUserModal(user);id.textContent=userLoginId(user);copy.append(name,id);person.append(avatar,copy);identity.append(person);
  const deptCell=cell(user.department||'미지정'),position=document.createElement('small');position.textContent=user.position||'직급 미지정';deptCell.append(position);
  cell(userRoles[user.role]||user.role);
  const state=cell(''),statusBadge=document.createElement('span');statusBadge.className='user-status user-status-'+(['active','invited','suspended'].includes(user.status)?user.status:'active');statusBadge.textContent=userStatuses[user.status]||'사용 중';state.append(statusBadge);
  const actions=cell(''),buttons=document.createElement('div');buttons.className='user-row-actions';const button=document.createElement('button');button.type='button';button.textContent='관리';button.className='user-detail-btn';button.setAttribute('aria-label',user.name+' 관리');button.onclick=()=>openUserModal(user);buttons.append(button);actions.append(buttons);row.onclick=e=>{if(!e.target.closest('button,input,label,select,a'))openUserModal(user);};body.append(row);
 }
 if(!filtered.length){const row=body.insertRow(),td=row.insertCell();td.colSpan=6;td.className='user-roster-empty';td.textContent=users.length?'조건에 맞는 사용자가 없습니다. 검색어나 필터를 확인하세요.':'등록된 사용자가 없습니다.';}
 userEl('userPage').textContent=`${filtered.length}명 · ${userAdmin.page} / ${pages}페이지`;userEl('userPrevious').disabled=userAdmin.page===1;userEl('userNext').disabled=userAdmin.page===pages;
 updateUserSelection();
}
async function submitModalUser(){
 if(userAdmin.busy||userAdmin.editing)return;const data=userForm();
 if(!data.id||!data.name){showModalMsg('아이디와 이름은 필수입니다.');return;}
 if(!/^[a-zA-Z0-9._-]{1,64}$/.test(data.id)){showModalMsg('아이디는 영문·숫자·마침표·밑줄·하이픈, 최대 64자로 입력하세요.');selectUserModalTab('info');userEl('modalUserId').focus();return;}
 if(!data.password||data.password.length<12||data.password.length>128){showModalMsg('비밀번호는 12~128자로 입력하세요.');selectUserModalTab('info');userEl('modalUserPw').focus();return;}
 userAdmin.busy=true;paintUserModal();
 try{await userApi('/api/users',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});userAdmin.busy=false;await closeUserModal(true);showToast('사용자를 등록했습니다.');await loadAdminUsers();
 }catch(e){showModalMsg(e.message);}finally{userAdmin.busy=false;paintUserModal();}
}
async function deleteAdminUser(user){
 if(!user||userSelf(user)||userAdmin.busy||userAdmin.failed)return;const id=user.id;if(!await flushUserChanges())return;user=userAdmin.users.find(u=>u.id===id)||user;
 const deactivate=user.authProvider==='supabase';if(!confirm(user.name+' ('+userLoginId(user)+') 계정을 '+(deactivate?'비활성화':'삭제')+'하시겠습니까? 기존 AS 기록은 유지됩니다.'))return;
 userAdmin.busy=true;paintUserModal();try{await userApi('/api/users/'+encodeURIComponent(id),{method:'DELETE'});userAdmin.busy=false;if(userAdmin.editing?.id===id)await closeUserModal(true);showToast(deactivate?'계정을 비활성화했습니다.':'사용자를 삭제했습니다.');await loadAdminUsers();}catch(e){showModalMsg(e.message);}finally{userAdmin.busy=false;paintUserModal();}
}
async function bulkUserDepartment(){
 if(userAdmin.busy||!userAdmin.selected.size)return;
 const department=prompt(userAdmin.selected.size+'명의 새 부서를 입력하세요. 빈칸은 부서를 해제합니다.');if(department===null)return;if(department.length>100){showToast({message:'부서는 100자 이하로 입력하세요.',type:'error'});return;}
 // Use the existing provider's update endpoint; process self last because its session is revoked.
 const users=userAdmin.users.filter(u=>userAdmin.selected.has(u.id)).sort((a,b)=>Number(userSelf(a))-Number(userSelf(b)));let completed=0,redirecting=false;userAdmin.busy=true;userEl('userBulk').disabled=true;++userAdmin.loadSequence;
 try{for(const user of users){await userApi('/api/users/'+encodeURIComponent(user.id),{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({department:department.trim()})});completed++;if(userSelf(user)){redirecting=true;location.replace('/login.html');return;}}showToast(completed+'명의 부서를 변경했습니다.');}
 catch(e){showToast({message:completed+'명 반영 후 중단되었습니다. '+e.message,type:'error'});}
 finally{userAdmin.busy=false;if(!redirecting)await loadAdminUsers();}
}
