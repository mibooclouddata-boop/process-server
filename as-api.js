'use strict';
const fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto');
const multer=require('multer');
const attachments=require('./as-files');
function installAsApi(app,{service,authenticate,uploadsDir}){
  fs.mkdirSync(uploadsDir,{recursive:true});
  const upload=multer({storage:multer.diskStorage({destination:uploadsDir,filename(req,file,cb){
    const ext=path.extname(file.originalname).toLowerCase();
    if(!attachments.extensions.includes(ext))return cb(Object.assign(new Error('허용되지 않는 파일 형식입니다.'),{status:400}));
    cb(null,randomUUID()+ext);
  }}),limits:{fileSize:20*1024*1024,files:10,fields:32,fieldSize:16000,parts:42}}).array('files',10);
  const run=fn=>async(req,res,next)=>{try{await fn(req,res,next);}catch(error){next(error);}};
  const actor=req=>req.user||req.asActor;
  const signedIn=(req,res,next)=>req.user?next():authenticate(req,res,next);
  app.use('/api/as',signedIn,(req,res,next)=>{
    res.set('Cache-Control','no-store');
    if(!['GET','HEAD','OPTIONS'].includes(req.method)&&req.get('X-Requested-With')!=='process-server')return res.status(403).json({error:'인증 요청 헤더가 필요합니다.'});
    next();
  });
  app.get('/api/as',run(async(req,res)=>res.json({list:(await service.list()).sort((a,b)=>(b.createdAt||'').localeCompare(a.createdAt||''))})));
  app.get('/api/as/trash',run(async(req,res)=>res.json({list:await service.trash(actor(req))})));
  app.get('/api/as/requests/:key',run(async(req,res)=>res.json({request:await service.requestStatus(req.params.key,actor(req))})));
  app.get('/api/as/:id/history',run(async(req,res)=>res.json({events:await service.history(req.params.id,actor(req),{offset:req.query.offset,limit:req.query.limit})})));
  const parseFiles=(req,res,next)=>upload(req,res,error=>{if(error){attachments.cleanup(req.files,uploadsDir);return next(Object.assign(error,{status:400}));}next();});
  const precheck=run(async(req,res,next)=>{await service.check(req.params.id,actor(req));next();});
  const save=operation=>run(async(req,res)=>{
    let committed=false;
    try{
      const files=(req.files||[]).map(attachments.metadata);
      if(files.reduce((sum,f)=>sum+f.size,0)>100*1024*1024)throw Object.assign(new Error('한 번에 100MB까지 첨부할 수 있습니다.'),{status:400});
      let input=req.body||{};
      if(operation==='advance'&&typeof input.payload==='string'){
        try{input=JSON.parse(input.payload);}catch{throw Object.assign(new Error('진행 정보를 확인하세요.'),{status:400});}
      }
      const key=req.get('Idempotency-Key');
      const result=operation==='create'?await service.create(input,files,actor(req),key):await service[operation](req.params.id,input,files,actor(req),key);
      committed=true;
      if(result.replayed)attachments.cleanup(req.files,uploadsDir);
      res.json(result);
    }catch(error){if(!committed)attachments.cleanup(req.files,uploadsDir);throw error;}
  });
  app.post('/api/as',parseFiles,save('create'));
  app.put('/api/as/:id',precheck,parseFiles,save('update'));
  app.patch('/api/as/:id/workflow',precheck,parseFiles,save('advance'));
  app.delete('/api/as/:id',precheck,run(async(req,res)=>res.json(await service.remove(req.params.id,req.body||{},actor(req),req.get('Idempotency-Key')))));
  app.post('/api/as/:id/restore',precheck,run(async(req,res)=>res.json(await service.restore(req.params.id,req.body||{},actor(req),req.get('Idempotency-Key')))));
  for(const stage of ['review','approve'])app.patch('/api/as/:id/'+stage,(req,res)=>res.status(410).json({error:'진행 관리를 이용하세요.'}));
  app.use('/api/as',(error,req,res,next)=>{
    if(res.headersSent)return next(error);
    const status=error.status||500;
    if(status>=500)console.error('AS 저장 오류:',error.code||error.message);
    res.status(status).json({error:error.status?error.message:'접수를 저장하지 못했습니다. 같은 요청으로 재시도하세요.'});
  });
  app.get('/uploads/:filename',signedIn,run(async(req,res)=>{
    const filename=req.params.filename;
    if(path.basename(filename)!==filename||filename.includes('\\')||!await service.attachment(filename))return res.sendStatus(404);
    res.set({'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"sandbox; default-src 'none'"});
    if(!/\.(?:pdf|jpe?g|png|gif|bmp|webp)$/i.test(filename))res.attachment(filename);
    res.sendFile(filename,{root:uploadsDir});
  }));
}
module.exports={installAsApi};
