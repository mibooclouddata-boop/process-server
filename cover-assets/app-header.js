'use strict';
window.AppHeader=(()=>{
 const account=document.getElementById('appAccount'),summary=document.getElementById('appAccountToggle'),menu=document.getElementById('appMenuToggle'),navigation=document.getElementById('appNavigation');
 const railToggle=document.getElementById('appRailToggle');
 const asTabs=document.getElementById('asSubmenu');
 asTabs.addEventListener('keydown',event=>{
  if(!['ArrowUp','ArrowDown','Home','End'].includes(event.key))return;
  const buttons=[...asTabs.querySelectorAll('button')],index=buttons.indexOf(event.target);if(index<0)return;
  event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length;
  buttons[next].focus();buttons[next].click();
 });
 const header=document.querySelector('#dashboard>.app-topbar');
 const brand=header?.querySelector('.topbar-title');
 const main=document.querySelector('#dashboard .main');
 const pageMotion=(()=>{
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  let observer,frame,animations=[],seen=new WeakSet(),page;
  const selectors={
   stats:'#asKpiRow>button,.as-stats-chart-panel',
   list:'.as-ledger-heading,.as-filter-grid,.as-erp-table thead,#asTableBody>tr',
   product:'.toss-user-card,.product-toolbar,#productListBody>tr',
   users:'.user-toolbar,.user-roster-table thead,#adminUserRows>tr',
   process:'.development-icon,h2,p',dispatch:'.development-icon,h2,p'
  };
  function cancel(){
   observer?.disconnect();cancelAnimationFrame(frame);
   animations.forEach(animation=>animation.cancel());animations=[];
  }
  function reveal(){
   frame=undefined;
   if(reduced.matches||document.getElementById('dashboard')?.inert)return;
   const root=['process','dispatch'].includes(page)?document.getElementById('featureDevelopment'):document.getElementById(page==='users'?'tabUsers':'asSub'+({stats:'Stats',list:'List',product:'Product'}[page]));
   if(!root?.getClientRects().length||root.getAttribute('aria-busy')==='true')return;
   const targets=[...root.querySelectorAll(selectors[page])].filter(el=>!seen.has(el)&&el.getClientRects().length);
   targets.forEach((el,index)=>{
    seen.add(el);
    // Saving in the user dialog rebuilds rows behind it, not a new page entry.
    if(page==='users'&&document.getElementById('userModal')?.open)return;
    // Cap the stagger so a full table never delays access to the last row.
    const animation=el.animate([{opacity:0,transform:'translateY(14px)'},{opacity:1,transform:'translateY(0)'}],{duration:300,delay:Math.min(index,8)*35,easing:'cubic-bezier(.22,.7,.2,1)',fill:'backwards'});
    animations.push(animation);
    animation.finished.catch(()=>{}).finally(()=>{animations=animations.filter(item=>item!==animation);});
   });
  }
  function schedule(){if(frame===undefined)frame=requestAnimationFrame(reveal);}
  reduced.addEventListener('change',()=>{if(reduced.matches)cancel();});
  return {start(tab,sub){
   cancel();frame=undefined;seen=new WeakSet();page=tab==='as'?(sub||'stats'):tab;
   // The login crossfade owns the first entrance; observing it here would replay after reveal.
   if(reduced.matches||!main||!selectors[page]||document.getElementById('dashboard')?.inert)return;
   observer=new MutationObserver(schedule);
   observer.observe(main,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden','aria-busy']});
   schedule();
  }};
 })();
 if(header&&brand&&railToggle&&main){
  const slot=document.createElement('div'),brandRegion=document.createElement('div');
  slot.className='rail-header-slot';brandRegion.className='rail-brand-region';
  header.prepend(slot);slot.after(brandRegion);brandRegion.append(brand);slot.append(railToggle);
  const align=()=>{
   const style=getComputedStyle(main);
   header.style.setProperty('--rail-content-inset',`${main.clientLeft+parseFloat(style.paddingLeft||0)}px`);
   header.style.setProperty('--rail-content-top',`${parseFloat(style.paddingTop||0)}px`);
  };
  new ResizeObserver(align).observe(main);new ResizeObserver(align).observe(header);window.addEventListener('resize',align);align();
 }
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
   text('appAccountName',name);text('appAccountLogin',user?.loginId||user?.id);text('appAccountDepartment',user?.department);text('appAccountPosition',user?.position);text('appAccountRole',role);text('appAccountAvatar',[...name][0]||'');
   summary.setAttribute('aria-label',name+' 계정 메뉴');
  },
  setPage(tab,sub){
   const heading=document.getElementById('appHeaderPage');
   if(heading)heading.textContent=tab==='process'?'공정':tab==='dispatch'?'배차':tab==='users'?'사용자 관리':sub==='product'?'제품 목록':sub==='list'?'AS 목록':'AS 접수 현황';
   const wasFocused=navigation.contains(document.activeElement)&&document.body.classList.contains('app-nav-open');
   closeNavigation(wasFocused);account.open=false;
   document.querySelectorAll('#appNavigation [aria-current],#asSubmenu [aria-current]').forEach(el=>el.removeAttribute('aria-current'));
   const activeSub=navigation.dataset.asCombined==='true'&&sub==='list'?'stats':sub||'stats';
   const current=tab==='as'&&sub==='product'&&navigation.dataset.asCombined==='true'?document.getElementById('tabprocessBtn'):['process','dispatch'].includes(tab)?document.getElementById('tab'+tab+'Btn'):tab==='users'?document.getElementById('tabUsersBtn'):navigation.querySelector(`[data-sub="${activeSub}"]`);
   current?.setAttribute('aria-current','page');
   pageMotion.start(tab,sub);
  }
 };
})();
