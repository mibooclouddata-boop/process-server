const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const XLSX = require('xlsx');

const asWorkflow = require('./as-workflow');
const AsAmount = require('./as-amount');
const asSessions = require('./as-session').createSessionStore();
const app = express();
const PORT = process.env.PORT || 3000;
const passwords = require('./passwords');
const DATA_DIR = path.resolve(process.env.PROCESS_DATA_DIR || __dirname);
fs.mkdirSync(DATA_DIR, {recursive:true});
const DATA_FILE = path.join(DATA_DIR, 'data.json');
const MASTER_FILE = path.join(DATA_DIR, 'master.json');
const MAP_FILE = path.join(DATA_DIR, 'map.json');
const LOC_FILE = path.join(DATA_DIR, 'location.json');
const AS_FILE = path.join(DATA_DIR, 'as.json');
const ERP_FILE = path.join(DATA_DIR, 'erp.json');
const ERP_COLS_FILE = path.join(DATA_DIR, 'erp_columns.json');
const COL_MAP_FILE = path.join(DATA_DIR, 'column-mappings.json');
const PRODUCTS_FILE = path.join(DATA_DIR, 'products.json');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } }); // 50MB

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

// ── 기준 데이터 초기화 ──
if (!fs.existsSync(MASTER_FILE)) {
  fs.writeFileSync(MASTER_FILE, JSON.stringify({ materials: [] }, null, 2));
}
function _generateUid(seq) {
  const prefixIdx = Math.floor(seq / 1000);
  const suffix = String(seq % 1000).padStart(3, '0');
  const c1 = String.fromCharCode(65 + Math.floor(prefixIdx / (26 * 26)));
  const c2 = String.fromCharCode(65 + Math.floor((prefixIdx % (26 * 26)) / 26));
  const c3 = String.fromCharCode(65 + (prefixIdx % 26));
  return c1 + c2 + c3 + '-' + suffix;
}
function loadMaster() {
  const data = JSON.parse(fs.readFileSync(MASTER_FILE, 'utf8'));
  // uid가 없는 기존 항목에 소급 부여
  if (!data.uidSeq) data.uidSeq = 0;
  let changed = false;
  data.materials.forEach(m => {
    if (!m.uid) {
      m.uid = _generateUid(data.uidSeq++);
      changed = true;
    }
  });
  if (changed) saveMaster(data);
  return data;
}
function saveMaster(data) {
  fs.writeFileSync(MASTER_FILE, JSON.stringify(data, null, 2));
}

// ── 맵 데이터 초기화 ──
if (!fs.existsSync(MAP_FILE)) {
  fs.writeFileSync(MAP_FILE, JSON.stringify({ areas: [], walls: [], assignments: {} }, null, 2));
}
function loadMap() {
  const data = JSON.parse(fs.readFileSync(MAP_FILE, 'utf8'));
  if (!data.walls) data.walls = [];
  return data;
}
function saveMap(data) {
  fs.writeFileSync(MAP_FILE, JSON.stringify(data, null, 2));
}

// ── 위치 데이터 초기화 ──
if (!fs.existsSync(LOC_FILE)) {
  fs.writeFileSync(LOC_FILE, JSON.stringify({ locations: {} }, null, 2));
}
function loadLocations() {
  return JSON.parse(fs.readFileSync(LOC_FILE, 'utf8'));
}
function saveLocations(data) {
  fs.writeFileSync(LOC_FILE, JSON.stringify(data, null, 2));
}

// ── AS 데이터 초기화 ──
if (!fs.existsSync(AS_FILE)) {
  fs.writeFileSync(AS_FILE, JSON.stringify({ list: [], seq: 0 }, null, 2));
}
function loadAs() { const data=JSON.parse(fs.readFileSync(AS_FILE, 'utf8')); data.list=(data.list||[]).map(asWorkflow.normalize); return data; }
function saveAs(data) { fs.writeFileSync(AS_FILE, JSON.stringify(data, null, 2)); }

// ── ERP 데이터 초기화 ──
if (!fs.existsSync(ERP_FILE)) {
  fs.writeFileSync(ERP_FILE, JSON.stringify({ rows: [], columns: [] }, null, 2));
}
if (!fs.existsSync(ERP_COLS_FILE)) {
  fs.writeFileSync(ERP_COLS_FILE, JSON.stringify({ visible: [] }, null, 2));
}
function loadErp() { return JSON.parse(fs.readFileSync(ERP_FILE, 'utf8')); }
// ERP 데이터는 대용량이라 pretty-print 제거 (파일 크기·쓰기 시간 단축)
function saveErp(data) { fs.writeFileSync(ERP_FILE, JSON.stringify(data)); }
function loadErpCols() { return JSON.parse(fs.readFileSync(ERP_COLS_FILE, 'utf8')); }
function saveErpCols(data) { fs.writeFileSync(ERP_COLS_FILE, JSON.stringify(data, null, 2)); }

