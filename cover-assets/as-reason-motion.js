/* Slide final values into place while revealing their proportional bars. */
(()=>{
 'use strict';
 const list=document.getElementById('asStatsReasons'),overview=document.getElementById('asSubStats'),content=document.getElementById('asStatsContent'),dashboard=document.getElementById('dashboard');
 if(!list||!overview||!content||!dashboard)return;
 const preference=matchMedia('(prefers-reduced-motion: reduce)');
 let animations=[],pending=true,frame=0,revealing=false;
 function cancel(){animations.forEach(a=>a.cancel());animations=[];}
 function play(){
  frame=0;
  if(!pending||overview.getAttribute('aria-busy')!=='false'||content.hidden||!overview.getClientRects().length||(dashboard.inert&&!revealing))return;
  pending=false;cancel();
  if(preference.matches)return;
  list.querySelectorAll('.as-reason-ranking-row').forEach(row=>{
   const count=row.querySelector('.as-reason-count'),percent=row.querySelector('.as-reason-percent'),bar=row.querySelector('.as-reason-track i');
   if(!count||!percent||!bar)return;
   let number=count.querySelector('.as-reason-number');
   if(!number&&count.firstChild?.nodeType===Node.TEXT_NODE){number=document.createElement('span');number.className='as-reason-number';number.textContent=count.firstChild.textContent;number.style.cssText='display:inline-block;font:inherit;color:inherit;letter-spacing:inherit';count.firstChild.replaceWith(number);}
   for(const node of [number,percent].filter(Boolean)){
    const a=node.animate([{transform:'translateY(12px)',opacity:0},{transform:'translateY(0)',opacity:1}],{duration:420,delay:120,easing:'cubic-bezier(.2,.7,.2,1)',fill:'backwards'});a.id='as-reason-number-slide';animations.push(a);
   }
   bar.style.transformOrigin='left';
   const a=bar.animate([{transform:'scaleX(0)'},{transform:'scaleX(1)'}],{duration:650,easing:'cubic-bezier(.33,1,.68,1)'});a.id='as-reason-bar-fill';animations.push(a);
  });
 }
 function schedule(){cancelAnimationFrame(frame);frame=requestAnimationFrame(play);}
 new MutationObserver(()=>{pending=true;cancel();schedule();}).observe(list,{childList:true});
 const visibility=new MutationObserver(schedule);
 visibility.observe(overview,{attributes:true,attributeFilter:['aria-busy','style']});
 visibility.observe(content,{attributes:true,attributeFilter:['hidden']});
 visibility.observe(dashboard,{attributes:true,attributeFilter:['inert']});
 window.addEventListener('login-transition-reveal',()=>{revealing=true;schedule();},{once:true});
 preference.addEventListener('change',()=>{if(preference.matches)cancel();});
 schedule();
})();
