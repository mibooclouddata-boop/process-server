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
 function selectPage(value){
  if(!['1','2'].includes(value))return;
  if(!root.getClientRects().length)switchTab('as',overviewButton,'stats');
  if(getComputedStyle(root).display==='none')return;
  root.dataset.overviewPage=value;placeYearControls();window.dispatchEvent(new Event('resize'));
 }
 window.AsOverviewBalanced={refreshRecent,selectPage};
 if(typeof _asStatsRecords!=='undefined')refreshRecent(_asStatsRecords);
 const desktop=matchMedia('(min-width:1101px) and (min-height:760px)');
 function update(){document.body.classList.toggle('as-balanced-active',desktop.matches&&getComputedStyle(root).display!=='none');}
 new MutationObserver(update).observe(root,{attributes:true,attributeFilter:['style']});
 desktop.addEventListener('change',update);update();
})();
