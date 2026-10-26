const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const multer = require('multer');

const asWorkflow = require('./as-workflow');
const AsAmount = require('./as-amount');
const asSessions = require('./as-session').createSessionStore();
const app = express();
const PORT = process.env.PORT || 3000;
const AUTH_PROVIDER = process.env.AUTH_PROVIDER || 'local';
if (!['local','supabase'].includes(AUTH_PROVIDER)) throw new Error('AUTH_PROVIDER 설정을 확인하세요.');
const supabaseAuth = AUTH_PROVIDER === 'supabase' ? (()=>{
  const auth = require('./supabase-auth');
  return auth.createSupabaseAuth(auth.createSupabaseBackend(auth.configuration()));
})() : null;
const passwords = require('./passwords');
const DATA_DIR = path.resolve(process.env.PROCESS_DATA_DIR || __dirname);
fs.mkdirSync(DATA_DIR, {recursive:true});
const DATA_FILE = path.join(DATA_DIR, 'data.json');
const AS_FILE = path.join(DATA_DIR, 'as.json');
const PRODUCTS_FILE = path.join(DATA_DIR, 'products.json');


// AS 첨부파일용 디스크 저장
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR);
const ALLOWED_EXTS = ['.pdf','.jpg','.jpeg','.png','.gif','.bmp','.webp','.doc','.docx','.xls','.xlsx','.ppt','.pptx','.hwp','.txt','.csv','.zip'];
const asUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOADS_DIR),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      if (!ALLOWED_EXTS.includes(ext)) return cb(new Error('허용되지 않는 파일 형식: ' + ext));
      cb(null, Date.now() + '-' + Math.random().toString(36).slice(2,8) + ext);
    }
  }),
  limits: { fileSize: 20 * 1024 * 1024 } // 20MB
});

