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

const upload = multer({ storage: multer.memoryStorage() });

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname)); // dashboard.html 서빙

// ── 기준 데이터 초기화 ──
if (!fs.existsSync(MASTER_FILE)) {
  fs.writeFileSync(MASTER_FILE, JSON.stringify({ materials: [] }, null, 2));
}
function loadMaster() {
  return JSON.parse(fs.readFileSync(MASTER_FILE, 'utf8'));
}
function saveMaster(data) {
  fs.writeFileSync(MASTER_FILE, JSON.stringify(data, null, 2));
}

// ── 초기 데이터 파일 생성 ──
if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(DATA_FILE, JSON.stringify({ records: [], users: [
    { id: 'admin',   password: '1234', name: '관리자',   role: 'admin' },
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
  res.json({ success: true, user: { id: user.id, name: user.name, role: user.role } });
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
      type: r.type,       // in / out / stamp / assembly
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
  const STEP_ORDER = { in: 1, stamp: 2, assembly: 3, out: 4 };
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
  res.json({ users: data.users.map(u => ({ id: u.id, name: u.name, role: u.role })) });
});

// ── 사용자 추가 ──
app.post('/api/users', (req, res) => {
  const { id, password, name, role } = req.body;
  const data = loadData();
  if (data.users.find(u => u.id === id)) return res.status(400).json({ error: '이미 존재하는 아이디입니다.' });
  data.users.push({ id, password, name, role: role || 'worker' });
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
    // 기존 데이터에 병합 (같은 barcode면 덮어쓰기)
    const map = {};
    master.materials.forEach(m => { map[m.barcode] = m; });
    materials.forEach(m => { map[m.barcode] = m; });
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

// ── SSE 실시간 알림 ──
const sseClients = new Set();
app.get('/api/events', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  });
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
