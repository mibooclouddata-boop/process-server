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
const DATA_FILE = path.join(__dirname, 'data.json');
const AS_FILE = path.join(__dirname, 'as.json');
const PRODUCTS_FILE = path.join(__dirname, 'products.json');


// AS 첨부파일용 디스크 저장
const UPLOADS_DIR = path.join(__dirname, 'uploads');
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

app.use(cors());
app.use(express.json({ limit: '10mb' }));
// 정적 파일: login.html, dashboard.html, 로고, 업로드 파일만 서빙 (JSON 데이터 파일 노출 차단)
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'cover.html')));
app.get('/cover.html', (req, res) => res.sendFile(path.join(__dirname, 'cover.html')));
app.use('/cover-assets', express.static(path.join(__dirname, 'cover-assets'), { index:false, dotfiles:'deny' }));
app.get('/login.html', (req, res) => res.sendFile(path.join(__dirname, 'login.html')));
app.get('/dashboard', (req, res) => res.sendFile(path.join(__dirname, 'dashboard.html')));
app.get('/as-workflow-ui.js', (req,res)=>res.sendFile(path.join(__dirname,'as-workflow-ui.js')));
app.get('/as-amount.js', (req,res)=>res.sendFile(path.join(__dirname,'as-amount.js')));
app.get('/dashboard.html', (req, res) => res.sendFile(path.join(__dirname, 'dashboard.html')));
app.get('/miboo_logo.png', (req, res) => res.sendFile(path.join(__dirname, 'miboo_logo.png')));
app.get('/login-bg.png', (req, res) => res.sendFile(path.join(__dirname, 'login-bg.png')));
app.use('/uploads', express.static(UPLOADS_DIR));

// ── AS 데이터 초기화 ──
if (!fs.existsSync(AS_FILE)) {
  fs.writeFileSync(AS_FILE, JSON.stringify({ list: [], seq: 0 }, null, 2));
}
function loadAs() { const data=JSON.parse(fs.readFileSync(AS_FILE, 'utf8')); data.list=(data.list||[]).map(asWorkflow.normalize); return data; }
function saveAs(data) { fs.writeFileSync(AS_FILE, JSON.stringify(data, null, 2)); }

// ── 초기 데이터 파일 생성 ──
if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(DATA_FILE, JSON.stringify({ records: [], users: [
    { id: 'admin',   password: '1234', name: '관리자',   role: 'sysadmin' },
    { id: 'user01',  password: '1234', name: '김입고',   role: 'worker' },
    { id: 'user02',  password: '1234', name: '이도장',   role: 'worker' },
    { id: 'user03',  password: '1234', name: '박조립',   role: 'worker' },
    { id: 'user04',  password: '1234', name: '최출고',   role: 'worker' },
  ]}, null, 2));
}

function loadData() {
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}
function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// ── 로그인 ──
app.post('/api/login', (req, res) => {
  const { id, password } = req.body;
  const data = loadData();
  const user = data.users.find(u => u.id === id && u.password === password);
  if (!user) return res.status(401).json({ error: '아이디 또는 비밀번호가 틀렸습니다.' });
  asSessions.issue(req,res,user.id);
  res.json({ success: true, user: { id: user.id, name: user.name, role: user.role, department: user.department||'', position: user.position||'', asReview: user.asReview||false, asApprove: user.asApprove||false } });
});

// ── 사용자 목록 (관리자용) ──
app.get('/api/users', (req, res) => {
  const data = loadData();
  res.json({ users: data.users.map(u => ({ id: u.id, name: u.name, role: u.role, icon: u.icon || '', department: u.department || '', position: u.position || '', asReview: u.asReview || false, asApprove: u.asApprove || false })) });
});

// ── 사용자 추가 ──
app.post('/api/users', (req, res) => {
  const { id, password, name, role } = req.body;
  const data = loadData();
  if (data.users.find(u => u.id === id)) return res.status(400).json({ error: '이미 존재하는 아이디입니다.' });
  const icon = req.body.icon || '';
  const department = req.body.department || '';
  const position = req.body.position || '';
  data.users.push({ id, password, name, role: role || 'worker', icon, department, position, asReview: req.body.asReview || false, asApprove: req.body.asApprove || false });
  saveData(data);
  res.json({ success: true });
});

// ── 사용자 수정 ──
app.put('/api/users/:id', (req, res) => {
  const { password, name, role } = req.body;
  const data = loadData();
  const idx = data.users.findIndex(u => u.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });
  if (password) data.users[idx].password = password;
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
  const item = { id: Date.now().toString(), asNo, ship, block, element: element||'', product: product||'', materialCode: (materialCode||'').trim(), deliveryAgreedDate: deliveryAgreedDate||'', reason, action: action||'', remark: remark||'', status: '접수', category: category||'사내', createdBy: createdBy||'', createdDept: createdDept||'', createdPos: createdPos||'', files, createdAt: new Date().toISOString() };
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
app.post('/api/logout', (req,res)=>{asSessions.revoke(req,res);res.json({success:true});});
function authenticateAsWorkflow(req,res,next){
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
    if(!actor || !(actor.role==='sysadmin'||actor.asReview||actor.asApprove||actor.name===data.list[index].createdBy)) {cleanUploads();return res.status(403).json({error:'접수자 또는 AS 관리 권한이 필요합니다.'});}
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

app.listen(PORT, () => {
  console.log(`서버 실행 중: http://localhost:${PORT}`);
  console.log(`대시보드: http://localhost:${PORT}`);
});
