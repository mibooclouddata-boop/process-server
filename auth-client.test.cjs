'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const IDLE=4*60*60*1000,ACTIVITY='lastUserActivityAt';
function idleClient(shared=new Map(),start=100000000,fetchImpl){
  let now=start,seq=0,redirect;const calls=[],notices=[],timers=new Map(),listeners=new Map();
  const session=new Map(),storage=map=>({getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,String(v)),removeItem:k=>map.delete(k)});
  const window={location:{origin:'https://work.example',href:'https://work.example/dashboard.html',replace:v=>redirect=v},
    addEventListener:(name,fn)=>listeners.set(name,fn),fetch:async(input,init)=>{calls.push({input,init});return fetchImpl?fetchImpl():{status:200,ok:true};}};
  window.top=window;
  const context={window,document:{documentElement:{},body:{appendChild:el=>notices.push(el)},createElement:()=>{const button={};return {setAttribute(){},addEventListener(){},querySelector:()=>button,showModal(){this.open=true;}};},addEventListener:(name,fn)=>listeners.set(name,fn)},URL,Headers,
    Date:{now:()=>now},localStorage:storage(shared),sessionStorage:storage(session),
    setTimeout:(fn,ms)=>{timers.set(++seq,{fn,at:now+ms});return seq},clearTimeout:id=>timers.delete(id)};
  vm.createContext(context);vm.runInContext(fs.readFileSync(__dirname+'/auth-client.js','utf8'),context);
  return {window,calls,notices,shared,session,context,redirect:()=>redirect,now:()=>now,
    event:(name,extra={})=>listeners.get(name)?.({isTrusted:true,...extra}),
    async advance(ms,run=true){now+=ms;if(run){for(const [id,t]of [...timers])if(t.at<=now){timers.delete(id);t.fn();}}await new Promise(setImmediate);}};
}
function confirmExpiry(c){
  assert.equal(c.redirect(),undefined,'expiry waits for acknowledgement');
  assert.equal(c.notices.length,1);assert.equal(c.notices[0].open,true);
  assert.match(c.notices[0].innerHTML,/4시간 동안 활동이 없어 로그아웃되었습니다/);
  c.notices[0].querySelector('button').onclick();assert.equal(c.redirect(),'/login.html');
}
test('four hours without input revokes the session; background API traffic does not extend it',async()=>{
  const c=idleClient();await c.advance(IDLE-1);await c.window.fetch('/api/as');assert.equal(c.redirect(),undefined);
  await c.advance(1);confirmExpiry(c);
  const logout=c.calls.find(c=>c.input==='/api/logout');assert(logout);assert.equal(logout.init.method,'POST');
  assert.equal(new Headers(logout.init.headers).get('X-Requested-With'),'process-server');
  assert.equal(c.shared.get(ACTIVITY),'-1');
});
test('real input extends inactivity; synthetic events and refresh do not',async()=>{
  const c=idleClient();await c.advance(IDLE-1000);c.event('keydown');await c.advance(1000);assert.equal(c.redirect(),undefined);
  const reload=idleClient(c.shared,c.now());await reload.advance(IDLE-1001);assert.equal(reload.redirect(),undefined);
  reload.event('pointermove',{isTrusted:false});await reload.advance(1);confirmExpiry(reload);
});
test('activity in another tab protects an idle tab and logout propagates',async()=>{
  const c=idleClient();await c.advance(IDLE-1000);c.shared.set(ACTIVITY,String(c.now()));await c.advance(1000);
  assert.equal(c.redirect(),undefined);c.shared.set(ACTIVITY,'0');c.event('storage',{key:ACTIVITY});
  await new Promise(setImmediate);assert.equal(c.redirect(),'/login.html');assert.equal(c.calls.length,0);
});
test('input just before the deadline immediately protects every tab',async()=>{
  const first=idleClient(),second=idleClient(first.shared);
  await first.advance(IDLE-500);first.event('keydown');await second.advance(IDLE);
  assert.equal(second.redirect(),undefined);assert.equal(second.calls.length,0);
});
test('idle expiry from another tab shows the notice without a duplicate logout request',async()=>{
  const first=idleClient(),second=idleClient(first.shared);
  await first.advance(IDLE);second.event('storage',{key:ACTIVITY});
  confirmExpiry(second);assert.equal(second.calls.length,0);
});
test('return from sleep cannot revive expiry through first input or a protected API request',async()=>{
  for(const action of ['pointerdown','visibilitychange','fetch']){
    const c=idleClient();await c.advance(IDLE+1,false);
    if(action==='fetch')await assert.rejects(c.window.fetch('/api/as'));else c.event(action);
    await new Promise(setImmediate);confirmExpiry(c);
    assert.equal(c.calls.filter(c=>c.input==='/api/as').length,0);
  }
});
test('manual logout is shared and clears the idle timer',async()=>{
  const c=idleClient();await c.window.fetch('/api/logout',{method:'POST'});await c.advance(IDLE);
  assert.equal(c.shared.get(ACTIVITY),'0');assert.equal(c.calls.length,1);
});
test('recent input survives immediate navigation and network loss cannot hold the protected screen open',async()=>{
  const c=idleClient();await c.advance(IDLE-1000);c.event('keydown');c.event('pagehide');
  assert.equal(c.shared.get(ACTIVITY),String(c.now()));
  const offline=idleClient(new Map(),100000000,()=>new Promise(()=>{}));
  const ctx=offline.context;
  await offline.advance(IDLE);assert.equal(ctx.document.documentElement.inert,true);
  await offline.advance(2000);confirmExpiry(offline);
});
test('web client adds CSRF headers only to same-origin writes and handles expiry',async()=>{
  const calls=[],removed=[];let redirect,status=200;
  const window={location:{origin:'https://work.example',href:'https://work.example/dashboard.html',replace:value=>redirect=value},fetch:async(input,init)=>{calls.push({input,init});return {status};}};
  window.top=window;window.addEventListener=()=>{};
  const context={window,URL,Headers,document:{addEventListener(){}},setTimeout:()=>1,clearTimeout(){},sessionStorage:{getItem:()=>null,setItem(){},removeItem:key=>removed.push('session:'+key)},localStorage:{getItem:()=>null,setItem(){},removeItem:key=>removed.push('local:'+key)}};
  vm.createContext(context);vm.runInContext(fs.readFileSync(__dirname+'/auth-client.js','utf8'),context);
  const body=new FormData();body.append('remark','test');
  await window.fetch('/api/as',{method:'POST',body});
  assert.equal(calls.at(-1).init.headers.get('X-Requested-With'),'process-server');
  assert.equal(calls.at(-1).init.body,body);
  assert.equal(calls.at(-1).init.headers.get('Content-Type'),null);
  await window.fetch('https://elsewhere.example/api/as',{method:'POST'});
  assert.equal(calls.at(-1).init.headers,undefined);
  await window.fetch('/api/as');assert.equal(calls.at(-1).init.headers,undefined);
  const request=new Request('https://work.example/api/as',{method:'PUT',headers:{'Content-Type':'application/json'},body:'{}'});
  await window.fetch(request);
  assert.equal(calls.at(-1).init.headers.get('Content-Type'),'application/json');
  assert.equal(calls.at(-1).init.headers.get('X-Requested-With'),'process-server');
  status=401;await window.fetch('/api/login',{method:'POST'});assert.equal(redirect,undefined);
  await window.fetch('/api/me');assert.equal(redirect,'/login.html');
  assert.deepEqual(removed,['local:currentUser','session:currentUser']);
});
