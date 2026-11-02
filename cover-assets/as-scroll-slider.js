'use strict';
(()=>{
 const viewport=document.querySelector('#asSubList .as-ledger-scroll');
 const table=viewport?.querySelector('table');
 if(!viewport||!table)return;
 const control=document.createElement('div');control.className='as-scroll-control';control.hidden=true;
 const range=document.createElement('input');range.type='range';range.min='0';range.max='0';range.value='0';range.step='1';
 range.setAttribute('aria-label','목록 가로 스크롤 위치');
 control.append(range);viewport.after(control);viewport.classList.add('has-scroll-slider');
 function sync(){
  const max=Math.max(0,viewport.scrollWidth-viewport.clientWidth);
  range.max=String(max);range.value=String(Math.min(max,Math.max(0,viewport.scrollLeft)));
  range.disabled=max===0;control.hidden=max===0;
  range.setAttribute('aria-valuetext',max?Math.round(Number(range.value)/max*100)+'%':'전체 표시');
 }
 range.addEventListener('input',()=>{viewport.scrollLeft=Number(range.value);sync();});
 viewport.addEventListener('scroll',sync,{passive:true});
 const observer=new ResizeObserver(sync);observer.observe(viewport);observer.observe(table);
 sync();
})();
