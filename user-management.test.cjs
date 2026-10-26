const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const html=fs.readFileSync('dashboard.html','utf8');
const source=html.slice(html.indexOf('let adminUsersCache ='),html.indexOf('// ── 관리자: 모달에서 저장'));
function setup(){
 const elements=new Map();
 const get=id=>{if(!elements.has(id))elements.set(id,{value:'',innerHTML:'',textContent:'',querySelectorAll:()=>[]});return elements.get(id)};
 let response={ok:true,json:async()=>({users:[]})};
 const ctx={document:{getElementById:get},SERVER:'',fetch:async()=>response};
 vm.createContext(ctx);vm.runInContext(source,ctx);
 return {ctx,get,respond:r=>response=r,seed:users=>vm.runInContext('adminUsersCache='+JSON.stringify(users),ctx)};
}
test('user summary escapes untrusted names, keeps actual permissions and protects default admin',()=>{
 const {ctx,get,seed}=setup();
 seed([{id:'admin',name:"<img onerror='x'>",role:'sysadmin',allowedSteps:['incoming','unknown'],asReview:true,asApprove:false}]);
 ctx.renderAdminUsers();const rows=get('adminUserRows').innerHTML;
 assert(!rows.includes('<img'));assert(rows.includes('&lt;img'));assert(!rows.includes('개 허용'));assert(rows.includes('AS 검토 허용'));assert(rows.includes('AS 승인 없음'));assert(!rows.includes('data-um-delete'));
});
test('combined search, department and role filters, reset and no-results',()=>{
 const {ctx,get,seed}=setup();
 seed([{id:'a',name:'가나다',role:'admin',department:'품질'}, {id:'b',name:'라마바',role:'worker'}]);
 get('umRole').value='admin';get('umSearch').value='품질';ctx.renderAdminUsers();assert.equal(get('umCount').textContent,'조회 1명 / 전체 2명');
 get('umDepartment').value='미지정';ctx.renderAdminUsers();assert(get('adminUserRows').innerHTML.includes('검색 조건'));
 ctx.resetAdminUserFilters();assert.equal(get('umCount').textContent,'조회 2명 / 전체 2명');
 get('umDepartment').value='미지정';ctx.renderAdminUsers();assert.equal(get('umCount').textContent,'조회 1명 / 전체 2명');
});
test('loading empty data resets counts and HTTP failures show retry',async()=>{
 const {ctx,get,respond}=setup();
 respond({ok:true,json:async()=>({users:[{id:'a',name:'가',role:'worker'}]})});await ctx.loadAdminUsers();assert.equal(get('uStatTotal').textContent,1);
 respond({ok:true,json:async()=>({users:[]})});await ctx.loadAdminUsers();assert.equal(get('uStatTotal').textContent,0);assert(get('adminUserRows').innerHTML.includes('등록된 사용자'));
 respond({ok:false});await ctx.loadAdminUsers();assert.equal(get('uStatTotal').textContent,'—');assert(get('adminUserRows').innerHTML.includes('다시 시도'));
});
test('a stale response does not replace newer user data',async()=>{
 const {ctx,get}=setup();let resolve;ctx.fetch=()=>new Promise(r=>resolve=r);
 const first=ctx.loadAdminUsers();ctx.fetch=async()=>({ok:true,json:async()=>({users:[{id:'new',name:'new',role:'worker'}]})});
 await ctx.loadAdminUsers();resolve({ok:true,json:async()=>({users:[]})});await first;
 assert.equal(get('uStatTotal').textContent,1);assert(get('adminUserRows').innerHTML.includes('new'));
});
