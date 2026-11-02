'use strict';
(()=>{
 const header=document.querySelector('#dashboard>.app-topbar');
 if(!header)return;
 const brand=header.querySelector('.topbar-title'),toggle=document.getElementById('appRailToggle');
 if(!brand||!toggle)return;
 header.querySelector('.app-location')?.remove();
 header.prepend(brand,toggle);
 header.querySelectorAll('.rail-header-slot,.rail-brand-region').forEach(node=>{if(!node.childNodes.length)node.remove();});
})();