app.disable('x-powered-by');
const allowedOrigins = (process.env.CORS_ORIGINS || '').split(',').filter(Boolean);
app.use(cors({origin:allowedOrigins, credentials:true}));
// Custom headers plus an explicit CORS allowlist block cross-site form writes.
app.use('/api', (req,res,next)=>{
  res.set('Cache-Control','no-store');
  if (!['GET','HEAD','OPTIONS'].includes(req.method) && req.get('X-Requested-With') !== 'process-server')
    return res.status(403).json({error:'인증 요청 헤더가 필요합니다.'});
  next();
});
app.use(express.json({ limit: '10mb' }));
// 정적 파일: login.html, dashboard.html, 로고, 업로드 파일만 서빙 (JSON 데이터 파일 노출 차단)
// Hash only the scripts shipped with the page; uploaded/user text is never trusted script.
function sendPage(res, filename){
 const html=fs.readFileSync(path.join(__dirname,filename),'utf8');
 const {createHash}=require('node:crypto');
 const hashes=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m=>"'sha256-"+createHash('sha256').update(m[1].replace(/\r\n?/g,'\n')).digest('base64')+"'").join(' ');
 res.set({'Content-Security-Policy':"base-uri 'none'; object-src 'none'; frame-ancestors 'self'; form-action 'self'; script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com; script-src-elem 'self' "+hashes+" https://cdnjs.cloudflare.com; frame-src 'self' blob:",'X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin','Cache-Control':'no-store'});
 res.type('html').send(html);
}
app.get('/', (req, res) => sendPage(res, 'cover.html'));
app.get('/cover.html', (req, res) => sendPage(res, 'cover.html'));
app.use('/cover-assets', express.static(path.join(__dirname, 'cover-assets'), { index:false, dotfiles:'deny' }));
app.get('/login.html', (req, res) => sendPage(res, 'login.html'));
app.get('/dashboard', (req, res) => sendPage(res, 'dashboard.html'));
app.get('/as-workflow-ui.js', (req,res)=>res.sendFile('as-workflow-ui.js',{root:__dirname}));
app.get('/auth-client.js', (req,res)=>res.sendFile('auth-client.js',{root:__dirname}));
app.get('/as-amount.js', (req,res)=>res.sendFile('as-amount.js',{root:__dirname}));
app.get('/dashboard.html', (req, res) => sendPage(res, 'dashboard.html'));
app.get('/miboo_logo.png', (req, res) => res.sendFile('miboo_logo.png',{root:__dirname}));
app.get('/login-bg.png', (req, res) => res.sendFile('login-bg.png',{root:__dirname}));
// Authenticate before looking up a file; only attachments referenced by AS records are served.
app.get('/uploads/:filename', authenticate, (req,res)=>{
  const filename=req.params.filename;
  if (path.basename(filename)!==filename || filename.includes('\\')) return res.sendStatus(404);
  if (!loadAs().list.some(item=>(item.files||[]).some(f=>f.filename===filename))) return res.sendStatus(404);
  res.set({'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"sandbox; default-src 'none'"});
  res.sendFile(filename,{root:UPLOADS_DIR});
});

// ── AS 데이터 초기화 ──
if (!fs.existsSync(AS_FILE)) {
  fs.writeFileSync(AS_FILE, JSON.stringify({ list: [], seq: 0 }, null, 2));
}
function loadAs() { const data=JSON.parse(fs.readFileSync(AS_FILE, 'utf8')); data.list=(data.list||[]).map(asWorkflow.normalize); return data; }
function saveAs(data) { fs.writeFileSync(AS_FILE, JSON.stringify(data, null, 2)); }

// ── 초기 데이터 파일 생성 ──
if (!fs.existsSync(DATA_FILE)) saveData({records:[],users:[]});
// Convert before listening. Known public default credentials are locked, never accepted.
if(!supabaseAuth){
  const initialData=loadData();
  if(passwords.migratePasswords(initialData))saveData(initialData);
}

function loadData() {
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}
function saveData(data) {
  const temporary=DATA_FILE+'.tmp';
  fs.writeFileSync(temporary, JSON.stringify(data,null,2), {mode:0o600});
  fs.renameSync(temporary,DATA_FILE);
}

// ── 로그인 ──
const loginAttempts=new Map();
let pendingLogins=0;
const dummyHash=passwords.hashPassword(require('node:crypto').randomBytes(32).toString('hex'));
function publicUser(u){return {id:u.id,loginId:u.loginId||u.id,name:u.name,role:u.role,active:u.active!==false,icon:u.icon||'',allowedSteps:u.allowedSteps||[],department:u.department||'',position:u.position||'',asReview:u.asReview===true,asApprove:u.asApprove===true};}
app.post('/api/login', async (req,res)=>{
  if(supabaseAuth)return supabaseAuth.login(req,res);
  const {id,password}=req.body||{};
  if(typeof id!=='string'||id.length>100||typeof password!=='string'||password.length>128)return res.status(400).json({error:'로그인 정보를 확인하세요.'});
  const now=Date.now();
  for(const [key,v] of loginAttempts)if(v.until<=now)loginAttempts.delete(key);
  const key=req.ip;
  const attempts=loginAttempts.get(key)||{count:0,until:now+15*60*1000};
  if(attempts.count>=20 || pendingLogins>=2 || loginAttempts.size>=10000)return res.status(429).json({error:'잠시 후 다시 시도하세요.'});
  attempts.count++;loginAttempts.set(key,attempts);pendingLogins++;
  try {
    const user=loadData().users.find(u=>u.id===id);
    const valid=await passwords.verifyPassword(password,user?.passwordHash||dummyHash);
    const latest=loadData().users.find(u=>u.id===id);
    if(!valid||!latest||latest.active===false||!['sysadmin','admin','worker'].includes(latest.role)||latest.passwordResetRequired||latest.passwordHash!==user.passwordHash)return res.status(401).json({error:'아이디 또는 비밀번호가 올바르지 않거나 관리자 재설정이 필요합니다.'});
    attempts.count--;
    const token=asSessions.issue(req,res,latest.id,latest);
    res.json({success:true,user:publicUser(latest),...(req.get('X-Client-Type')==='mobile'?{token}:{})});
  } finally {pendingLogins--;}
});
function authenticate(req,res,next){
  if(supabaseAuth)return supabaseAuth.authenticate(req,res,next);
  const id=asSessions.userId(req);
  const user=id&&loadData().users.find(u=>u.id===id);
  if(!user||user.active===false||!['sysadmin','admin','worker'].includes(user.role)||user.passwordResetRequired||!asSessions.matches(req,user))return res.status(401).json({error:'다시 로그인하세요.'});
  req.user=user;next();
}
function requireRoles(...roles){return (req,res,next)=>roles.includes(req.user.role)?next():res.status(403).json({error:'권한이 없습니다.'});}
app.use('/api',authenticate);
app.get('/api/me',(req,res)=>res.json({user:publicUser(req.user)}));
app.get('/api/as-attachments/:id',(req,res)=>supabaseAuth?supabaseAuth.attachment(req,res):res.sendStatus(404));
app.use('/api/users',requireRoles('sysadmin'));
app.use('/api/users',(req,res,next)=>supabaseAuth?supabaseAuth.users(req,res):next());
function canManageAs(user,item){
  if(user.role==='sysadmin'||user.asReview===true||user.asApprove===true)return true;
  if(item.createdById)return item.createdById===user.id;
  return false; // Legacy names must be explicitly mapped to immutable user IDs.
}
function authorizeAsChange(req,res,next){
  const item=loadAs().list.find(a=>a.id===req.params.id);
  if(!item)return res.status(404).json({error:'AS 건을 찾을 수 없습니다.'});
  if(!canManageAs(req.user,item))return res.status(403).json({error:'접수자 또는 AS 관리 권한이 필요합니다.'});
  next();
}
app.put('/api/as/:id',authorizeAsChange);
app.delete('/api/as/:id',authorizeAsChange);
app.patch('/api/as/:id/workflow',authorizeAsChange);

// ── 사용자 목록 (관리자용) ──
app.get('/api/users', (req, res) => {
  const data = loadData();
  res.json({ users: data.users.map(u => ({ ...publicUser(u), passwordResetRequired:u.passwordResetRequired===true })) });
});

// ── 사용자 추가 ──
function validateUser(req,res,next){
 const b=req.body||{};
 if((b.role!==undefined&&!['worker','admin','sysadmin'].includes(b.role)) || ['asReview','asApprove'].some(k=>b[k]!==undefined&&typeof b[k]!=='boolean') || (b.allowedSteps!==undefined&&(!Array.isArray(b.allowedSteps)||b.allowedSteps.some(v=>!['incoming','inspect_wait','inspect_done','paint_wait','paint_done','deliver_wait','deliver_done'].includes(v)))) || ['name','department','position','icon'].some(k=>b[k]!==undefined&&(typeof b[k]!=='string'||b[k].length>100)))return res.status(400).json({error:'사용자 정보를 확인하세요.'});
 if((req.method==='POST'||b.password)&&!passwords.validPassword(b.password))return res.status(400).json({error:'비밀번호는 12~128자로 입력하세요.'});
 if(req.method==='POST'&&(typeof b.id!=='string'||!b.id.trim()||b.id.length>100||typeof b.name!=='string'||!b.name.trim()))return res.status(400).json({error:'아이디와 이름이 필요합니다.'});
 next();
}
app.post('/api/users', validateUser, (req, res) => {
  const { id, password, name, role, allowedSteps } = req.body;
  const data = loadData();
  if (data.users.find(u => u.id === id)) return res.status(400).json({ error: '이미 존재하는 아이디입니다.' });
  const icon = req.body.icon || '';
  const department = req.body.department || '';
  const position = req.body.position || '';
  data.users.push({ id, passwordHash: passwords.hashPassword(password), name, role: role || 'worker', icon, allowedSteps: allowedSteps || [], department, position, asReview: req.body.asReview || false, asApprove: req.body.asApprove || false });
  saveData(data);
  res.json({ success: true });
});

// ── 사용자 수정 ──
app.put('/api/users/:id', validateUser, (req, res) => {
  const { password, name, role, allowedSteps } = req.body;
  const data = loadData();
  const idx = data.users.findIndex(u => u.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });
  if(data.users[idx].role==='sysadmin' && role && role!=='sysadmin' && data.users.filter(u=>u.role==='sysadmin'&&u.active!==false&&!u.passwordResetRequired).length<=1)return res.status(400).json({error:'마지막 시스템 관리자는 변경할 수 없습니다.'});
  if (password) {data.users[idx].passwordHash=passwords.hashPassword(password);delete data.users[idx].password;delete data.users[idx].passwordResetRequired;}
  asSessions.revokeUser(req.params.id);
  if (name) data.users[idx].name = name;
  if (role) data.users[idx].role = role;
  if (req.body.icon !== undefined) data.users[idx].icon = req.body.icon;
  if (req.body.department !== undefined) data.users[idx].department = req.body.department;
  if (req.body.position !== undefined) data.users[idx].position = req.body.position;
  if (req.body.asReview !== undefined) data.users[idx].asReview = req.body.asReview;
  if (req.body.asApprove !== undefined) data.users[idx].asApprove = req.body.asApprove;
  saveData(data);
  res.json({ success: true });
});

// ── 사용자 삭제 ──
app.delete('/api/users/:id', (req, res) => {
  if (req.params.id === 'admin') return res.status(400).json({ error: '시스템 관리자 계정은 삭제할 수 없습니다.' });
  const data = loadData();
  const idx = data.users.findIndex(u => u.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });
  if(data.users[idx].role==='sysadmin' && data.users.filter(u=>u.role==='sysadmin'&&u.active!==false&&!u.passwordResetRequired).length<=1)return res.status(400).json({error:'마지막 시스템 관리자는 삭제할 수 없습니다.'});
  asSessions.revokeUser(req.params.id);
  data.users.splice(idx, 1);
  saveData(data);
  res.json({ success: true });
});

