const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {createSessionStore}=require('./as-session');
test('sessions are random, HttpOnly, expire, rotate and revoke',()=>{
 let now=0,token,options;const store=createSessionStore(100,()=>now),res={cookie:(name,value,opts)=>{token=value;options=opts;},clearCookie(){}};
 store.issue({headers:{},secure:true},res,'user');const original=token,req={headers:{cookie:'as_session='+token}};
 assert.equal(options.httpOnly,true);assert.equal(options.sameSite,'strict');assert.equal(options.secure,true);assert.equal(store.userId(req),'user');
 store.issue(req,res,'user');assert.notEqual(token,original);assert.equal(store.userId(req),null);
 const newer={headers:{cookie:'as_session='+token}};assert.equal(store.userId(newer),'user');store.revoke(newer,res);assert.equal(store.userId(newer),null);
 store.issue({headers:{}},res,'user');now=101;assert.equal(store.userId({headers:{cookie:'as_session='+token}}),null);assert.equal(store.userId({body:{actorId:'admin'},headers:{}}),null);
});
test('workflow authentication derives actor from session, not supplied actor ID',()=>{
 const src=fs.readFileSync(__dirname+'/server.js','utf8');const start=src.indexOf('function authenticateAsWorkflow('),end=src.indexOf("app.patch('/api/as/:id/workflow'",start);
 const context={asSessions:{userId:req=>req.headers?.cookie==='valid'?'worker':null},loadData:()=>({users:[{id:'worker',name:'작업자'}]})};vm.createContext(context);vm.runInContext(src.slice(start,end),context);
 let called=false;const res={status(code){this.code=code;return this;},json(body){this.body=body;}};
 context.authenticateAsWorkflow({body:{actorId:'admin'},headers:{}},res,()=>called=true);assert.equal(res.code,401);assert.equal(called,false);
 const req={headers:{cookie:'valid'},body:{actorId:'admin'}};context.authenticateAsWorkflow(req,res,()=>called=true);assert.equal(called,true);assert.equal(req.asActor.id,'worker');
});
