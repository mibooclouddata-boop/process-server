'use strict';
(()=>{
 const root=document.getElementById('asSubStats'),content=document.getElementById('asStatsContent');
 if(!root||!content)return;
 const heatmap=root.querySelector('.as-reason-heatmap-panel');if(heatmap)content.append(heatmap);
 const recent=document.createElement('section');recent.className='as-stats-chart-panel as-recent-panel';recent.setAttribute('aria-label','최근 접수');
 const heading=document.createElement('div');heading.className='as-recent-heading';
 const title=document.createElement('h2');title.textContent='최근 접수';
 heading.append(title);
 const listWrap=document.createElement('div');listWrap.className='as-recent-scroll';
 const rows=document.createElement('ol');rows.className='as-recent-list';rows.setAttribute('aria-label','최근 접수 최대 5건');listWrap.append(rows);recent.append(heading,listWrap);content.append(recent);
 const text=(tag,className,value)=>{const node=document.createElement(tag);node.className=className;node.textContent=value;return node;};
 function refreshRecent(records){
  rows.replaceChildren();
  const latest=(Array.isArray(records)?records:[]).filter(record=>record&&typeof record==='object').slice().sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||''))||String(b.asNo||'').localeCompare(String(a.asNo||''),undefined,{numeric:true})).slice(0,5);
  for(const [index,record] of latest.entries()){
   const item=document.createElement('li');item.className='as-recent-item';item.title=String(record.asNo||'—')+' · '+String(record.createdAt||'').slice(0,10);
   const number=text('span','as-recent-index',String(index+1).padStart(2,'0'));number.setAttribute('aria-hidden','true');
   const main=document.createElement('div');main.className='as-recent-main';
   const product=text('strong','as-recent-product',String(record.product||'미입력'));product.title=product.textContent;
   const meta=text('span','as-recent-meta',[record.ship,record.block,record.element].map(value=>String(value||'—')).join(' / '));meta.title=meta.textContent;
   main.append(product,meta);
   const end=document.createElement('div');end.className='as-recent-end';
   const status=text('span','as-recent-status',String(record.status||'—'));
   const reason=text('span','as-chart-sr-only',String(record.reason||'사유 미입력'));
   end.append(status);item.append(number,main,end,reason);rows.append(item);
  }
  listWrap.querySelector('.as-recent-empty')?.remove();rows.hidden=!latest.length;
  if(!latest.length)listWrap.append(text('p','as-recent-empty','최근 접수 내역이 없습니다.'));
 }
 const yearControls=root.querySelector('.as-period-controls');
 function placeYearControls(){
  const target=root.querySelector(root.dataset.overviewPage==='2'?'.as-reason-heatmap-heading':'.as-readable-trend .as-stats-chart-heading');
  if(yearControls&&target)target.append(yearControls);
 }
 root.dataset.overviewPage='1';placeYearControls();
 const overviewButton=document.querySelector('#asSubmenu [data-sub="stats"]');
 if(overviewButton){
  const menu=document.createElement('div');menu.id='asOverviewMenu';menu.className='as-overview-menu';menu.setAttribute('popover','auto');menu.setAttribute('role','menu');menu.setAttribute('aria-label','AS 현황 화면 선택');
  overviewButton.setAttribute('aria-haspopup','menu');overviewButton.setAttribute('aria-controls',menu.id);overviewButton.setAttribute('aria-expanded','false');
  const caret=document.createElementNS('http://www.w3.org/2000/svg','svg');caret.classList.add('as-overview-caret');caret.setAttribute('viewBox','0 0 16 16');caret.setAttribute('aria-hidden','true');caret.innerHTML='<path d="m4 6 4 4 4-4"/>';overviewButton.append(caret);
  const choices=[['1','접수 현황'],['2','월별 유형 분포']].map(([value,label])=>{
   const button=document.createElement('button');button.type='button';button.setAttribute('role','menuitemradio');button.setAttribute('aria-checked',String(value==='1'));button.textContent=label;
   button.onclick=()=>{root.dataset.overviewPage=value;placeYearControls();choices.forEach((choice,index)=>choice.setAttribute('aria-checked',String(index+1)===value?'true':'false'));menu.hidePopover();overviewButton.focus({preventScroll:true});window.dispatchEvent(new Event('resize'));};menu.append(button);return button;
  });document.body.append(menu);
  function placeMenu(){const rect=overviewButton.getBoundingClientRect();menu.style.left=Math.max(8,Math.min(rect.left,innerWidth-Math.min(180,innerWidth-16)-8))+'px';menu.style.top=(rect.bottom+8)+'px';}
  overviewButton.addEventListener('click',()=>{placeMenu();menu.togglePopover();if(menu.matches(':popover-open'))choices[Number(root.dataset.overviewPage)-1].focus();});
  menu.addEventListener('beforetoggle',event=>overviewButton.setAttribute('aria-expanded',String(event.newState==='open')));
  menu.addEventListener('keydown',event=>{const index=choices.indexOf(document.activeElement);if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?1:(index+(event.key==='ArrowDown'?1:-1)+choices.length)%choices.length;choices[next].focus();}else if(event.key==='Escape'){menu.hidePopover();overviewButton.focus();}});
  window.addEventListener('resize',()=>{if(menu.matches(':popover-open'))placeMenu();});
 }
 window.AsOverviewBalanced={refreshRecent};
 if(typeof _asStatsRecords!=='undefined')refreshRecent(_asStatsRecords);
 const desktop=matchMedia('(min-width:1101px) and (min-height:760px)');
 function update(){document.body.classList.toggle('as-balanced-active',desktop.matches&&getComputedStyle(root).display!=='none');}
 new MutationObserver(update).observe(root,{attributes:true,attributeFilter:['style']});
 desktop.addEventListener('change',update);update();
})();
