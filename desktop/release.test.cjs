const {test}=require('node:test');
const assert=require('node:assert/strict');
test('manifest uses versioned GitHub assets and validates signatures and versions',()=>{
 const {manifest}=require('./release.cjs');
 const value=manifest('0.2.0','Process ERP_0.2.0_x64-setup.exe','c2lnbmF0dXJl','notes');
 assert.equal(value.version,'0.2.0');
 assert.equal(value.platforms['windows-x86_64'].url,'https://github.com/mibooclouddata-boop/process-server/releases/download/desktop-v0.2.0/Process%20ERP_0.2.0_x64-setup.exe');
 assert.throws(()=>manifest('../main','x.exe','sig','notes'));
 assert.throws(()=>manifest('0.2.0','../x.exe','sig','notes'));
 assert.throws(()=>manifest('0.2.0','x.exe','','notes'));
});