// 엑셀 헤더 정규화 헬퍼: raw key → 정규화 key 매핑을 1회만 계산
function _buildNormKeyMap(rawKeys) {
  const m = Object.create(null);
  for (let i = 0; i < rawKeys.length; i++) {
    const k = rawKeys[i];
    m[k] = k.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
  }
  return m;
}
// rows × keyMap 기반 정규화 (per-row regex 제거 → O(cells) lookup)
function _normalizeRows(rows, keyMap) {
  const n = rows.length;
  const out = new Array(n);
  for (let i = 0; i < n; i++) {
    const r = rows[i];
    const obj = {};
    for (const k in r) {
      const v = r[k];
      if (v === null || v === undefined) { obj[keyMap[k]] = ''; }
      else if (typeof v === 'string') { obj[keyMap[k]] = v.trim(); }
      else { obj[keyMap[k]] = String(v).trim(); }
    }
    out[i] = obj;
  }
  return out;
}

// ── 컬럼 매핑 초기화 ──
const DEFAULT_COLUMNS = [
  '순번','진행현황','설치/제작','프로젝트','자재코드','블록','자재그룹','자재그룹(물성)','자재그룹명',
  'BOM 삭제 여부','BOM 삭제일','P/O번호','P/O 품번','제작사','도금사','도장사','적치사',
  '도장사 이관 예정일 입력자','도장사 이관 예정일 입력일','도장사 이관 예정일','계획도장 검사일',
  '제작사 인수일','제작 착수일','F/UP 완료일','용접 완료일','제작 완료 검사일','제작완료 검사일 입력자',
  '제작 완료일','도금 반출일','도금 완료일','도장사 인수일','도장 착수일','1차도장 완료일','2차도장 완료일',
  '도장 검사 신청일','확정 도장 검사일','확정 도장 검사명칭','도장검사결과','도장 완료일',
  '현물 납품일','입고일','적치일','적치자','입고 수량','납품 예약번호','최종납품 예약번호',
  'PLT용기번호','최종납품 PALLET','납품 PALLET1','납품 PALLET2','불출 PALLET','PLT고유번호',
  '사진유무','자재 신청','적치메모','불출메모','불출일','불출자','불출 수량','공급일','공급자',
  '제작메모1','제작메모2','도장메모1','도장메모2','YARD메모1','YARD메모2',
  '입고예정일 입력일','입고예정일 입력자','입고 예정일','불출 신청일','불출 요청일','불출 요청수량',
  'P/O시 납품 기준일','납품 기준일','L/T 구분','소조 확정일','APS 착수일','APS 완료일',
  'A3착수일','A3완료일','보류','보류사유','보류 일자','보류 해제일자',
  '전자 인증일','SHI 승인일','기준계획','12주EPC 계획일정','최초 P/O일','수정 P/O일',
  'P/R 생성일','추천업체 선정일','사용자','신청자','요청지번','요청장소',
  '공작 도장1','공작 도장2','도장 내부 SPEC','도장 외부 SPEC1','도장 외부 SPEC2','도장 외부 SPEC3','도장 외부 SPEC4',
  'ACTIVITY','Actv. 상태','모자재코드','BOM 수량','BOM 수량 단위','BOM 중량(KG)',
  '단가','P/O금액','P/O 수량','P/O 수량 단위','P/O 중량(KG)',
  '납품 구분','SAP 입고일자','BOM 확정일자','BOM 개정 코드','개정 원인 코드',
  '자재 구분','자재내역1','자재내역2','재질','설계 담당자','구매 담당자','조달 담당자',
  '구매L/T','Stage','M/SHEET 등록 건수','시공W/C','책임W/C','공장BAY',
  'DI SC.','BOM ID','선지급 P/O','ELEMENT NO','특별 검사 구분',
  '설계 관리정보','설계 도면번호','선후도금','단위블록','설치 PLT NO','합짐 PLT NO',
  '납품 예약 상태','SN_NO','제작기성 확정일','도장P/R 결재ID','도장P/O 정산입고결재ID',
  '도장P/O 발행일','도장P/O 입고 여부','소조번호','P/O 삭제','구조물성',
  '작업지시서 출력일','작업지시서 번호','사/도급 구분','하위 자재 여부','MRP 유형',
  '창고 납품 자재','불출 IF 실패내용','재고실패내용','MRC','개별/일괄',
  '제작 착수 바코드','F/UP 완료일 바코드','용접 완료일 바코드','제작 완료검사일 바코드',
  '제작 완료일 바코드','도장사 인수일 바코드','도장 착수일 바코드',
  '1차도장 완료일 바코드','2차도장 완료일 바코드','도장 완료일 바코드',
  '적치사 인수일 바코드','현물 납품일 바코드','바코드 입력 일시','바코드 입력자',
  '제작착수 계획일','제작완료 계획일','도장인수 계획일','도장착수 계획일','3D 도면여부'
];