// ── AS 접수 ──
app.get('/api/as', (req, res) => {
  const data = loadAs();
  res.json({ list: (data.list || []).sort((a,b) => (b.createdAt||'').localeCompare(a.createdAt||'')) });
});

app.post('/api/as', asUpload.array('files', 10), (req, res) => {
  let amount;
  try { amount = AsAmount.parse(req.body.amount); } catch (error) { return res.status(400).json({error:error.message}); }
  const { ship, block, element, product, materialCode, deliveryAgreedDate, reason, action, remark, status, category, createdBy, createdDept, createdPos } = req.body;
  if (deliveryAgreedDate !== undefined && deliveryAgreedDate !== '' && !asWorkflow.dateValid(deliveryAgreedDate)) return res.status(400).json({error:'납품 협의일을 올바른 날짜로 입력하세요.'});
  if (materialCode !== undefined && (typeof materialCode !== 'string' || materialCode.trim().length > 100)) return res.status(400).json({ error: '자재코드는 100자 이내의 문자열로 입력하세요.' });
  if (!ship || !block) return res.status(400).json({ error: '호선과 블록이 필요합니다.' });
  if (!reason) return res.status(400).json({ error: '사유가 필요합니다.' });
  const data = loadAs();
  const now = new Date();
  const ym = String(now.getFullYear()).slice(2) + String(now.getMonth() + 1).padStart(2, '0');
  if (!data.monthSeq) data.monthSeq = {};
  data.monthSeq[ym] = (data.monthSeq[ym] || 0) + 1;
  const asNo = 'AS-' + ym + '-' + String(data.monthSeq[ym]).padStart(2, '0');
  const files = (req.files || []).map(f => ({ name: Buffer.from(f.originalname, 'latin1').toString('utf8'), filename: f.filename, size: f.size }));
  const item = { id: Date.now().toString(), asNo, ship, block, element: element||'', product: product||'', materialCode: (materialCode||'').trim(), deliveryAgreedDate: deliveryAgreedDate||'', reason, action: action||'', remark: remark||'', status: '접수', category: category||'사내', createdById: req.user.id, createdBy: req.user.name, createdDept: req.user.department||'', createdPos: req.user.position||'', files, createdAt: new Date().toISOString() };
  item.amount = amount;
  data.list.push(item);
  saveAs(data);
  res.json({ success: true, item });
});

