'use strict';
(()=>{
 const header=document.querySelector('#dashboard>.app-topbar');
 if(!header)return;
 const brand=header.querySelector('.topbar-title'),toggle=document.getElementById('appRailToggle');
 let location=header.querySelector('.app-location');
 if(!brand||!toggle)return;
 if(!location){
  location=document.createElement('div');location.className='app-location';
  const page=document.getElementById('appHeaderPage')||document.createElement('strong');
  page.id='appHeaderPage';if(!page.textContent)page.textContent='AS 접수 현황';location.append(page);
 }
 header.prepend(brand,toggle,location);
 header.querySelectorAll('.rail-header-slot,.rail-brand-region').forEach(node=>{if(!node.childNodes.length)node.remove();});
})();
