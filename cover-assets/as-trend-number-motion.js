/* Animate only the selected month's count; the source value remains authoritative. */
(()=>{
 'use strict';
 const preference=matchMedia('(prefers-reduced-motion: reduce)');
 let target,observer,animations=[],source='',previous=null,generation=0;
 const stop=()=>{generation++;animations.forEach(a=>a.cancel());animations=[];};
 function update(){
  const html=target.innerHTML;if(html===source)return;
  observer.disconnect();stop();source=html;
  const text=target.firstChild?.nodeType===Node.TEXT_NODE?target.firstChild.textContent.trim():'';
  const value=/^\d[\d,]*$/.test(text)?Number(text.replaceAll(',','')):null;
  const old=previous;previous=value;
  if(value!==null&&value!==old&&!preference.matches){
   const token=generation,from=String(old??0).padStart(String(value).length,'0');
   const visual=document.createElement('span');visual.setAttribute('aria-hidden','true');
   visual.style.cssText='display:inline-flex;vertical-align:bottom;font:inherit;color:inherit;font-variant-numeric:tabular-nums;line-height:1.3';
   const spoken=document.createElement('span');spoken.textContent=text;spoken.style.cssText='position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap';
   target.firstChild.replaceWith(spoken,visual);
   let digitIndex=0;
   for(const character of text){
    const box=document.createElement('span');box.style.cssText='display:inline-block;height:1.3em;overflow:hidden';visual.append(box);
    if(character===','){box.textContent=character;continue;}
    const start=Number(from[digitIndex]||0),end=Number(character),steps=(end-start+10)%10;
    const reel=document.createElement('span');reel.style.display='block';box.append(reel);
    for(let n=0;n<=steps;n++){const digit=document.createElement('span');digit.textContent=(start+n)%10;digit.style.cssText='display:block;height:1.3em;line-height:1.3;text-align:center';reel.append(digit);}
    if(steps)animations.push(reel.animate([{transform:'translateY(0)'},{transform:`translateY(-${steps*1.3}em)`}],{duration:650+digitIndex*50,easing:'cubic-bezier(.16,1,.3,1)',fill:'forwards'}));
    digitIndex++;
   }
   Promise.allSettled(animations.map(a=>a.finished)).then(()=>{if(generation!==token)return;observer.disconnect();target.innerHTML=source;animations=[];observer.observe(target,{childList:true});});
  }
  observer.observe(target,{childList:true});
 }
 function attach(){const found=document.getElementById('comparison-count');if(!found)return;setup.disconnect();target=found;observer=new MutationObserver(update);observer.observe(target,{childList:true});update();}
 const setup=new MutationObserver(attach);setup.observe(document.body,{subtree:true,childList:true});attach();
 preference.addEventListener('change',()=>{if(!preference.matches||!target)return;stop();observer.disconnect();target.innerHTML=source;observer.observe(target,{childList:true});});
})();