if (!fs.existsSync(COL_MAP_FILE)) {
  const mappings = DEFAULT_COLUMNS.map((name, i) => ({ id: i + 1, erpName: name, displayName: name, required: false }));
  fs.writeFileSync(COL_MAP_FILE, JSON.stringify({ mappings, nextId: DEFAULT_COLUMNS.length + 1 }, null, 2));
}
function loadColMap() { return JSON.parse(fs.readFileSync(COL_MAP_FILE, 'utf8')); }
function saveColMap(data) { fs.writeFileSync(COL_MAP_FILE, JSON.stringify(data, null, 2)); }

// ── 초기 데이터 파일 생성 ──
if (!fs.existsSync(DATA_FILE)) saveData({records:[],users:[]});
// Convert before listening. Known public default credentials are locked, never accepted.
const initialData=loadData();
if(passwords.migratePasswords(initialData))saveData(initialData);

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
  const id=asSessions.userId(req);
  const user=id&&loadData().users.find(u=>u.id===id);
  if(!user||user.active===false||!['sysadmin','admin','worker'].includes(user.role)||user.passwordResetRequired||!asSessions.matches(req,user))return res.status(401).json({error:'다시 로그인하세요.'});
  req.user=user;next();
}
function requireRoles(...roles){return (req,res,next)=>roles.includes(req.user.role)?next():res.status(403).json({error:'권한이 없습니다.'});}
app.use('/api',authenticate);
app.get('/api/me',(req,res)=>res.json({user:publicUser(req.user)}));
app.use('/api/users',requireRoles('sysadmin'));
app.delete('/api/erp/all',requireRoles('sysadmin'));
// ERP imports and structural changes can overwrite or remove existing business data.
app.use('/api/erp',(req,res,next)=>['GET','HEAD'].includes(req.method)?next():requireRoles('sysadmin','admin')(req,res,next));
app.delete('/api/records/:id',requireRoles('sysadmin','admin'));
app.use(['/api/master','/api/column-mappings'],(req,res,next)=>['GET','HEAD'].includes(req.method)?next():requireRoles('sysadmin','admin')(req,res,next));
app.put('/api/map/areas',requireRoles('sysadmin','admin'));
function canManageAs(user,item){
  if(user.role==='sysadmin'||user.asReview===true||user.asApprove===true)return true;
  if(item.createdById)return item.createdById===user.id;
  // Legacy names grant ownership only when exactly one current account matches.
  return item.createdBy===user.name && loadData().users.filter(u=>u.name===item.createdBy).length===1;
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

app.post('/api/scan', (req, res) => {
  const { records } = req.body || {};
  if (!records || !Array.isArray(records)) return res.status(400).json({ error: 'records 필드가 필요합니다.' });

  const steps=['incoming','inspect_wait','inspect_done','paint_wait','paint_done','deliver_wait','deliver_done'];
  if(records.some(r=>!r||typeof r.barcode!=='string'||!steps.includes(r.type)))return res.status(400).json({error:'올바른 스캔 기록이 필요합니다.'});
  if(!['sysadmin','admin'].includes(req.user.role)&&records.some(r=>!(req.user.allowedSteps||[]).includes(r.type)))return res.status(403).json({error:'허용되지 않은 공정입니다.'});
  const data = loadData();
  const now = new Date().toISOString();

  records.forEach(r => {
    data.records.push({
      id: Date.now() + Math.random(),
      barcode: r.barcode,
      name: r.name || '',
      type: r.type,       // incoming / inspect_wait / inspect_done / paint_wait / paint_done / deliver_wait / deliver_done
      qty: r.qty || 1,
      userId: req.user.id,
      userName: req.user.name,
      time: r.time,
      receivedAt: now,
    });
  });

  saveData(data);
  notifyClients('scan');
  res.json({ success: true, count: records.length });
});

// ── 공정 기록 조회 ──
app.get('/api/records', (req, res) => {
  const data = loadData();
  const { barcode, type, date } = req.query;
  let records = [...data.records];

  if (barcode) records = records.filter(r => r.barcode.includes(barcode));
  if (type)    records = records.filter(r => r.type === type);
  if (date)    records = records.filter(r => r.receivedAt && r.receivedAt.startsWith(date));

  // 최신순 정렬
  records.sort((a, b) => new Date(b.receivedAt) - new Date(a.receivedAt));
  res.json({ records });
});

// ── 자재코드별 공정 현황 (추적용) ──
app.get('/api/tracking', (req, res) => {
  const data = loadData();
  const tracking = {};

  // 자재코드별로 그룹핑
  data.records.forEach(r => {
    if (!tracking[r.barcode]) {
      tracking[r.barcode] = { barcode: r.barcode, name: r.name, steps: [] };
    }
    tracking[r.barcode].steps.push({
      type: r.type,
      userId: r.userId,
      userName: r.userName,
      time: r.time,
      receivedAt: r.receivedAt,
    });
  });

  // 각 자재의 최신 공정 단계 계산
  const STEP_ORDER = { incoming: 1, inspect_wait: 2, inspect_done: 3, paint_wait: 4, paint_done: 5, deliver_wait: 6, deliver_done: 7 };
  Object.values(tracking).forEach(item => {
    const maxStep = Math.max(...item.steps.map(s => STEP_ORDER[s.type] || 0));
    item.currentStep = Object.keys(STEP_ORDER).find(k => STEP_ORDER[k] === maxStep) || 'unknown';
    item.stepCount = item.steps.length;
  });

  const result = Object.values(tracking).sort((a, b) => {
    const aTime = a.steps[a.steps.length-1]?.receivedAt || '';
    const bTime = b.steps[b.steps.length-1]?.receivedAt || '';
    return bTime.localeCompare(aTime);
  });

  res.json({ tracking: result });
});

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
  if (allowedSteps !== undefined) data.users[idx].allowedSteps = allowedSteps;
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

// ── 기록 삭제 (관리자용) ──
app.delete('/api/records/:id', (req, res) => {
  const data = loadData();
  data.records = data.records.filter(r => String(r.id) !== req.params.id);
  saveData(data);
  notifyClients('delete');
  res.json({ success: true });
});

// ── 엑셀 업로드 (기준 데이터) ──
app.post('/api/master/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: '파일이 필요합니다.' });
  try {
    const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
    if (!rows.length) return res.status(400).json({ error: '데이터가 비어 있습니다.' });

    // 컬럼명 자동 매핑 (유연하게)
    const colMap = {};
    const keys = Object.keys(rows[0]);
    const patterns = {
      barcode:  ['자재코드','barcode','자재번호','코드','materialcode','material_code','자재 코드'],
      project:  ['프로젝트','project','proj','프로젝트명'],
      block:    ['블럭','block','블록','블럭명'],
      element:  ['엘레멘트','element','elem','요소','엘리먼트'],
      group:    ['자재그룹','group','자재 그룹','materialgroup','material_group','그룹'],
      name:     ['제품명','품명','name','자재명','품목명','material_name'],
      spec:     ['규격','spec','specification','사양'],
      bomQty:   ['bom수량','bom 수량','bomqty','bom_qty','수량'],
      bomWeight:['bom중량','bom 중량','bomweight','bom_weight','중량'],
    };
    for (const [field, names] of Object.entries(patterns)) {
      const found = keys.find(k => names.some(n => k.replace(/\s/g,'').toLowerCase().includes(n.toLowerCase().replace(/\s/g,''))));
      if (found) colMap[field] = found;
    }
    if (!colMap.barcode) return res.status(400).json({ error: '자재코드 컬럼을 찾을 수 없습니다. (자재코드/barcode 컬럼 필요)' });

    const materials = rows.map(r => ({
      barcode:  String(r[colMap.barcode] || '').trim(),
      project:  String(r[colMap.project] || '').trim(),
      block:    String(r[colMap.block] || '').trim(),
      element:  String(r[colMap.element] || '').trim(),
      group:    String(r[colMap.group] || '').trim(),
      name:     String(r[colMap.name] || '').trim(),
      spec:     String(r[colMap.spec] || '').trim(),
      bomQty:   String(r[colMap.bomQty] || '').trim(),
      bomWeight:String(r[colMap.bomWeight] || '').trim(),
    })).filter(m => m.barcode);

    const master = loadMaster();
    if (!master.uidSeq) master.uidSeq = 0;

    // 기존 데이터에 병합 (같은 barcode면 덮어쓰기, UID 유지)
    const map = {};
    master.materials.forEach(m => { map[m.barcode] = m; });
    materials.forEach(m => {
      if (map[m.barcode]) {
        // 기존 항목 업데이트 (UID 유지)
        Object.assign(map[m.barcode], m);
      } else {
        m.uid = _generateUid(master.uidSeq++);
        map[m.barcode] = m;
      }
    });
    master.materials = Object.values(map);
    saveMaster(master);
    notifyClients('master');

    res.json({ success: true, count: materials.length, total: master.materials.length, columns: colMap });
  } catch(e) {
    res.status(500).json({ error: '엑셀 파싱 실패: ' + e.message });
  }
});

