'use strict';
window.AppHeader=(()=>{
 const account=document.getElementById('appAccount'),summary=document.getElementById('appAccountToggle'),menu=document.getElementById('appMenuToggle'),navigation=document.getElementById('appNavigation');
 const railToggle=document.getElementById('appRailToggle');
 function setRailExpanded(expanded){
  navigation.dataset.expanded=String(expanded);
  railToggle.setAttribute('aria-expanded',String(expanded));
  railToggle.setAttribute('aria-label',expanded?'메뉴 접기':'메뉴 펼치기');
 }
 railToggle.addEventListener('click',()=>setRailExpanded(navigation.dataset.expanded!=='true'));
 navigation.querySelectorAll('.tab,.tab-sub').forEach(button=>{
  const reveal=()=>{delete navigation.dataset.tipDismissed;};
  button.addEventListener('pointerenter',reveal);button.addEventListener('focus',reveal);
 });
 const text=(id,value)=>{document.getElementById(id).textContent=value||'';};
 function closeNavigation(restoreFocus=false){
  document.body.classList.remove('app-nav-open');menu.setAttribute('aria-expanded','false');
  if(restoreFocus)menu.focus({preventScroll:true});
 }
 menu.addEventListener('click',()=>{
  account.open=false;
  const open=document.body.classList.toggle('app-nav-open');menu.setAttribute('aria-expanded',String(open));
 });
 account.addEventListener('toggle',()=>{if(account.open)closeNavigation();});
 document.addEventListener('click',event=>{if(!account.contains(event.target))account.open=false;});
 document.addEventListener('keydown',event=>{
  if(event.key!=='Escape')return;
  navigation.dataset.tipDismissed='true';
  if(account.open){account.open=false;summary.focus({preventScroll:true});}
  else if(document.body.classList.contains('app-nav-open'))closeNavigation(true);
  else if(navigation.contains(document.activeElement)){
   if(!mobile.matches&&navigation.dataset.expanded==='true'){setRailExpanded(false);railToggle.focus({preventScroll:true});}
  }
 });
 const mobile=matchMedia('(max-width:768px)');
 mobile.addEventListener('change',()=>closeNavigation());
 return {
  setUser(user){
   const name=String(user?.name||''),role={sysadmin:'시스템 관리자',admin:'관리자',worker:'작업자'}[user?.role]||'사용자';
   text('topbarUser',name);text('appHeaderRole',role);text('appHeaderAvatar',[...name][0]||'');
   text('appAccountName',name);text('appAccountLogin',user?.loginId||user?.id);text('appAccountRole',role);
   summary.setAttribute('aria-label',name+' 계정 메뉴');
  },
  setPage(tab,sub){
   const wasFocused=navigation.contains(document.activeElement)&&document.body.classList.contains('app-nav-open');
   closeNavigation(wasFocused);account.open=false;
   navigation.querySelectorAll('[aria-current]').forEach(el=>el.removeAttribute('aria-current'));
   const current=tab==='users'?document.getElementById('tabUsersBtn'):sub==='product'||sub==='list'?navigation.querySelector(`[data-sub="${sub}"]`):document.getElementById('tabAsBtn');
   current?.setAttribute('aria-current','page');
  }
 };
})();
