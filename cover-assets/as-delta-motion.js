/* Keep the accessible value intact; roll a decorative copy above it. */
(()=>{
 'use strict';
 const node=document.getElementById('comparison-change-value'),label=document.getElementById('comparison-change'),overview=document.getElementById('asSubStats'),dashboard=document.getElementById('dashboard');
 if(!node||!label||!overview||!dashboard)return;
 const reduced=matchMedia('(prefers-reduced-motion: reduce)');
 let previous='',previousColor='',animation,overlay,frame,pending=true,revealing=false;
 label.style.position='relative';node.style.display='inline-block';
 function cancel(){animation?.cancel();animation=null;overlay?.remove();overlay=null;node.style.opacity='';}
 function play(){
  if(!pending)return;
  if(label.hidden){pending=false;cancel();previous='';return;}
  if(overview.getAttribute('aria-busy')!=='false'||!overview.getClientRects().length||(dashboard.inert&&!revealing))return;
  pending=false;cancel();
  const text=node.textContent,color=getComputedStyle(node).color,old=previous||'0',oldColor=previousColor||color;
  previous=node.dataset.direction==='unchanged'?'0':text;previousColor=color;
  if(reduced.matches||node.dataset.direction==='unchanged')return;
  const rect=node.getBoundingClientRect(),parent=label.getBoundingClientRect();
  if(!rect.width||!rect.height)return;
  overlay=document.createElement('span');overlay.className='as-delta-roll';overlay.setAttribute('aria-hidden','true');
  overlay.style.cssText='position:absolute;pointer-events:none;overflow:hidden;left:'+(rect.left-parent.left)+'px;top:'+(rect.top-parent.top)+'px;width:'+rect.width+'px;height:'+rect.height+'px;font:inherit;';
  const track=document.createElement('span'),before=document.createElement('span'),after=document.createElement('span');
  track.style.display='block';
  for(const el of [before,after])el.style.cssText='display:block;height:'+rect.height+'px;line-height:'+rect.height+'px;font-family:inherit;font-size:'+getComputedStyle(node).fontSize+';font-weight:'+getComputedStyle(node).fontWeight+';white-space:nowrap';
  before.textContent=old;before.style.color=oldColor;after.textContent=text;after.style.color=color;
  const up=node.dataset.direction==='increase';track.append(...(up?[before,after]:[after,before]));overlay.append(track);label.append(overlay);node.style.opacity='0';
  const current=track.animate([{transform:'translateY('+(up?0:-rect.height)+'px)'},{transform:'translateY('+(up?-rect.height:0)+'px)'}],{duration:480,easing:'cubic-bezier(.2,.7,.2,1)',fill:'forwards'});
  current.id='as-delta-number-roll';animation=current;
  current.finished.then(()=>{if(animation===current)cancel();}).catch(()=>{});
 }
 function schedule(){cancelAnimationFrame(frame);frame=requestAnimationFrame(play);}
 new MutationObserver(()=>{cancel();pending=true;schedule();}).observe(node,{childList:true,characterData:true,subtree:true,attributes:true,attributeFilter:['data-direction']});
 const visibility=new MutationObserver(schedule);
 visibility.observe(label,{attributes:true,attributeFilter:['hidden']});visibility.observe(overview,{attributes:true,attributeFilter:['style','aria-busy']});visibility.observe(dashboard,{attributes:true,attributeFilter:['inert']});
 window.addEventListener('login-transition-reveal',()=>{revealing=true;schedule();},{once:true});
 window.addEventListener('resize',cancel);
 reduced.addEventListener('change',()=>{if(reduced.matches)cancel();});
 schedule();
})();