// ── 기준 데이터 조회 ──
app.get('/api/master', (req, res) => {
  const master = loadMaster();
  res.json(master);
});

// ── 자재코드 검색 (기준 데이터에서) ──
app.get('/api/master/lookup', (req, res) => {
  const { barcode } = req.query;
  if (!barcode) return res.status(400).json({ error: 'barcode 파라미터가 필요합니다.' });
  const master = loadMaster();
  const found = master.materials.find(m => m.barcode === barcode);
  if (found) {
    res.json({ found: true, material: found });
  } else {
    res.json({ found: false, barcode });
  }
});

// ── 기준 데이터 수동 추가 (관리자) ──
app.post('/api/master', (req, res) => {
  const { barcode, project, block, element, group, name, spec, bomQty, bomWeight } = req.body;
  if (!barcode) return res.status(400).json({ error: '자재코드가 필요합니다.' });
  const master = loadMaster();
  const exists = master.materials.findIndex(m => m.barcode === barcode);
  const entry = { barcode, project: project||'', block: block||'', element: element||'', group: group||'', name: name||'', spec: spec||'', bomQty: bomQty||'', bomWeight: bomWeight||'' };
  if (exists >= 0) master.materials[exists] = entry;
  else master.materials.push(entry);
  saveMaster(master);
  notifyClients('master');
  res.json({ success: true });
});

