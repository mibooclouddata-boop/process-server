'use strict';
(() => {
 const ENTER=360,READ=1250,EXIT=440,LIMIT=8000;
 const page=document.currentScript.dataset.page,root=document.documentElement;
 const hostFrame=window.frameElement;
 if(page==='dashboard'&&hostFrame?.id==='loginTransitionFrame'){
  const host=window.parent.LoginTransition,signal=host?.signal;
  const current=()=>hostFrame.isConnected&&window.parent.document.getElementById('loginTransitionFrame')===hostFrame;
  window.LoginTransition={get active(){return current()&&!!host?.active;},get signal(){return current()&&host?.active?signal:undefined;},ready(){if(current())host?.ready();},fail(message){if(current())host?.fail(message);}};
  return;
 }
 if(page!=='login'){window.LoginTransition={active:false,ready(){},fail(){}};return;}
 const loginTitle=document.title;
 const motion=matchMedia('(prefers-reduced-motion: reduce)');
 let overlay,title,status,retry,controller,deadline,finishTimer,slowTimer,state='idle',record,frame;
 const transition=window.LoginTransition={
  get active(){return state!=='idle';},
  get signal(){return transition.active?controller?.signal:undefined;},
  start,ready,fail
 };
 function cancel(){clearTimeout(deadline);clearTimeout(finishTimer);clearTimeout(slowTimer);controller?.abort();}
 function reset(){
  cancel();overlay?.remove();overlay=null;state='idle';root.removeAttribute('data-login-transition');
  frame?.remove();frame=null;document.body.classList.remove('login-app-open');
  document.title=loginTitle;
  const main=document.querySelector('main');if(page==='login'&&main){main.hidden=false;main.inert=false;main.classList.remove('login-exit');}
  window.dispatchEvent(new Event('login-transition-reset'));
 }
 function mount(next){
  cancel();record=next;state='loading';controller=new AbortController();
  root.setAttribute('data-login-transition','source');
  if(!overlay){
   overlay=document.createElement('section');overlay.id='loginTransition';overlay.className='login-crossfade';overlay.setAttribute('aria-label','업무 화면 연결');
   const copy=document.createElement('div');copy.className='login-crossfade-copy';
   title=document.createElement('h2');title.id='loginTransitionTitle';title.tabIndex=-1;
   status=document.createElement('p');status.id='loginTransitionStatus';status.setAttribute('role','status');
   const actions=document.createElement('div');actions.className='login-crossfade-actions';
   retry=document.createElement('button');retry.id='loginTransitionRetry';retry.type='button';retry.textContent='다시 시도';retry.addEventListener('click',restart);
   const back=document.createElement('a');back.href='/login.html';back.textContent='로그인으로 돌아가기';
   actions.append(retry,back);copy.append(title,status,actions);overlay.append(copy);document.body.append(overlay);
  }
  overlay.classList.toggle('login-crossfade-source',!frame);
  overlay.classList.toggle('no-greeting',!record.greet);overlay.classList.remove('is-error','is-leaving');
  overlay.setAttribute('aria-busy','true');retry.parentElement.hidden=true;
  title.replaceChildren();
  if(record.greet){const name=document.createElement('span');name.textContent=record.name;title.append('안녕하세요, ',name,'님');}
  else title.textContent='업무 화면을 준비하고 있어요';
  overlay.style.setProperty('--greeting-delay',(record.startedAt-Date.now())+'ms');
  status.textContent='업무 화면을 준비하고 있어요.';
  title.focus({preventScroll:true});
  const main=document.querySelector('main');if(page==='login'&&main){main.inert=true;main.classList.add('login-exit');}
  slowTimer=setTimeout(()=>{if(state==='loading')status.textContent='연결이 조금 늦어지고 있어요. 화면이 준비되면 바로 이어집니다.';},2400);
  deadline=setTimeout(()=>fail('서버 응답이 지연되고 있습니다. 다시 시도하거나 로그인 화면으로 돌아가 주세요.'),Math.max(0,LIMIT-(Date.now()-record.startedAt)));
 }
 function navigate(){
  frame?.remove();const next=document.createElement('iframe');frame=next;
  next.id='loginTransitionFrame';next.title='MIBOO 업무시스템';next.inert=true;next.setAttribute('aria-hidden','true');
  next.addEventListener('load',()=>{
   if(frame!==next)return;
   try{
    const url=new URL(next.contentWindow.location.href);
    if(state==='idle'){
     if(['/','/cover.html','/login.html'].includes(url.pathname))window.location.replace(url.pathname);
     return;
    }
    if(url.origin!==location.origin||url.pathname!=='/dashboard.html'||!next.contentWindow.LoginTransition){
     fail('업무 화면에 연결하지 못했습니다. 다시 시도하거나 로그인으로 돌아가 주세요.');
    }
   }catch{fail('업무 화면에 연결하지 못했습니다. 다시 시도해 주세요.');}
  });
  next.addEventListener('error',()=>{if(frame===next)fail('업무 화면 연결에 실패했습니다. 다시 시도해 주세요.');});
  next.src='/dashboard.html';document.body.append(next);
 }
 function start(user){
  if(transition.active)return;
  mount({name:String(user?.name||'사용자').slice(0,120),startedAt:Date.now()+(motion.matches?0:180),greet:true});navigate();
 }
 function restart(){
  if(state!=='error')return;
  mount({name:'',startedAt:Date.now(),greet:false});
  navigate();
 }
 function fail(message){
  if(state==='idle'||state==='error')return;
  cancel();frame?.remove();frame=null;
  state='error';root.setAttribute('data-login-transition','error');
  overlay.classList.remove('is-leaving');overlay.classList.add('is-error');overlay.setAttribute('aria-busy','false');
  title.textContent='업무 화면을 열지 못했어요';status.textContent=message;retry.parentElement.hidden=false;retry.focus();
 }
 function ready(){
  if(state!=='loading')return;
  state='ready';clearTimeout(deadline);clearTimeout(slowTimer);
  const remaining=record.greet?Math.max(0,record.startedAt+(motion.matches?0:ENTER)+READ-Date.now()):0;
  finishTimer=setTimeout(()=>{
   requestAnimationFrame(()=>requestAnimationFrame(()=>{
    if(state!=='ready')return;
    root.setAttribute('data-login-transition','leaving');overlay.classList.add('is-leaving');
    finishTimer=setTimeout(()=>{
     if(state!=='ready')return;
     cancel();overlay.remove();overlay=null;state='idle';root.removeAttribute('data-login-transition');
     const main=document.querySelector('main');if(main)main.hidden=true;
     document.body.classList.add('login-app-open');frame.inert=false;frame.setAttribute('aria-hidden','false');
     document.title=frame.contentDocument.title;
     if(location.pathname==='/login.html')history.pushState({loginTransition:true},'', '/dashboard.html');
     const dashboard=frame.contentDocument.getElementById('dashboard');if(dashboard)dashboard.inert=false;
     const heading=frame.contentDocument.querySelector('#asSubStats h1');
     if(heading){heading.tabIndex=-1;heading.focus({preventScroll:true});}
    },motion.matches?0:EXIT);
   }));
  },remaining);
 }
 window.addEventListener('pagehide',cancel);
 window.addEventListener('popstate',()=>{
  if(page!=='login')return;
  if(location.pathname==='/login.html'){
   // Removing a frame does not run its beforeunload handler; keep the existing edit guard.
   try{if(frame?.contentWindow.asLedgerCanLeave?.()===false){history.go(1);return;}}catch{}
   reset();
  }
  else if(location.pathname==='/dashboard.html'&&!frame){mount({name:'',startedAt:Date.now(),greet:false});navigate();}
 });
 window.addEventListener('pageshow',event=>{
  if(!event.persisted)return;
  if(page==='login'&&location.pathname==='/login.html')reset();
  else if(page==='login'&&transition.active){state='error';restart();}
 });
})();
