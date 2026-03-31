const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data.json');

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname)); // dashboard.html 서빙

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
  res.json({ success: true });
});

app.listen(PORT, () => {
  console.log(`서버 실행 중: http://localhost:${PORT}`);
  console.log(`대시보드: http://localhost:${PORT}/dashboard.html`);
});