// ── 기준 데이터 전체 삭제 (/:barcode보다 먼저 등록해야 함) ──
app.delete('/api/master/all', (req, res) => {
  saveMaster({ materials: [], uidSeq: 0 });
  notifyClients('master');
  res.json({ success: true });
});

// ── 기준 데이터 개별 삭제 ──
app.delete('/api/master/:barcode', (req, res) => {
  const master = loadMaster();
  master.materials = master.materials.filter(m => m.barcode !== req.params.barcode);
  saveMaster(master);
  notifyClients('master');
  res.json({ success: true });
});

// ── 맵 데이터 조회 ──
app.get('/api/map', (req, res) => {
  const map = loadMap();
  res.json(map);
});

// ── 맵 영역 저장 (관리자 - 전체 덮어쓰기) ──
app.put('/api/map/areas', (req, res) => {
  const { areas, walls } = req.body;
  const map = loadMap();
  map.areas = areas || [];
  map.walls = walls || [];
  saveMap(map);
  notifyClients('map');
  res.json({ success: true });
});

// ── 자재를 영역에 배정 ──
app.post('/api/map/assign', (req, res) => {
  const { barcode, areaId } = req.body;
  if (!barcode) return res.status(400).json({ error: 'barcode 필요' });
  const map = loadMap();
  if (areaId) {
    map.assignments[barcode] = areaId;
  } else {
    delete map.assignments[barcode];
  }
  saveMap(map);
  notifyClients('map');
  res.json({ success: true });
});

// ── 자재 영역 배정 해제 ──
app.delete('/api/map/assign/:barcode', (req, res) => {
  const map = loadMap();
  delete map.assignments[req.params.barcode];
  saveMap(map);
  notifyClients('map');
  res.json({ success: true });
});

