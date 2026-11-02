'use strict';
window.AppHeader=(()=>{
 const account=document.getElementById('appAccount'),summary=document.getElementById('appAccountToggle'),menu=document.getElementById('appMenuToggle'),navigation=document.getElementById('appNavigation');
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
  if(account.open){account.open=false;summary.focus({preventScroll:true});}
  else if(document.body.classList.contains('app-nav-open'))closeNavigation(true);
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
   text('appHeaderPage',tab==='users'?'사용자 관리':sub==='product'?'제품 목록':sub==='list'?'AS 접수':'AS 접수 현황');
   const wasFocused=navigation.contains(document.activeElement)&&document.body.classList.contains('app-nav-open');
   closeNavigation(wasFocused);account.open=false;
   navigation.querySelectorAll('[aria-current]').forEach(el=>el.removeAttribute('aria-current'));
   const current=tab==='users'?document.getElementById('tabUsersBtn'):sub==='product'||sub==='list'?navigation.querySelector(`[data-sub="${sub}"]`):document.getElementById('tabAsBtn');
   current?.setAttribute('aria-current','page');
  }
 };
})();
