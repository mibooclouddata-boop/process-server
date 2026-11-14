const {test}=require('node:test');
const assert=require('node:assert/strict');
test('manifest uses versioned GitHub assets and validates signatures and versions',()=>{
 const {manifest}=require('./release.cjs');
 const value=manifest('0.2.0','Process-ERP_0.2.0_x64-setup.exe','c2lnbmF0dXJl','notes');
 assert.equal(value.version,'0.2.0');
 assert.equal(value.platforms['windows-x86_64'].url,'https://github.com/mibooclouddata-boop/process-server/releases/download/desktop-v0.2.0/Process-ERP_0.2.0_x64-setup.exe');
 assert.throws(()=>manifest('0.2.0','Process ERP.exe','c2lnbmF0dXJl','notes'));
 assert.throws(()=>manifest('../main','x.exe','sig','notes'));
 assert.throws(()=>manifest('0.2.0','../x.exe','sig','notes'));
 assert.throws(()=>manifest('0.2.0','x.exe','','notes'));
});

test('MIPS installer is published through the existing updater asset name',t=>{
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{execFileSync}=require('node:child_process');
 const root=path.resolve(os.tmpdir()),dir=fs.mkdtempSync(path.join(root,'mips-release-'));
 t.after(()=>{assert.equal(path.dirname(dir),root);assert(path.basename(dir).startsWith('mips-release-'));fs.rmSync(dir,{recursive:true,force:true});});
 const version=require('./package.json').version,source=`MIPS_${version}_x64-setup.exe`,asset=`Process-ERP_${version}_x64-setup.exe`;
 fs.writeFileSync(path.join(dir,source),'fixture installer');fs.writeFileSync(path.join(dir,source+'.sig'),'c2lnbmF0dXJl');
 execFileSync(process.execPath,[path.join(__dirname,'release.cjs'),dir],{stdio:'pipe'});
 assert.equal(fs.readFileSync(path.join(dir,asset),'utf8'),'fixture installer');
 const value=JSON.parse(fs.readFileSync(path.join(dir,'latest.json'),'utf8'));
 assert.equal(value.platforms['windows-x86_64'].signature,'c2lnbmF0dXJl');
 assert(value.platforms['windows-x86_64'].url.endsWith('/'+asset));
});