// ── 위치 스캔 (앱에서 바코드 + 구역QR 전송) ──
app.post('/api/location', (req, res) => {
  const { barcode, areaId, userId, userName, time } = req.body;
  if (!barcode || !areaId) return res.status(400).json({ error: 'barcode와 areaId가 필요합니다.' });
  const loc = loadLocations();
  loc.locations[barcode] = {
    areaId,
    userId: req.user.id,
    userName: req.user.name,
    time: time || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  saveLocations(loc);
  // Also update map assignments
  const map = loadMap();
  map.assignments[barcode] = areaId;
  saveMap(map);
  notifyClients('location');
  res.json({ success: true });
});

// ── 전체 위치 현황 조회 ──
app.get('/api/locations', (req, res) => {
  const loc = loadLocations();
  res.json(loc);
});

// ── 특정 자재 위치 이력 ──
app.get('/api/location/:barcode', (req, res) => {
  const loc = loadLocations();
  const current = loc.locations[req.params.barcode];
  if (current) {
    res.json({ found: true, location: current });
  } else {
    res.json({ found: false });
  }
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
app.post('/api/logout', (req,res)=>{asSessions.revoke(req,res);res.json({success:true});});
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

// ── ERP 엑셀 미리보기 (파싱만, 저장 안 함) ──
app.post('/api/erp/preview', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: '파일이 필요합니다.' });
  try {
    const t0 = Date.now();
    const wb = XLSX.read(req.file.buffer, { type: 'buffer', cellDates: true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: '', raw: false });
    if (!rows.length) return res.status(400).json({ error: '데이터가 비어 있습니다.' });

    // 헤더 정규화 1회만 계산
    const rawKeys = Object.keys(rows[0]);
    const keyMap = _buildNormKeyMap(rawKeys);
    const columns = rawKeys.map(k => keyMap[k]);
    const columnMapping = rawKeys.map((raw, i) => ({ index: i+1, raw, recognized: columns[i] }));
    const preview = _normalizeRows(rows.slice(0, 30), keyMap);

    // BOM 수량 / BOM 중량 / BOM ID 칼럼 탐색 (정규화 후 이름으로)
    const norm = s => s.replace(/\s/g, '');
    const bomQtyCol = columns.find(c => norm(c) === 'BOM수량');
    const bomWtCol = columns.find(c => /BOM.*중량/i.test(norm(c)));
    const bomIdCol = columns.find(c => norm(c) === 'BOMID');

    // raw key 역매핑 (정규화 이름 → raw 키)
    const rawBomQtyKey = bomQtyCol ? rawKeys[columns.indexOf(bomQtyCol)] : null;
    const rawBomWtKey  = bomWtCol  ? rawKeys[columns.indexOf(bomWtCol)]  : null;
    const rawBomIdKey  = bomIdCol  ? rawKeys[columns.indexOf(bomIdCol)]  : null;

    // SUM 및 중복 카운트: raw rows 한 번만 순회
    let bomQtySum = 0, bomWeightSum = 0, dupCount = 0, newCount = 0;
    let existingIds = null;
    if (bomIdCol) {
      const erp = loadErp();
      existingIds = new Set();
      for (let i = 0; i < erp.rows.length; i++) {
        const v = erp.rows[i][bomIdCol];
        if (v) existingIds.add(v);
      }
    }
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (rawBomQtyKey) { const v = r[rawBomQtyKey]; const n = parseFloat(v); if (!isNaN(n)) bomQtySum += n; }
      if (rawBomWtKey)  { const v = r[rawBomWtKey];  const n = parseFloat(v); if (!isNaN(n)) bomWeightSum += n; }
      if (existingIds) {
        const v = r[rawBomIdKey];
        const id = (v === null || v === undefined) ? '' : (typeof v === 'string' ? v.trim() : String(v).trim());
        if (id && existingIds.has(id)) dupCount++; else newCount++;
      }
    }
    if (!bomIdCol) newCount = rows.length;

    console.log(`[ERP preview] ${rows.length} rows in ${Date.now() - t0}ms`);
    res.json({ success: true, columns, columnMapping, preview, totalRows: rows.length, bomQtySum, bomWeightSum, bomIdCol: bomIdCol || null, dupCount, newCount });
  } catch(e) {
    res.status(500).json({ error: '엑셀 파싱 실패: ' + e.message });
  }
});