app.put('/api/as/:id', asUpload.array('files', 10), (req, res) => {
  let amount;
  try { amount = AsAmount.parse(req.body.amount); } catch (error) { return res.status(400).json({error:error.message}); }
  const data = loadAs();
  const idx = data.list.findIndex(a => a.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'AS 건을 찾을 수 없습니다.' });
  const { ship, block, element, product, materialCode, deliveryAgreedDate, reason, action, remark, status, category } = req.body;
  if (deliveryAgreedDate !== undefined && deliveryAgreedDate !== '' && !asWorkflow.dateValid(deliveryAgreedDate)) return res.status(400).json({error:'납품 협의일을 올바른 날짜로 입력하세요.'});
  if (materialCode !== undefined && (typeof materialCode !== 'string' || materialCode.trim().length > 100)) return res.status(400).json({ error: '자재코드는 100자 이내의 문자열로 입력하세요.' });
  // 내용은 모든 진행상태에서 수정할 수 있지만 상태 전환은 진행 관리에서만 처리한다.
  if (status !== undefined && status !== data.list[idx].status) {
    return res.status(400).json({error:'진행 관리에서 일정과 완료일을 입력하여 변경하세요.'});
  }
  if (ship !== undefined) data.list[idx].ship = ship;
  if (block !== undefined) data.list[idx].block = block;
  if (element !== undefined) data.list[idx].element = element;
  if (product !== undefined) data.list[idx].product = product;
  if (materialCode !== undefined) data.list[idx].materialCode = materialCode.trim();
  if (deliveryAgreedDate !== undefined) data.list[idx].deliveryAgreedDate = deliveryAgreedDate;
  if (remark !== undefined) data.list[idx].remark = remark;
  if (req.body.amount !== undefined) data.list[idx].amount = amount;
  if (reason !== undefined) data.list[idx].reason = reason;
  if (action !== undefined) data.list[idx].action = action;
  if (category !== undefined) data.list[idx].category = category;
  // 새 파일 추가
  const newFiles = (req.files || []).map(f => ({ name: Buffer.from(f.originalname, 'latin1').toString('utf8'), filename: f.filename, size: f.size }));
  if (newFiles.length) {
    if (!data.list[idx].files) data.list[idx].files = [];
    data.list[idx].files.push(...newFiles);
  }
  // 삭제 요청된 파일 제거
  if (req.body.removeFiles) {
    const toRemove = JSON.parse(req.body.removeFiles);
    data.list[idx].files = (data.list[idx].files || []).filter(f => !toRemove.includes(f.filename));
  }
  saveAs(data);
  res.json({ success: true });
});

