'use strict';
(()=>{
 const header=document.querySelector('#dashboard>.app-topbar'),navigation=document.getElementById('appNavigation');
 if(!header||!navigation)return;
 header.insertBefore(navigation,header.querySelector('.app-header-tools'));
 navigation.setAttribute('aria-label','주 메뉴');
 const accountToggle=document.getElementById('appAccountToggle');
 if(accountToggle){
  const icon=document.createElementNS('http://www.w3.org/2000/svg','svg');
  icon.setAttribute('viewBox','0 0 24 24');icon.setAttribute('aria-hidden','true');icon.classList.add('top-account-icon');
  icon.innerHTML='<circle cx="12" cy="6.5" r="4"/><path d="M3 21a9 7.5 0 0 1 18 0Z"/>';
  accountToggle.append(icon);
 }
 const tabs=navigation.querySelector('.tabs'),selection=document.createElement('span');
 selection.className='top-nav-selection';selection.setAttribute('aria-hidden','true');tabs.prepend(selection);
 let frame;
 function updateSelection(){
  frame=undefined;
  const active=navigation.querySelector('[aria-current="page"]');if(!active?.getClientRects().length)return;
  const box=active.getBoundingClientRect(),parent=tabs.getBoundingClientRect();
  selection.style.width=box.width+'px';
  selection.style.transform=`translateX(${box.left-parent.left+tabs.scrollLeft-tabs.clientLeft}px)`;
  navigation.dataset.motionReady='true';
 }
 function scheduleSelection(){if(frame===undefined)frame=requestAnimationFrame(updateSelection);}
 new MutationObserver(records=>{if(records.some(record=>record.target!==selection))scheduleSelection();}).observe(tabs,{subtree:true,attributes:true,attributeFilter:['aria-current','style','hidden']});
 new ResizeObserver(scheduleSelection).observe(tabs);
 document.fonts.ready.then(scheduleSelection);
 scheduleSelection();
 // The legacy AS group uses vertical keys; translate horizontal keys in the header.
 navigation.addEventListener('keydown',event=>{
  if(!['ArrowLeft','ArrowRight'].includes(event.key))return;
  const buttons=[...navigation.querySelectorAll('button.tab,button.tab-sub')].filter(button=>button.getClientRects().length&&!button.disabled);
  const index=buttons.indexOf(event.target);if(index<0)return;
  event.preventDefault();const next=buttons[(index+(event.key==='ArrowRight'?1:-1)+buttons.length)%buttons.length];next.focus();next.click();
 });
})();