// ── ERP 엑셀 업로드 ──
app.post('/api/erp/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: '파일이 필요합니다.' });
  try {
    const t0 = Date.now();
    const wb = XLSX.read(req.file.buffer, { type: 'buffer', cellDates: true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: '', raw: false });
    if (!rows.length) return res.status(400).json({ error: '데이터가 비어 있습니다.' });

    // 헤더 정규화 1회만 계산
    const rawKeys = Object.keys(rows[0]);
    const keyMap = _buildNormKeyMap(rawKeys);
    const columns = rawKeys.map(k => keyMap[k]);

    // 행 정규화 (regex 캐시 사용)
    const normalized = _normalizeRows(rows, keyMap);

    // BOM ID 칼럼 찾기 (띄어쓰기 무시)
    const norm = s => s.replace(/\s/g, '');
    const bomIdCol = columns.find(c => norm(c) === 'BOMID');

    // 중복 처리 모드: overwrite(덮어쓰기), skip(스킵)
    const dupMode = req.body?.dupMode || 'overwrite';

    // 기존 데이터 병합 (BOM ID 기준) + UID 발행
    const erp = loadErp();
    if (!erp.uidSeq) erp.uidSeq = 0;
    const _now = new Date().toISOString();
    let dupProcessed = 0, newProcessed = 0, skipped = 0;
    if (bomIdCol) {
      // Map을 사용해 lookup O(1) + 대용량에서 성능 우수
      const map = new Map();
      for (let i = 0; i < erp.rows.length; i++) {
        const r = erp.rows[i];
        const key = r[bomIdCol];
        if (key) map.set(key, r);
      }
      for (let i = 0; i < normalized.length; i++) {
        const r = normalized[i];
        const key = r[bomIdCol];
        if (key) {
          const existing = map.get(key);
          if (existing) {
            if (dupMode === 'skip') { skipped++; continue; }
            // 덮어쓰기 (UID 및 _addedAt 유지)
            const uid = existing._uid || existing.UID;
            const addedAt = existing._addedAt;
            Object.assign(existing, r);
            if (uid) { existing._uid = uid; }
            if (addedAt) existing._addedAt = addedAt;
            dupProcessed++;
          } else {
            r._uid = _generateUid(erp.uidSeq++);
            r._addedAt = _now;
            map.set(key, r);
            newProcessed++;
          }
        } else {
          r._uid = _generateUid(erp.uidSeq++);
          r._addedAt = _now;
          erp.rows.push(r);
        }
      }
      erp.rows = Array.from(map.values());
    } else {
      for (let i = 0; i < normalized.length; i++) {
        normalized[i]._uid = _generateUid(erp.uidSeq++);
        normalized[i]._addedAt = _now;
      }
      erp.rows = erp.rows.concat(normalized);
    }

    // 칼럼 목록: 기존 칼럼 유지 (최초 업로드 시에만 설정)
    if (!erp.columns || !erp.columns.length) {
      erp.columns = ['UID', ...columns.filter(c => c !== 'UID')];
    }

    // _uid를 UID 칼럼으로 매핑 (신규 행만 대상)
    for (let i = 0; i < erp.rows.length; i++) {
      const r = erp.rows[i];
      if (r._uid) { r['UID'] = r._uid; delete r._uid; }
    }

    saveErp(erp);
    console.log(`[ERP upload] ${rows.length} rows in ${Date.now() - t0}ms (dup=${dupProcessed}, new=${newProcessed}, skip=${skipped})`);

    // 기본 visible 칼럼이 없으면 첫 15개 설정
    const colsCfg = loadErpCols();
    if (!colsCfg.visible || !colsCfg.visible.length) {
      colsCfg.visible = erp.columns.slice(0, 15);
      saveErpCols(colsCfg);
    }

    notifyClients('erp');
    res.json({ success: true, count: normalized.length, total: erp.rows.length, columnCount: erp.columns.length, dupProcessed, newProcessed, skipped });
  } catch(e) {
    res.status(500).json({ error: '엑셀 파싱 실패: ' + e.message });
  }
});

// ── ERP 데이터 조회 ──
app.get('/api/erp', (req, res) => {
  const erp = loadErp();
  const colsCfg = loadErpCols();
  res.json({ rows: erp.rows, columns: erp.columns, visible: colsCfg.visible || [], rename: colsCfg.rename || {} });
});

// ── ERP 표시 칼럼 설정 ──
app.put('/api/erp/columns', (req, res) => {
  const { visible } = req.body;
  if (!Array.isArray(visible)) return res.status(400).json({ error: 'visible 배열이 필요합니다.' });
  const colsCfg = loadErpCols();
  colsCfg.visible = visible;
  saveErpCols(colsCfg);
  res.json({ success: true });
});

// ── ERP 칼럼명 변경 ──
app.put('/api/erp/columns/rename', (req, res) => {
  const { rename } = req.body;
  if (!rename || typeof rename !== 'object') return res.status(400).json({ error: 'rename 객체가 필요합니다.' });
  const colsCfg = loadErpCols();
  colsCfg.rename = rename;
  saveErpCols(colsCfg);

  // 실제 erp.json의 칼럼명과 행 데이터 키도 변경
  const erp = loadErp();
  const newColumns = erp.columns.map(c => rename[c] || c);
  const newRows = erp.rows.map(row => {
    const obj = {};
    erp.columns.forEach(c => { obj[rename[c] || c] = row[c]; });
    if (row._addedAt) obj._addedAt = row._addedAt;
    return obj;
  });
  erp.columns = newColumns;
  erp.rows = newRows;
  saveErp(erp);

  // visible도 갱신
  if (colsCfg.visible) {
    colsCfg.visible = colsCfg.visible.map(c => rename[c] || c);
  }
  colsCfg.rename = {};
  saveErpCols(colsCfg);

  notifyClients('erp');
  res.json({ success: true });
});

