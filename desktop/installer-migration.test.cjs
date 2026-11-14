'use strict';
// Native installer regression: real generated NSIS template, isolated registry
// namespace and shortcut directories. Never installs into the user's app path.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const generated=path.resolve(process.env.CARGO_TARGET_DIR||path.join(__dirname,'src-tauri/target'),'x86_64-pc-windows-msvc/debug/nsis/x64');
const config=require('./src-tauri/tauri.conf.json');
assert.equal(config.bundle.windows.nsis.installerHooks,'windows/migrate-legacy.nsh');
// Hosted Windows runners can expose TEMP through an 8.3 alias (RUNNER~1).
// Normalize the fixture root before deriving registry, shortcut and installer paths.
const id=crypto.randomUUID(),dir=fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(),'mips-installer-test-')));
const reg='Software\\ProcessServerInstallerTests\\'+id;
const maker=path.join(process.env.LOCALAPPDATA,'tauri/NSIS/makensis.exe');
function ps(code){return execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from("$ProgressPreference='SilentlyContinue';$ErrorActionPreference='Stop';"+code,'utf16le').toString('base64')],{encoding:'utf8',windowsHide:true}).trim();}
const q=s=>"'"+s.replaceAll("'","''")+"'";
let setup=[];
function regSet(key,name,value){setup.push(`$k=[Microsoft.Win32.Registry]::CurrentUser.CreateSubKey(${q(reg+'\\'+key)});$k.SetValue(${q(name)},${q(value)});$k.Close()`);}
function link(file,target){setup.push(`$s=New-Object -ComObject WScript.Shell;$l=$s.CreateShortcut(${q(file)});$l.TargetPath=${q(target)};$l.WorkingDirectory=${q(path.dirname(target))};$l.IconLocation=${q(target+',0')};$l.Save()`);}
function target(file){return ps(`$s=New-Object -ComObject WScript.Shell;$s.CreateShortcut(${q(file)}).TargetPath`);}
function resetRegistry(){ps(`if(Test-Path -LiteralPath ${q('HKCU:\\'+reg)}){Remove-Item -LiteralPath ${q('HKCU:\\'+reg)} -Recurse -Force}`);}
const original=fs.readFileSync(path.join(generated,'installer.nsi'),'utf8').replace(/^\uFEFF/,'');
assert(original.includes('migrate-legacy.nsh'),'Build the installer with the migration hook first');
try{
 for(const scenario of ['old-only','both','new-only','same-path','unrelated-shortcuts','collision','destination-junction'].filter(s=>!process.argv[2]||s===process.argv[2])){
  resetRegistry();
  console.log('Checking native installer '+scenario);
  const base=path.join(dir,scenario),old=path.join(base,'Process ERP'),dest=scenario==='same-path'?old:path.join(base,'MIPS');
  const desktop=path.join(base,'Desktop'),start=path.join(base,'Start'),pinned=path.join(base,'Pinned');
  for(const p of [old,desktop,start,pinned])fs.mkdirSync(p,{recursive:true});
  if(scenario==='destination-junction')fs.symlinkSync(old,dest,'junction');
  else fs.mkdirSync(dest,{recursive:true});
  const exe='process-server-desktop.exe',sentinel=path.join(old,'user-data.txt');fs.writeFileSync(sentinel,'keep user data');
  if(scenario!=='new-only'){
   fs.writeFileSync(path.join(old,exe),'old executable');fs.writeFileSync(path.join(old,'uninstall.exe'),'old uninstaller');
   regSet('OldProduct','',''+old);regSet('OldUninstall','Publisher','processserver');regSet('OldUninstall','MainBinaryName',exe);regSet('OldUninstall','InstallLocation','"'+old+'"');regSet('OldUninstall','UninstallString','"'+path.join(old,'uninstall.exe')+'"');regSet('OldUninstall','DisplayVersion','0.3.2');
   for(const folder of [desktop,start,pinned])link(path.join(folder,'Process ERP.lnk'),path.join(old,exe));
  }
  if(scenario==='both'||scenario==='new-only'){fs.writeFileSync(path.join(dest,exe),'MIPS 0.3.3');link(path.join(desktop,'MIPS.lnk'),path.join(dest,exe));}
  const unrelated=path.join(base,'other.exe');fs.writeFileSync(unrelated,'unrelated');
  if(scenario==='unrelated-shortcuts')link(path.join(desktop,'Process ERP.lnk'),unrelated);
  if(scenario==='collision')link(path.join(desktop,'MIPS.lnk'),unrelated);
  ps(setup.join(';'));setup=[];
  const installer=path.join(base,'setup.exe');
  const defines=`!define LEGACY_UNINSTKEY "${reg}\\OldUninstall"\n!define LEGACY_PRODUCTKEY "${reg}\\OldProduct"\n!define MIGRATION_DESKTOP "${desktop}"\n!define MIGRATION_STARTMENU "${start}"\n!define MIGRATION_PINNED "${pinned}"\n`;
  let source=defines+original.replace(/!define OUTFILE "[^"]+"/,`!define OUTFILE "${installer}"`).replace(/!define UNINSTKEY "[^"]+"/,`!define UNINSTKEY "${reg}\\MIPS"`).replace(/!define MANUKEY "[^"]+"/,`!define MANUKEY "${reg}\\Manufacturer"`).replace(/!define BUNDLEID "[^"]+"/,`!define BUNDLEID "com.processserver.installer-test.${id}"`).replace('SetCompressor /SOLID "lzma"','SetCompress off');
  // NSIS requires /D to be the last, unquoted argument, even with spaces.
  // Guard the install section as well: a command-line regression must never
  // install into the user's real default application directory.
  assert(source.includes('SetOutPath $INSTDIR'));
  source=source.replace('SetOutPath $INSTDIR',`\u0024{If} $INSTDIR != "${dest}"\n    Abort "Fixture install directory mismatch"\n  \u0024{EndIf}\n  SetOutPath $INSTDIR`);
  const nsi=path.join(base,'installer.nsi');fs.writeFileSync(nsi,source);
  execFileSync(maker,['/V2','/NOCD',nsi],{cwd:generated,stdio:'pipe',windowsHide:true,timeout:120000});
  if(scenario==='old-only'){
   const rejected=path.join(base,'must-not-install');
   assert.throws(()=>execFileSync(installer,['/S','/UPDATE','/D='+rejected],{windowsHide:true,windowsVerbatimArguments:true,timeout:120000}));
   assert(!fs.existsSync(rejected),'directory guard runs before installer writes');
  }
  execFileSync(installer,['/S','/UPDATE','/D='+dest],{windowsHide:true,windowsVerbatimArguments:true,timeout:120000});
  assert(fs.statSync(path.join(dest,exe)).size>1000000,'new application installed');assert.equal(fs.readFileSync(sentinel,'utf8'),'keep user data');
  if(scenario==='destination-junction'){
   assert.equal(ps(`Test-Path -LiteralPath ${q('HKCU:\\'+reg+'\\OldUninstall')}`),'True','defer cleanup for destination junction');
   assert(fs.existsSync(path.join(old,'uninstall.exe')));
  }else if(scenario==='collision'){
   assert.equal(target(path.join(desktop,'MIPS.lnk')),unrelated);assert(fs.existsSync(path.join(old,exe)),'keep old app when shortcut repair fails');
  }else if(scenario!=='new-only'){
   if(scenario==='unrelated-shortcuts')assert.equal(target(path.join(desktop,'Process ERP.lnk')),unrelated);
   else{assert(!fs.existsSync(path.join(desktop,'Process ERP.lnk')));assert.equal(target(path.join(desktop,'MIPS.lnk')),path.join(dest,exe));}
   assert.equal(target(path.join(start,'MIPS.lnk')),path.join(dest,exe));assert.equal(target(path.join(pinned,'Process ERP.lnk')),path.join(dest,exe));
   assert.equal(ps(`Test-Path -LiteralPath ${q('HKCU:\\'+reg+'\\OldUninstall')}`),'False');
   if(scenario!=='same-path')assert(!fs.existsSync(path.join(old,exe)));
  }
  execFileSync(installer,['/S','/UPDATE','/D='+dest],{windowsHide:true,windowsVerbatimArguments:true,timeout:120000});
  assert(fs.statSync(path.join(dest,exe)).size>1000000,'repeat update retains app');assert.equal(fs.readFileSync(sentinel,'utf8'),'keep user data');
  console.log('PASS: native installer '+scenario);
 }
 console.log('Artifacts: '+dir);
}finally{resetRegistry();}
