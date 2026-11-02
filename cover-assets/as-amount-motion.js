/* Roll only changed digits; monetary values remain formatted integer strings. */
window.AsAmountMotion=(()=>{
 const preference=matchMedia('(prefers-reduced-motion: reduce)'),states=new Map();
 function finish(element,state){
  state.animations.forEach(a=>a.cancel());state.animations=[];
  const final=document.createElement('span');final.className='as-amount-roll-digits';final.textContent=state.text;state.stage.replaceChildren(final);
 }
 function render(element,text,reserve){
  const previous=states.get(element),numeric=/^[\d,]+$/.test(text);
  if(previous?.text===text){previous.stage.dataset.reserve=numeric?reserve:text;return;}
  if(previous)finish(element,previous);
  const stage=document.createElement('span');stage.className='as-amount-roll-stage';stage.dataset.reserve=numeric?reserve:text;stage.setAttribute('aria-hidden','true');
  const state={text,stage,animations:[]};states.set(element,state);
  element.setAttribute('role','img');element.setAttribute('aria-label',text+(numeric?'원':''));element.replaceChildren(stage);
  if(numeric){const unit=document.createElement('small');unit.textContent='원';unit.setAttribute('aria-hidden','true');element.append(unit);}
  if(!numeric||!previous||!/^[\d,]+$/.test(previous.text)||preference.matches||!element.getClientRects().length){finish(element,state);return;}
  const digits=document.createElement('span');digits.className='as-amount-roll-digits';stage.append(digits);
  const count=Math.max(previous.text.length,text.length),waits=[];
  for(let i=0;i<count;i++){
   const old=previous.text[i-(count-previous.text.length)]||'',next=text[i-(count-text.length)]||'';
   const slot=document.createElement('span');slot.className='as-amount-roll-slot';digits.append(slot);
   if(old===next){slot.textContent=next;continue;}
   slot.dataset.reserve=next||old;
   const outgoing=document.createElement('span'),incoming=document.createElement('span');outgoing.textContent=old;incoming.textContent=next;slot.append(outgoing,incoming);
   const frames=[[{transform:'translateY(0)',opacity:1},{transform:'translateY(-100%)',opacity:0}],[{transform:'translateY(100%)',opacity:0},{transform:'translateY(0)',opacity:1}]];
   [outgoing,incoming].forEach((node,index)=>{const a=node.animate(frames[index],{duration:380,easing:'cubic-bezier(.22,.7,.3,1)',fill:'both'});a.id='as-amount-digit-roll';state.animations.push(a);waits.push(a.finished.catch(()=>{}));});
  }
  Promise.all(waits).then(()=>{if(states.get(element)===state)finish(element,state);});
 }
 preference.addEventListener('change',()=>{if(preference.matches)for(const [element,state] of states)finish(element,state);});
 return {render};
})();