app.patch('/api/as/:id/review', (req,res)=>res.status(410).json({error:'진행 관리를 이용하세요.'}));
app.patch('/api/as/:id/approve', (req,res)=>res.status(410).json({error:'진행 관리를 이용하세요.'}));
app.post('/api/logout', (req,res)=>{if(supabaseAuth)return supabaseAuth.logout(req,res);asSessions.revoke(req,res);res.json({success:true});});
function authenticateAsWorkflow(req,res,next){
  if(req.user){req.asActor=req.user;return next();}
  const userId=asSessions.userId(req);
  const actor=userId && loadData().users.find(user=>user.id===userId);
  if(!actor)return res.status(401).json({error:'다시 로그인한 후 진행 관리를 이용하세요.'});
  req.asActor=actor;next();
}
app.patch('/api/as/:id/workflow', authenticateAsWorkflow, asUpload.array('files',10), (req,res)=>{
  const cleanUploads=()=>{for(const file of req.files||[]) {try {fs.unlinkSync(file.path);} catch {}}};
  try {
    const data=loadAs();
    const index=data.list.findIndex(item=>item.id===req.params.id);
    if(index<0) {cleanUploads();return res.status(404).json({error:'AS 건을 찾을 수 없습니다.'});}
    const payload=typeof req.body.payload==='string'?JSON.parse(req.body.payload):req.body;
    const actor=req.asActor;
    if(!actor || !canManageAs(actor,data.list[index])) {cleanUploads();return res.status(403).json({error:'접수자 또는 AS 관리 권한이 필요합니다.'});}
    const item=asWorkflow.applyWorkflow(data.list[index],payload,actor);
    const files=(req.files||[]).map(f=>({name:Buffer.from(f.originalname,'latin1').toString('utf8'),filename:f.filename,size:f.size}));
    item.files=[...(item.files||[]),...files];
    data.list[index]=item;saveAs(data);
    res.json({success:true,item});
  } catch(error) {cleanUploads();res.status(error.status||400).json({error:error.status?error.message:'작업 정보를 저장하지 못했습니다.'});}
});

