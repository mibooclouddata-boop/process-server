'use strict';
const fs=require('node:fs');
const path=require('node:path');
function manifest(version,filename,signature,notes){
 if(!/^\d+\.\d+\.\d+$/.test(version))throw new Error('Invalid release version');
 if(path.basename(filename)!==filename||!filename.endsWith('.exe'))throw new Error('Invalid installer filename');
 if(!signature.trim()||!/^[A-Za-z0-9+/=\r\n]+$/.test(signature))throw new Error('Invalid signature');
 return {version,notes,pub_date:new Date().toISOString(),platforms:{'windows-x86_64':{signature:signature.trim(),url:`https://github.com/mibooclouddata-boop/process-server/releases/download/desktop-v${version}/${encodeURIComponent(filename)}`}}};
}
if(require.main===module){
 const version=require('./package.json').version;
 const config=require('./src-tauri/tauri.conf.json');
 const cargo=fs.readFileSync(path.join(__dirname,'src-tauri/Cargo.toml'),'utf8');
 if(config.version!==version||!cargo.includes(`version = "${version}"`))throw new Error('Version files disagree');
 if(process.env.GITHUB_REF_TYPE==='tag'&&process.env.GITHUB_REF_NAME!==`desktop-v${version}`)throw new Error('Tag does not match app version');
 const dir=path.resolve(process.argv[2]||path.join(__dirname,'src-tauri/target/x86_64-pc-windows-msvc/debug/bundle/nsis'));
 const filename=`Process ERP_${version}_x64-setup.exe`;
 const signature=fs.readFileSync(path.join(dir,filename+'.sig'),'utf8');
 const notes=fs.readFileSync(path.join(__dirname,'RELEASE_NOTES.md'),'utf8');
 fs.writeFileSync(path.join(dir,'latest.json'),JSON.stringify(manifest(version,filename,signature,notes),null,2)+'\n');
 console.log(`Manifest ready for desktop-v${version}`);
}
module.exports={manifest};
