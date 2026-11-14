const fs=require('node:fs');
const {manifest}=require('./release.cjs');
const value=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
const platform=value.platforms?.['windows-x86_64'];
if(!platform||`desktop-v${value.version}`!==process.argv[3])throw new Error('Release/channel version mismatch');
const filename=`Process-ERP_${value.version}_x64-setup.exe`;
const expected=manifest(value.version,filename,platform.signature,value.notes);
if(platform.url!==expected.platforms['windows-x86_64'].url)throw new Error('Unexpected update asset URL');
