const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const XLSX = require('xlsx');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data.json');
const MASTER_FILE = path.join(__dirname, 'master.json');
const MAP_FILE = path.join(__dirname, 'map.json');
const LOC_FILE = path.join(__dirname, 'location.json');
const AS_FILE = path.join(__dirname, 'as.json');
const ERP_FILE = path.join(__dirname, 'erp.json');
const ERP_COLS_FILE = path.join(__dirname, 'erp_columns.json');

const upload = multer({ storage: multer.memoryStorage() });

// AS 첨부파일용 디스크 저장
const UPLOADS_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR);
const asUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOADS_DIR),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname);
      cb(null, Date.now() + '-' + Math.random().toString(36).slice(2,8) + ext);
    }
  }),
  limits: { fileSize: 20 * 1024 * 1024 } // 20MB
});

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname)); // dashboard.html 서빙
app.use('/uploads', express.static(UPLOADS_DIR));

// ── 기준 데이터 초기화 ──
if (!fs.existsSync(MASTER_FILE)) {
  fs.writeFileSync(MASTER_FILE, JSON.stringify({ materials: [] }, null, 2));
}
function _generateUid(seq) {
  const prefixIdx = Math.floor(seq / 1000);
  const suffix = String(seq % 1000).padStart(3, '0');
  const c1 = String.fromCharCode(65 + Math.floor(prefixIdx / 26));
  const c2 = String.fromCharCode(65 + (prefixIdx % 26));
  return c1 + c2 + '-' + suffix;
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
function loadAs() { return JSON.parse(fs.readFileSync(AS_FILE, 'utf8')); }
function saveAs(data) { fs.writeFileSync(AS_FILE, JSON.stringify(data, null, 2)); }

// ── ERP 데이터 초기화 ──
if (!fs.existsSync(ERP_FILE)) {
  fs.writeFileSync(ERP_FILE, JSON.stringify({ rows: [], columns: [] }, null, 2));
}
if (!fs.existsSync(ERP_COLS_FILE)) {
  fs.writeFileSync(ERP_COLS_FILE, JSON.stringify({ visible: [] }, null, 2));
}
function loadErp() { return JSON.parse(fs.readFileSync(ERP_FILE, 'utf8')); }
function saveErp(data) { fs.writeFileSync(ERP_FILE, JSON.stringify(data, null, 2)); }
function loadErpCols() { return JSON.parse(fs.readFileSync(ERP_COLS_FILE, 'utf8')); }
function saveErpCols(data) { fs.writeFileSync(ERP_COLS_FILE, JSON.stringify(data, null, 2)); }

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
  res.json({ success: true, user: { id: user.id, name: user.name, role: user.role, department: user.department||'', position: user.position||'', asReview: user.asReview||false, asApprove: user.asApprove||false } });
});

