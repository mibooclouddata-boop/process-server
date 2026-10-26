'use strict';
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
const extensions=['.pdf','.jpg','.jpeg','.png','.gif','.bmp','.webp','.doc','.docx','.xls','.xlsx','.ppt','.pptx','.hwp','.txt','.csv','.zip'];
const rejected=()=>Object.assign(new Error('첨부파일의 실제 형식과 확장자를 확인하세요.'),{status:400});
function metadata(file){
  const bytes=fs.readFileSync(file.path),ext=path.extname(file.filename).toLowerCase();
  const hex=bytes.subarray(0,8).toString('hex'),ascii=bytes.subarray(0,32).toString('ascii');
  const zip=/^504b(0304|0506|0708)/.test(hex),ole=hex==='d0cf11e0a1b11ae1';
  let valid=false;
  if(ext==='.pdf')valid=ascii.startsWith('%PDF-');
  if(['.jpg','.jpeg'].includes(ext))valid=hex.startsWith('ffd8ff');
  if(ext==='.png')valid=hex==='89504e470d0a1a0a';
  if(ext==='.gif')valid=/^GIF8[79]a/.test(ascii);
  if(ext==='.bmp')valid=ascii.startsWith('BM');
  if(ext==='.webp')valid=ascii.startsWith('RIFF')&&bytes.subarray(8,12).toString()==='WEBP';
  if(['.zip','.docx','.xlsx','.pptx'].includes(ext))valid=zip;
  if(['.doc','.xls','.ppt','.hwp'].includes(ext))valid=ole||(ext==='.hwp'&&zip);
  if(['.txt','.csv'].includes(ext)||ext==='.xls'&&!valid){
    try{const content=new TextDecoder('utf-8',{fatal:true}).decode(bytes);valid=!content.includes('\0')&&(ext!=='.xls'||/^\s*(?:<html\b|<\?xml\b)/i.test(content));}catch{valid=false;}
  }
  if(!valid)throw rejected();
  const name=Buffer.from(file.originalname,'latin1').toString('utf8');
  if(!name||name.length>255||/[\u0000-\u001f]/.test(name))throw Object.assign(new Error('첨부파일 이름은 제어문자 없이 255자 이내로 입력하세요.'),{status:400});
  return {name,filename:file.filename,size:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};
}
function cleanup(files,root){
  const directory=path.resolve(root);
  for(const file of files||[]){
    if(path.dirname(path.resolve(file.path))!==directory)continue;
    try{fs.unlinkSync(file.path);}catch(e){if(e.code!=='ENOENT')console.error('AS 임시 첨부 정리 실패:',e.code);}
  }
}
module.exports={extensions,metadata,cleanup};
