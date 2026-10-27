const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),vm=require('node:vm');
const {createRequire}=require('node:module');
const root=path.resolve(__dirname,'..');
async function startFixture(){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'process-as-only-test-'));
 const write=(name,data)=>fs.writeFileSync(path.join(dir,name),JSON.stringify(data));
 write('data.json',{records:[{id:'legacy-scan',barcode:'preserve'}],users:[{id:'admin',password:'Fixture-passphrase-2026!',name:'검증 관리자',role:'sysadmin',department:'품질',position:'관리자',asReview:true,asApprove:true,allowedSteps:['incoming']}]});
 write('as.json',{list:[],seq:0});write('products.json',[{name:'검증 제품'}]);
 for(const name of ['master.json','map.json','location.json','erp.json','erp_columns.json','column-mappings.json'])write(name,{sentinel:'preserve'});
 fs.mkdirSync(path.join(dir,'uploads'));fs.writeFileSync(path.join(dir,'uploads','existing.txt'),'preserve attachment');
 for(const name of ['cover.html','login.html','dashboard.html','as-workflow-ui.js','as-integrity-ui.js','as-amount.js','auth-client.js','user-admin-ui.js','miboo_logo.png','login-bg.png'])fs.copyFileSync(path.join(root,name),path.join(dir,name));
 fs.cpSync(path.join(root,'cover-assets'),path.join(dir,'cover-assets'),{recursive:true});
 const requireFromRoot=createRequire(path.join(root,'server.js')),express=requireFromRoot('express'),app=express();
 const wrappedExpress=Object.assign(()=>app,express);
 let source=fs.readFileSync(path.join(root,'server.js'),'utf8');
 source=source.slice(0,source.lastIndexOf('const server=app.listen('));
 vm.runInNewContext(source,{require:name=>name==='express'?wrappedExpress:requireFromRoot(name),__dirname:dir,process:{env:{PORT:'0'}},console,Buffer,setTimeout,clearTimeout,Date},{filename:'server.js'});
 const server=await new Promise(resolve=>{const listener=app.listen(0,'127.0.0.1',()=>resolve(listener));});
 return {dir,url:'http://127.0.0.1:'+server.address().port,read:name=>JSON.parse(fs.readFileSync(path.join(dir,name),'utf8')),async close(){
  await new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});
  const target=path.resolve(dir),parent=path.resolve(os.tmpdir());
  if(path.dirname(target)!==parent||!path.basename(target).startsWith('process-as-only-test-'))throw Error('Unsafe fixture cleanup path');
  fs.rmSync(target,{recursive:true,force:true});
 }};
}
module.exports={startFixture};
