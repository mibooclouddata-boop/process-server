'use strict';
const fs=require('node:fs'),path=require('node:path');
const {createAsStore}=require('./as-store');
// Deleted/retired attachments remain referenced for recovery. Only abandoned uploads
// older than seven days are eligible; never infer deletion from a failed JSON read.
async function collectOrphans(store,uploadsDir,{apply=false,now=Date.now()}={}){
  const root=path.resolve(uploadsDir);
  return store.read(data=>{
    const referenced=new Set(data.list.flatMap(item=>[...(item.files||[]),...(item.retiredFiles||[])].map(file=>file.filename)));
    const candidates=[];
    for(const entry of fs.existsSync(root)?fs.readdirSync(root,{withFileTypes:true}):[]){
      if(!entry.isFile()||referenced.has(entry.name))continue;
      const target=path.resolve(root,entry.name);
      if(path.dirname(target)!==root)throw Error('Invalid attachment path');
      const stat=fs.statSync(target);
      if(now-stat.mtimeMs<7*24*60*60*1000)continue;
      candidates.push(entry.name);if(apply)fs.unlinkSync(target);
    }
    return {applied:apply,count:candidates.length,files:candidates};
  });
}
if(require.main===module){
  const args=process.argv.slice(2),index=args.indexOf('--data-dir');
  if(index<0||!args[index+1]){console.error('Usage: node as-storage-maintenance.js --data-dir DIRECTORY [--apply]');process.exitCode=1;}
  else{const dir=path.resolve(args[index+1]);if(!fs.existsSync(path.join(dir,'as.json'))){console.error('Existing AS data file required');process.exitCode=1;}
    else collectOrphans(createAsStore(path.join(dir,'as.json')),path.join(dir,'uploads'),{apply:args.includes('--apply')}).then(result=>console.log(JSON.stringify(result,null,2))).catch(error=>{console.error(error.message);process.exitCode=1;});}
}
module.exports={collectOrphans};
