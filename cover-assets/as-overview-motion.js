/* Animate the first successful overview load; refreshing data does not replay it. */
(()=>{
 'use strict';
 const overview=document.getElementById('asSubStats');
 const content=document.getElementById('asStatsContent');
 if(!overview||!content)return;
 const preference=matchMedia('(prefers-reduced-motion: reduce)');
 let animations=[];
 const cancel=()=>{if(preference.matches)animations.forEach(animation=>animation.cancel());};
 const enter=()=>{
  if(overview.getAttribute('aria-busy')!=='false'||content.hidden)return;
  observer.disconnect();
  if(preference.matches)return;
  preference.addEventListener('change',cancel);
  animations=Array.from(overview.querySelectorAll('#asKpiRow>button,.as-stats-chart-panel'),(element,index)=>{
   const animation=element.animate([
    {opacity:0,transform:'translateY(12px)'},
    {opacity:1,transform:'translateY(0)'}
   ],{duration:480,delay:Math.min(index*45,360),easing:'cubic-bezier(.22,.7,.3,1)',fill:'backwards'});
   animation.id='as-overview-enter';
   return animation;
  });
  Promise.allSettled(animations.map(animation=>animation.finished)).then(()=>{
   preference.removeEventListener('change',cancel);
   animations=[];
  });
 };
 const observer=new MutationObserver(enter);
 observer.observe(overview,{attributes:true,attributeFilter:['aria-busy']});
 enter();
})();