app.delete('/api/as/:id', (req, res) => {
  const data = loadAs();
  data.list = data.list.filter(a => a.id !== req.params.id);
  saveAs(data);
  res.json({ success: true });
});

// ── 제품명 관리 ──
function loadProducts() {
  if (!fs.existsSync(PRODUCTS_FILE)) return [];
  try { return JSON.parse(fs.readFileSync(PRODUCTS_FILE, 'utf8')); } catch { return []; }
}
function saveProducts(list) {
  fs.writeFileSync(PRODUCTS_FILE, JSON.stringify(list, null, 2));
}

app.get('/api/products', (req, res) => {
  res.json(loadProducts());
});

app.post('/api/products', (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: '제품명을 입력하세요' });
  const list = loadProducts();
  if (list.some(p => p.name === name.trim())) return res.status(400).json({ error: '이미 등록된 제품명입니다' });
  list.push({ name: name.trim(), createdAt: new Date().toISOString() });
  saveProducts(list);
  res.json({ ok: true, count: list.length });
});

app.put('/api/products/:name', (req, res) => {
  const list = loadProducts();
  const target = decodeURIComponent(req.params.name);
  const { newName } = req.body;
  if (!newName || !newName.trim()) return res.status(400).json({ error: '제품명을 입력하세요' });
  if (newName.trim() !== target && list.some(p => p.name === newName.trim())) return res.status(400).json({ error: '이미 등록된 제품명입니다' });
  const item = list.find(p => p.name === target);
  if (!item) return res.status(404).json({ error: '제품명을 찾을 수 없습니다' });
  item.name = newName.trim();
  saveProducts(list);
  res.json({ ok: true });
});

app.delete('/api/products/:name', (req, res) => {
  let list = loadProducts();
  const target = decodeURIComponent(req.params.name);
  list = list.filter(p => p.name !== target);
  saveProducts(list);
  res.json({ ok: true, count: list.length });
});

// ── 글로벌 에러 핸들러 ──
app.use((err, req, res, next) => {
  console.error('[서버 에러]', err.message);
  if (err.message && err.message.startsWith('허용되지 않는')) {
    return res.status(400).json({ error: err.message });
  }
  res.status(500).json({ error: '서버 내부 오류가 발생했습니다.' });
});

const server=app.listen(PORT, process.env.HOST || '0.0.0.0', () => {
  console.log(`서버 실행 중: http://localhost:${server.address().port}`);
  console.log(`대시보드: http://localhost:${PORT}`);
});