// ── 앱에서 스캔 데이터 전송 ──
app.post('/api/scan', (req, res) => {
  const { records, userId, userName, sentAt } = req.body;
  if (!records || !Array.isArray(records)) return res.status(400).json({ error: 'records 필드가 필요합니다.' });

  const data = loadData();
  const now = new Date().toISOString();

  records.forEach(r => {
    data.records.push({
      id: Date.now() + Math.random(),
      barcode: r.barcode,
      name: r.name || '',
      type: r.type,       // incoming / inspect_wait / inspect_done / paint_wait / paint_done / deliver_wait / deliver_done
      qty: r.qty || 1,
      userId: userId || r.userId || 'unknown',
      userName: userName || r.userName || '미상',
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
  res.json({ users: data.users.map(u => ({ id: u.id, password: u.password, name: u.name, role: u.role, icon: u.icon || '', allowedSteps: u.allowedSteps || [], department: u.department || '', position: u.position || '', asReview: u.asReview || false, asApprove: u.asApprove || false })) });
});

// ── 사용자 추가 ──
app.post('/api/users', (req, res) => {
  const { id, password, name, role, allowedSteps } = req.body;
  const data = loadData();
  if (data.users.find(u => u.id === id)) return res.status(400).json({ error: '이미 존재하는 아이디입니다.' });
  const icon = req.body.icon || '';
  const department = req.body.department || '';
  const position = req.body.position || '';
  data.users.push({ id, password, name, role: role || 'worker', icon, allowedSteps: allowedSteps || [], department, position, asReview: req.body.asReview || false, asApprove: req.body.asApprove || false });
  saveData(data);
  res.json({ success: true });
});

// ── 사용자 수정 ──
app.put('/api/users/:id', (req, res) => {
  const { password, name, role, allowedSteps } = req.body;
  const data = loadData();
  const idx = data.users.findIndex(u => u.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });
  if (password) data.users[idx].password = password;
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

// ── 기준 데이터 삭제 ──
app.delete('/api/master/:barcode', (req, res) => {
  const master = loadMaster();
  master.materials = master.materials.filter(m => m.barcode !== req.params.barcode);
  saveMaster(master);
  notifyClients('master');
  res.json({ success: true });
});

// ── 기준 데이터 전체 삭제 ──
app.delete('/api/master/all', (req, res) => {
  saveMaster({ materials: [], uidSeq: 0 });
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
    userId: userId || 'unknown',
    userName: userName || '미상',
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
  const { ship, block, element, product, reason, action, remark, status, category, createdBy, createdDept, createdPos } = req.body;
  if (!ship || !block) return res.status(400).json({ error: '호선과 블록이 필요합니다.' });
  if (!reason) return res.status(400).json({ error: '사유가 필요합니다.' });
  const data = loadAs();
  const now = new Date();
  const ym = String(now.getFullYear()).slice(2) + String(now.getMonth() + 1).padStart(2, '0');
  if (!data.monthSeq) data.monthSeq = {};
  data.monthSeq[ym] = (data.monthSeq[ym] || 0) + 1;
  const asNo = 'AS-' + ym + '-' + String(data.monthSeq[ym]).padStart(2, '0');
  const files = (req.files || []).map(f => ({ name: Buffer.from(f.originalname, 'latin1').toString('utf8'), filename: f.filename, size: f.size }));
  const item = { id: Date.now().toString(), asNo, ship, block, element: element||'', product: product||'', reason, action: action||'', remark: remark||'', status: status||'접수', category: category||'사내', createdBy: createdBy||'', createdDept: createdDept||'', createdPos: createdPos||'', files, createdAt: new Date().toISOString() };
  data.list.push(item);
  saveAs(data);
  res.json({ success: true, item });
});

app.put('/api/as/:id', asUpload.array('files', 10), (req, res) => {
  const data = loadAs();
  const idx = data.list.findIndex(a => a.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'AS 건을 찾을 수 없습니다.' });
  const { ship, block, element, product, reason, action, remark, status, category } = req.body;
  const cur = data.list[idx].status;
  // 상태 변경 요청이 아닌 내용 수정은 접수 상태에서만 가능
  const isRemarkOnly = remark !== undefined && ship === undefined && block === undefined && element === undefined && product === undefined && reason === undefined && action === undefined && category === undefined && !(req.files && req.files.length) && !req.body.removeFiles && status === undefined;
  const isContentEdit = ship !== undefined || block !== undefined || element !== undefined || product !== undefined || reason !== undefined || action !== undefined || category !== undefined || (req.files && req.files.length) || req.body.removeFiles;
  const isStatusChangeOnly = status !== undefined && status !== cur && !isContentEdit && !isRemarkOnly;
  if (isContentEdit && cur !== '접수') return res.status(400).json({ error: '접수 상태에서만 수정할 수 있습니다.' });
  if (ship !== undefined) data.list[idx].ship = ship;
  if (block !== undefined) data.list[idx].block = block;
  if (element !== undefined) data.list[idx].element = element;
  if (product !== undefined) data.list[idx].product = product;
  if (remark !== undefined) data.list[idx].remark = remark;
  if (reason !== undefined) data.list[idx].reason = reason;
  if (action !== undefined) data.list[idx].action = action;
  if (category !== undefined) data.list[idx].category = category;
  if (status !== undefined && status !== data.list[idx].status) {
    const VALID_NEXT = { '접수': ['검토 요청'], '검토 요청': ['승인 요청'], '승인 요청': ['처리 대기'], '처리 대기': ['완료'] };
    const cur = data.list[idx].status;
    const allowed = VALID_NEXT[cur] || [];
    if (!allowed.includes(status)) return res.status(400).json({ error: `"${cur}" 상태에서 "${status}"(으)로 변경할 수 없습니다. 다음 단계: ${allowed.join(', ') || '없음'}` });
    data.list[idx].status = status;
    if (status === '완료') {
      data.list[idx].completedBy = req.body.completedBy || '';
      data.list[idx].completedDept = req.body.completedDept || '';
      data.list[idx].completedPos = req.body.completedPos || '';
      data.list[idx].completedAt = new Date().toISOString();
    }
  }
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

app.patch('/api/as/:id/review', (req, res) => {
  const data = loadAs();
  const idx = data.list.findIndex(a => a.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'AS 건을 찾을 수 없습니다.' });
  if (data.list[idx].status !== '검토 요청') return res.status(400).json({ error: '검토 요청 상태인 건만 검토할 수 있습니다.' });
  data.list[idx].reviewer = req.body.reviewer || '';
  data.list[idx].reviewerDept = req.body.reviewerDept || '';
  data.list[idx].reviewerPos = req.body.reviewerPos || '';
  data.list[idx].reviewedAt = req.body.reviewedAt || new Date().toISOString();
  data.list[idx].status = '승인 요청';
  saveAs(data);
  res.json({ success: true });
});

app.patch('/api/as/:id/approve', (req, res) => {
  const data = loadAs();
  const idx = data.list.findIndex(a => a.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'AS 건을 찾을 수 없습니다.' });
  if (data.list[idx].status !== '승인 요청') return res.status(400).json({ error: '승인 요청 상태인 건만 승인할 수 있습니다.' });
  data.list[idx].approver = req.body.approver || '';
  data.list[idx].approverDept = req.body.approverDept || '';
  data.list[idx].approverPos = req.body.approverPos || '';
  data.list[idx].approvedAt = req.body.approvedAt || new Date().toISOString();
  data.list[idx].status = '처리 대기';
  saveAs(data);
  res.json({ success: true });
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
    const wb = XLSX.read(req.file.buffer, { type: 'buffer', cellDates: true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: '', raw: false });
    if (!rows.length) return res.status(400).json({ error: '데이터가 비어 있습니다.' });

    const rawColumns = Object.keys(rows[0]);
    const columns = rawColumns.map(k => k.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim());
    // 원본 → 인식 매핑
    const columnMapping = rawColumns.map((raw, i) => ({ index: i+1, raw, recognized: columns[i] }));
    const preview = rows.slice(0, 30).map(r => {
      const obj = {};
      Object.entries(r).forEach(([k, v]) => {
        obj[k.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim()] = (v === null || v === undefined) ? '' : String(v).trim();
      });
      return obj;
    });

    // BOM 수량 / BOM 중량 SUM 계산
    const norm = s => s.replace(/\s/g, '');
    const bomQtyCol = columns.find(c => norm(c) === 'BOM수량');
    const bomWtCol = columns.find(c => /BOM.*중량/i.test(norm(c)));
    const bomIdCol = columns.find(c => norm(c) === 'BOMID');
    let bomQtySum = 0, bomWeightSum = 0;
    const allNorm = rows.map(r => {
      const obj = {};
      Object.entries(r).forEach(([k, v]) => { obj[k.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim()] = (v === null || v === undefined) ? '' : String(v).trim(); });
      return obj;
    });
    allNorm.forEach(r => {
      if (bomQtyCol) bomQtySum += parseFloat(r[bomQtyCol]) || 0;
      if (bomWtCol) bomWeightSum += parseFloat(r[bomWtCol]) || 0;
    });

    // BOM ID 중복 건수 계산
    let dupCount = 0, newCount = 0;
    if (bomIdCol) {
      const erp = loadErp();
      const existingIds = new Set();
      erp.rows.forEach(r => { if (r[bomIdCol]) existingIds.add(r[bomIdCol]); });
      allNorm.forEach(r => {
        if (r[bomIdCol] && existingIds.has(r[bomIdCol])) dupCount++;
        else newCount++;
      });
    } else {
      newCount = rows.length;
    }

    res.json({ success: true, columns, columnMapping, preview, totalRows: rows.length, bomQtySum, bomWeightSum, bomIdCol: bomIdCol || null, dupCount, newCount });
  } catch(e) {
    res.status(500).json({ error: '엑셀 파싱 실패: ' + e.message });
  }
});

// ── ERP 엑셀 업로드 ──
app.post('/api/erp/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: '파일이 필요합니다.' });
  try {
    const wb = XLSX.read(req.file.buffer, { type: 'buffer', cellDates: true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: '', raw: false });
    if (!rows.length) return res.status(400).json({ error: '데이터가 비어 있습니다.' });

    // 칼럼명 추출 (줄바꿈 제거하여 정규화)
    const columns = Object.keys(rows[0]).map(k => k.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim());

    // 행 데이터도 칼럼명 정규화 적용
    const normalized = rows.map(r => {
      const obj = {};
      Object.entries(r).forEach(([k, v]) => {
        obj[k.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim()] = (v === null || v === undefined) ? '' : String(v).trim();
      });
      return obj;
    });

    // BOM ID 칼럼 찾기 (띄어쓰기 무시)
    const norm = s => s.replace(/\s/g, '');
    const bomIdCol = columns.find(c => norm(c) === 'BOMID');

    // 중복 처리 모드: overwrite(덮어쓰기), skip(스킵)
    const dupMode = req.body?.dupMode || 'overwrite';

    // 기존 데이터 병합 (BOM ID 기준) + UID 발행
    const erp = loadErp();
    if (!erp.uidSeq) erp.uidSeq = 0;
    let dupProcessed = 0, newProcessed = 0, skipped = 0;
    if (bomIdCol) {
      const map = {};
      erp.rows.forEach(r => { if (r[bomIdCol]) map[r[bomIdCol]] = r; });
      normalized.forEach(r => {
        const key = r[bomIdCol];
        if (key) {
          if (map[key]) {
            if (dupMode === 'skip') { skipped++; return; }
            // 덮어쓰기 (UID 유지)
            const uid = map[key]._uid;
            Object.assign(map[key], r);
            if (uid) map[key]._uid = uid;
            dupProcessed++;
          } else {
            r._uid = _generateUid(erp.uidSeq++);
            map[key] = r;
            newProcessed++;
          }
        } else {
          r._uid = _generateUid(erp.uidSeq++);
          erp.rows.push(r);
        }
      });
      erp.rows = Object.values(map);
    } else {
      normalized.forEach(r => { r._uid = _generateUid(erp.uidSeq++); });
      erp.rows = erp.rows.concat(normalized);
    }

    // 칼럼 목록: 기존 칼럼 유지 (최초 업로드 시에만 설정)
    if (!erp.columns || !erp.columns.length) {
      erp.columns = ['UID', ...columns.filter(c => c !== 'UID')];
    }

    // _uid를 UID 칼럼으로 매핑
    erp.rows.forEach(r => { if (r._uid) { r['UID'] = r._uid; delete r._uid; } });

    saveErp(erp);

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

// ── ERP 데이터 전체 삭제 ──
app.delete('/api/erp/all', (req, res) => {
  saveErp({ rows: [], columns: [] });
  saveErpCols({ visible: [], rename: {} });
  notifyClients('erp');
  res.json({ success: true });
});

// ── SSE 실시간 알림 ──
const sseClients = new Set();
app.get('/api/events', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  });
  res.flushHeaders();
  res.write('data: connected\n\n');
  sseClients.add(res);
  req.on('close', () => sseClients.delete(res));
});

function notifyClients(type) {
  const msg = `data: ${JSON.stringify({ type, time: Date.now() })}\n\n`;
  for (const client of sseClients) {
    client.write(msg);
  }
}

app.listen(PORT, () => {
  console.log(`서버 실행 중: http://localhost:${PORT}`);
  console.log(`대시보드: http://localhost:${PORT}/dashboard.html`);
});
