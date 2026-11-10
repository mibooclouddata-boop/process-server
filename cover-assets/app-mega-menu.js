'use strict';
(()=>{
 const nav=document.getElementById('appNavigation');if(!nav||!window.AsOverviewBalanced)return;
 const bySelector=selector=>document.querySelector(selector);
 const targets={stats:'#tabAsBtn',list:'#asSubmenu [data-sub="list"]',product:'#appNavigation [data-sub="product"]',process:'#tabprocessBtn',dispatch:'#tabdispatchBtn',users:'#tabUsersBtn'};
 const available=key=>{const el=bySelector(targets[key]);return !!el&&!el.disabled&&el.getClientRects().length>0&&getComputedStyle(el).visibility!=='hidden';};
 const entry=(label,detail,target,action)=>({label,detail,target,action});
 const list=entry('AS 목록','접수 내역과 진행 상태 확인','list'),product=entry('제품 목록','등록 제품과 규격 확인','product');
 const process=entry('공정 관리','공정 일정과 진행 현황 확인','process'),dispatch=entry('배차 관리','배차 현황과 배송 일정 확인','dispatch');
 const overview=[entry('접수 현황','월별 추이와 유형별 접수 집계','stats','1'),entry('월별 유형 분포','접수 유형별 월간 분포 확인','stats','2')];
 const configs={
  stats:[['현황 분석',overview],['함께 확인',[list,product]]],
  list:[['접수 업무',[list,entry('AS 접수 등록','새로운 AS 접수 작성','list','create')]],['진행 단계',['접수','제작 요청','도장 요청','납품 요청'].map(label=>entry(label,'해당 단계의 접수 내역 확인','list','status'))]],
  process:[['공정 업무',[process]],['관련 업무',[list,dispatch]]],
  dispatch:[['배차 업무',[dispatch]],['관련 업무',[process,list]]],
  product:[['제품 업무',[product]],['관련 업무',[list,overview[0]]]],
  users:[['계정 관리',[entry('사용 관리','사용자 목록과 계정 상태 확인','users'),entry('사용자 등록','새로운 사용자 계정 작성','users','user-create')]],['권한 및 상태',[entry('접근 권한','사용자 목록에서 권한 확인','users'),entry('계정 사용관리','사용자 목록에서 계정 상태 확인','users')]]]
 };
 const menu=document.createElement('div');menu.id='asOverviewMenu';menu.className='app-mega-menu';menu.setAttribute('popover','auto');menu.setAttribute('role','menu');document.body.append(menu);
 let activeKey=null,openTimer,closeTimer,touch=false,routing=false;
 const isOpen=()=>menu.matches(':popover-open');
 function clearTimers(){clearTimeout(openTimer);clearTimeout(closeTimer)}
 function close(){clearTimers();if(isOpen())menu.hidePopover()}
 function position(){
  if(!activeKey)return;const rect=bySelector(targets[activeKey]).getBoundingClientRect();
  menu.style.maxHeight=Math.max(120,innerHeight-rect.bottom-20)+'px';
  menu.style.left=Math.max(12,Math.min(rect.left,innerWidth-Math.min(600,innerWidth-24)-12))+'px';menu.style.top=(rect.bottom+8)+'px';
 }
 function run(item){
  if(!available(item.target))return;close();
  if(item.action==='1'||item.action==='2'){AsOverviewBalanced.selectPage(item.action);bySelector(targets.stats).focus({preventScroll:true});return;}
  routing=true;try{bySelector(targets[item.target]).click()}finally{routing=false}
  // A declined unsaved-changes prompt must not be followed by a second action.
  if(item.target==='list'&&getComputedStyle(bySelector('#asSubList')).display==='none')return;
  if(item.target==='users'&&getComputedStyle(bySelector('#tabUsers')).display==='none')return;
  if(item.action==='create')openAsModal();
  if(item.action==='status')asKpiFilter(item.label);
  if(item.action==='user-create')openUserModal();
 }
 function open(key,focus=false){
  clearTimers();if(!available(key))return;activeKey=key;
  const trigger=bySelector(targets[key]);menu.setAttribute('aria-label',trigger.getAttribute('aria-label')+' 메뉴');menu.replaceChildren();
  const heading=document.createElement('div');heading.className='mega-heading';
  const title=document.createElement('strong');title.textContent=trigger.getAttribute('aria-label');const hint=document.createElement('span');hint.textContent='업무 바로가기';heading.append(title,hint);menu.append(heading);
  const columns=document.createElement('div');columns.className='mega-columns';menu.append(columns);
  for(const [label,items] of configs[key]){
   const allowed=items.filter(item=>available(item.target)&&(item.action!=='create'||AsPermissions.can(currentUser,'create')));if(!allowed.length)continue;
   const group=document.createElement('section');group.className='mega-group';group.setAttribute('role','group');group.setAttribute('aria-label',label);const h=document.createElement('h3');h.textContent=label;group.append(h);
   for(const item of allowed){const button=document.createElement('button');button.type='button';button.className='mega-link';button.setAttribute('aria-label',item.label);
    const radio=item.action==='1'||item.action==='2';button.setAttribute('role',radio?'menuitemradio':'menuitem');if(radio)button.setAttribute('aria-checked',String(bySelector('#asSubStats').dataset.overviewPage===item.action));
    const copy=document.createElement('span');copy.className='mega-copy';const name=document.createElement('strong');name.textContent=item.label;const detail=document.createElement('small');detail.textContent=item.detail;copy.append(name,detail);
    const arrow=document.createElement('span');arrow.className='mega-arrow';arrow.textContent='↗';arrow.setAttribute('aria-hidden','true');button.append(copy,arrow);button.addEventListener('click',()=>run(item));group.append(button);
   }columns.append(group);
  }
  Object.entries(targets).forEach(([k,selector])=>bySelector(selector)?.setAttribute('aria-expanded',String(k===key)));
  position();if(!isOpen())menu.showPopover();if(focus)menu.querySelector('button')?.focus({preventScroll:true});
 }
 for(const [key,selector] of Object.entries(targets)){
  const trigger=bySelector(selector);if(!trigger)continue;
  trigger.setAttribute('aria-haspopup','menu');trigger.setAttribute('aria-controls',menu.id);trigger.setAttribute('aria-expanded','false');
  const caret=document.createElementNS('http://www.w3.org/2000/svg','svg');caret.classList.add('mega-caret');caret.setAttribute('viewBox','0 0 16 16');caret.setAttribute('aria-hidden','true');caret.innerHTML='<path d="m4 6 4 4 4-4"/>';trigger.append(caret);
  trigger.addEventListener('pointerenter',e=>{if(e.pointerType==='touch')return;clearTimers();openTimer=setTimeout(()=>open(key),140)});
  trigger.addEventListener('pointerleave',()=>{clearTimeout(openTimer);closeTimer=setTimeout(close,300)});
  trigger.addEventListener('pointerdown',e=>{touch=e.pointerType==='touch'});
  trigger.addEventListener('click',event=>{
   if(routing)return;
   if(key==='stats'||touch){event.preventDefault();event.stopImmediatePropagation();touch=false;if(key==='stats')AsOverviewBalanced.selectPage(bySelector('#asSubStats').dataset.overviewPage||'1');open(key,true);}
   else close();
  },true);
  trigger.addEventListener('keydown',event=>{if(event.key==='ArrowDown'){event.preventDefault();event.stopImmediatePropagation();open(key,true)}},true);
 }
 menu.addEventListener('pointerenter',clearTimers);menu.addEventListener('pointerleave',()=>{closeTimer=setTimeout(close,300)});
 menu.addEventListener('beforetoggle',event=>{if(event.newState==='closed'){clearTimers();Object.values(targets).forEach(selector=>bySelector(selector)?.setAttribute('aria-expanded','false'));}});
 menu.addEventListener('keydown',event=>{
  const buttons=[...menu.querySelectorAll('button')],index=buttons.indexOf(document.activeElement);
  if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){event.preventDefault();buttons[event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length]?.focus();}
 });
 document.addEventListener('keydown',event=>{if(event.key==='Escape'&&isOpen()){event.preventDefault();const trigger=bySelector(targets[activeKey]);close();trigger.focus({preventScroll:true});}},true);
 document.addEventListener('focusin',event=>{if(isOpen()&&!menu.contains(event.target)&&!nav.contains(event.target))close()});
 document.addEventListener('pointerdown',event=>{if(isOpen()&&!menu.contains(event.target)&&!nav.contains(event.target))close()},true);
 window.addEventListener('resize',()=>{if(isOpen())position()});
 window.addEventListener('scroll',()=>{if(isOpen())close()},{passive:true});
})();