// ── ERP 칼럼 추가 ──
app.post('/api/erp/columns/add', (req, res) => {
  const { names } = req.body;
  if (!names || !Array.isArray(names) || !names.length) return res.status(400).json({ error: '추가할 칼럼명이 필요합니다.' });
  const erp = loadErp();
  const added = [];
  const duplicates = [];
  names.forEach(n => {
    const name = n.trim();
    if (!name) return;
    if (erp.columns.includes(name)) { duplicates.push(name); return; }
    erp.columns.push(name);
    added.push(name);
  });
  if (added.length) saveErp(erp);
  notifyClients('erp');
  res.json({ ok: true, added, duplicates, total: erp.columns.length });
});

// ── ERP 칼럼 삭제 ──
app.delete('/api/erp/columns/:name', (req, res) => {
  const target = decodeURIComponent(req.params.name);
  const erp = loadErp();
  if (!erp.columns.includes(target)) return res.status(404).json({ error: '칼럼을 찾을 수 없습니다' });
  erp.columns = erp.columns.filter(c => c !== target);
  erp.rows.forEach(row => { delete row[target]; });
  saveErp(erp);
  const colsCfg = loadErpCols();
  if (colsCfg.visible) {
    colsCfg.visible = colsCfg.visible.filter(c => c !== target);
    saveErpCols(colsCfg);
  }
  notifyClients('erp');
  res.json({ ok: true, total: erp.columns.length });
});

// ── ERP 데이터 전체 삭제 ──
app.delete('/api/erp/all', (req, res) => {
  saveErp({ rows: [], columns: [] });
  saveErpCols({ visible: [], rename: {} });
  notifyClients('erp');
  res.json({ success: true });
});

// ── 컬럼 매핑 설정 API ──
app.get('/api/column-mappings', (req, res) => {
  res.json(loadColMap());
});

app.put('/api/column-mappings', (req, res) => {
  const { mappings } = req.body;
  if (!Array.isArray(mappings)) return res.status(400).json({ error: 'mappings 배열 필요' });
  const nextId = Math.max(0, ...mappings.map(m => m.id || 0)) + 1;
  saveColMap({ mappings, nextId });
  res.json({ success: true, count: mappings.length });
});

app.post('/api/column-mappings', (req, res) => {
  const { erpName, displayName, required } = req.body;
  if (!erpName) return res.status(400).json({ error: 'erpName이 필요합니다.' });
  const data = loadColMap();
  data.mappings.push({ id: data.nextId++, erpName, displayName: displayName || erpName, required: !!required });
  saveColMap(data);
  res.json({ success: true, id: data.nextId - 1 });
});

app.delete('/api/column-mappings/:id', (req, res) => {
  const data = loadColMap();
  data.mappings = data.mappings.filter(m => m.id !== Number(req.params.id));
  saveColMap(data);
  res.json({ success: true });
});

app.post('/api/column-mappings/reset', (req, res) => {
  const mappings = DEFAULT_COLUMNS.map((name, i) => ({ id: i + 1, erpName: name, displayName: name, required: false }));
  saveColMap({ mappings, nextId: DEFAULT_COLUMNS.length + 1 });
  res.json({ success: true, count: mappings.length });
});

// ── SSE 실시간 알림 ──
const sseClients = new Set();
app.get('/api/events', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });
  res.flushHeaders();
  res.write('data: connected\n\n');
  sseClients.add(res);
  let checkingSession=false;
  const expiry=setInterval(async()=>{
    if(checkingSession)return;
    checkingSession=true;
    try {
      const user=loadData().users.find(u=>u.id===asSessions.userId(req));
      if(!user||user.active===false||!asSessions.matches(req,user))res.end();
    }catch{res.end();}finally{checkingSession=false;}
  },1000);
  expiry.unref();
  req.on('close', () => {clearInterval(expiry);sseClients.delete(res);});
});

function notifyClients(type) {
  const msg = `data: ${JSON.stringify({ type, time: Date.now() })}\n\n`;
  for (const client of sseClients) {
    client.write(msg);
  }
}

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
