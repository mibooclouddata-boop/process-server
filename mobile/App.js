import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  FlatList, TextInput, Alert, Vibration, Dimensions, StatusBar,
  Animated, Modal, Platform, ScrollView, ActivityIndicator,
} from 'react-native';
import { Camera, useCameraDevice, useCameraPermission, useCodeScanner } from 'react-native-vision-camera';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Font from 'expo-font';
import Svg, { Path, Rect, Line, Circle, Polygon, Polyline } from 'react-native-svg';
import LoginScreen from './LoginScreen';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const FINDER_SIZE = Math.min(SCREEN_W * 0.72, 280);
const STATUS_BAR_HEIGHT = Platform.OS === 'android' ? StatusBar.currentHeight || 24 : 44;


// Toss-style palette (matches LoginScreen.js)
const T = {
  accent: '#3182F6',
  accentSoft: 'rgba(49,130,246,0.10)',
  accentDeep: '#1C64D8',
  shellBg: '#F7F8FA',
  cardBg: '#FFFFFF',
  textMain: '#191F28',
  textSub: '#4E5968',
  textMute: '#8B95A1',
  border: '#E5E8EB',
  summaryBg: '#0F1D2F',
  danger: '#F04452',
  dangerDark: '#CE3645',
  success: '#0A8A5C',
};

const FONT = {
  regular: 'Pretendard-Regular',
  medium: 'Pretendard-Medium',
  semi: 'Pretendard-SemiBold',
  bold: 'Pretendard-Bold',
  ex: 'Pretendard-ExtraBold',
};

const TYPES = [
  { key: 'in',       label: '입고', color: '#1B8E3A', bg: '#E8F7EE', dot: '#34C759' },
  { key: 'out',      label: '출고', color: '#C0392B', bg: '#FDECEA', dot: '#FF3B30' },
  { key: 'stamp',    label: '도장', color: '#6C3483', bg: '#F4ECFA', dot: '#AF52DE' },
  { key: 'assembly', label: '조립', color: '#0A5BCC', bg: '#E8F1FB', dot: '#3182F6' },
];
const typeInfo = (k) => TYPES.find(t => t.key === k) || TYPES[0];

function formatTimestamp(now = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  const today = new Date();
  const sameDay = today.toDateString() === now.toDateString();
  const y = new Date(); y.setDate(y.getDate() - 1);
  const isYesterday = y.toDateString() === now.toDateString();
  const time = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  if (sameDay) return `오늘 ${time}`;
  if (isYesterday) return `어제 ${time}`;
  return `${now.getMonth()+1}/${now.getDate()} ${time}`;
}

/* ============================ ICONS ============================ */
const Ic = {
  scan: ({ c = T.textMute, s = 22 }) => (
    <Svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M3 7V5a2 2 0 0 1 2-2h2"/><Path d="M17 3h2a2 2 0 0 1 2 2v2"/>
      <Path d="M21 17v2a2 2 0 0 1-2 2h-2"/><Path d="M7 21H5a2 2 0 0 1-2-2v-2"/>
      <Path d="M7 8v8M11 8v8M15 8v8"/>
    </Svg>
  ),
  list: ({ c = T.textMute, s = 22 }) => (
    <Svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Line x1="8" y1="6" x2="21" y2="6"/><Line x1="8" y1="12" x2="21" y2="12"/>
      <Line x1="8" y1="18" x2="21" y2="18"/>
      <Circle cx="4" cy="6" r="1"/><Circle cx="4" cy="12" r="1"/><Circle cx="4" cy="18" r="1"/>
    </Svg>
  ),
  pencil: ({ c = '#fff', s = 20 }) => (
    <Svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
    </Svg>
  ),
  flash: ({ c = '#fff', s = 22, on = false }) => (
    <Svg width={s} height={s} viewBox="0 0 24 24" fill={on ? '#FFD32A' : 'none'} stroke={on ? '#FFD32A' : c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
    </Svg>
  ),
  stop: ({ c = '#fff', s = 24 }) => (
    <Svg width={s} height={s} viewBox="0 0 24 24" fill={c}><Rect x="6" y="6" width="12" height="12" rx="2"/></Svg>
  ),
  send: ({ c = '#fff', s = 16 }) => (
    <Svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M22 2 11 13"/><Path d="M22 2 15 22l-4-9-9-4 20-7Z"/>
    </Svg>
  ),
  plus: ({ c = T.textMain, s = 18 }) => (
    <Svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={2.2} strokeLinecap="round"><Path d="M12 5v14M5 12h14"/></Svg>
  ),
  minus: ({ c = T.textMain, s = 18 }) => (
    <Svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={2.2} strokeLinecap="round"><Path d="M5 12h14"/></Svg>
  ),
  check: ({ c = '#fff', s = 14 }) => (
    <Svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
      <Polyline points="20 6 9 17 4 12"/>
    </Svg>
  ),
  box: ({ c = T.accent, s = 44 }) => (
    <Svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      <Path d="m7.5 4.27 9 5.15"/>
      <Path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/>
      <Path d="M3.3 7 12 12l8.7-5"/><Path d="M12 22V12"/>
    </Svg>
  ),
  close: ({ c = T.textSub, s = 16 }) => (
    <Svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={2} strokeLinecap="round"><Path d="M18 6 6 18M6 6l12 12"/></Svg>
  ),
  arrowDown: ({ c = '#fff', s = 18 }) => (
    <Svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><Path d="M12 5v14M19 12l-7 7-7-7"/></Svg>
  ),
  arrowUp: ({ c = '#fff', s = 18 }) => (
    <Svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><Path d="M12 19V5M5 12l7-7 7 7"/></Svg>
  ),
  stamp: ({ c = '#fff', s = 18 }) => (
    <Svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M9 2v6l-3 2v4h12v-4l-3-2V2"/><Path d="M4 18h16v4H4z"/>
    </Svg>
  ),
  wrench: ({ c = '#fff', s = 18 }) => (
    <Svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M14.7 6.3a4.5 4.5 0 0 1-6 6L3 18l3 3 5.7-5.7a4.5 4.5 0 0 1 6-6l-3 3L14 9l3-3Z"/>
    </Svg>
  ),
};

const TypeIcon = ({ k, c, s = 18 }) => {
  if (k === 'in')    return <Ic.arrowDown c={c} s={s}/>;
  if (k === 'out')   return <Ic.arrowUp c={c} s={s}/>;
  if (k === 'stamp') return <Ic.stamp c={c} s={s}/>;
  return <Ic.wrench c={c} s={s}/>;
};

/* ============================ APP ============================ */
export default function App() {
  const [fontsLoaded, setFontsLoaded] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);

  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('back');
  const [tab, setTab] = useState('scan');
  const [camOn, setCamOn] = useState(false);
  const [flashOn, setFlashOn] = useState(false);
  const [scanState, setScanState] = useState('idle');

  const [detecting, setDetecting] = useState(false);
  // Live corner points of detected QR (4 points in view-space) for box overlay.
  const [detectedBox, setDetectedBox] = useState(null);

  // continuous scan mode
  const [continuous, setContinuous] = useState(false);
  const [contType, setContType] = useState('in');
  const [contCount, setContCount] = useState(0);
  const contLogsRef = useRef([]); // collected logs this continuous session
  const contUnlockTimer = useRef(null);
  const contRecent = useRef(new Map()); // barcode -> last-scanned ms (dedup window)

  const [regVisible, setRegVisible] = useState(false);
  const [regBarcode, setRegBarcode] = useState('');
  const [manualVisible, setManualVisible] = useState(false);
  const [manualInput, setManualInput] = useState('');
  const [profileOpen, setProfileOpen] = useState(false);

  const [logs, setLogs] = useState([]);
  const [filter, setFilter] = useState('all');
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());

  const [toast, setToast] = useState(null);

  const scanLocked = useRef(false);
  const finderBorderAnim = useRef(new Animated.Value(0)).current;
  const detectingRef = useRef(false);   // mirrors `detecting` to avoid per-frame setState
  const boxClearTimer = useRef(null);

  // load fonts + saved session + logs
  useEffect(() => {
    (async () => {
      try {
        await Font.loadAsync({
          [FONT.regular]: require('./assets/fonts/Pretendard-Regular.otf'),
          [FONT.medium]: require('./assets/fonts/Pretendard-Medium.otf'),
          [FONT.semi]: require('./assets/fonts/Pretendard-SemiBold.otf'),
          [FONT.bold]: require('./assets/fonts/Pretendard-Bold.otf'),
          [FONT.ex]: require('./assets/fonts/Pretendard-ExtraBold.otf'),
        });
      } catch (e) {}
      setFontsLoaded(true);
    })();
    (async () => {
      try {
        const [u, l] = await Promise.all([
          AsyncStorage.getItem('currentUser'),
          AsyncStorage.getItem('inv_logs'),
        ]);
        if (u) setCurrentUser(JSON.parse(u));
        if (l) setLogs(JSON.parse(l));
      } catch (e) {}
      setAuthChecked(true);
    })();
  }, []);

  const saveLogs = useCallback(async (nl) => {
    try { await AsyncStorage.setItem('inv_logs', JSON.stringify(nl)); } catch (e) {}
  }, []);

  const showToast = useCallback((text) => {
    const id = Date.now();
    setToast({ id, text });
    setTimeout(() => setToast(t => (t && t.id === id ? null : t)), 2200);
  }, []);

  const handleLogin = async ({ id, password }) => {
    if (!id || !password) return false;
    const user = { id, name: id };
    try { await AsyncStorage.setItem('currentUser', JSON.stringify(user)); } catch (e) {}
    setCurrentUser(user);
    showToast(`${id}님, 환영합니다`);
    return true;
  };

  const handleLogout = async () => {
    try { await AsyncStorage.removeItem('currentUser'); } catch (e) {}
    setCurrentUser(null);
    setSelectMode(false); setSelectedIds(new Set()); setTab('scan');
  };

  /* ======= camera scan ======= */
  async function startScan() {
    if (!hasPermission) {
      const ok = await requestPermission();
      if (!ok) { Alert.alert('카메라 권한 필요', '설정에서 카메라 권한을 허용해주세요.'); return; }
    }
    if (!device) { Alert.alert('카메라 없음', '후면 카메라를 찾을 수 없습니다.'); return; }
    scanLocked.current = false;
    detectingRef.current = false;
    clearTimeout(boxClearTimer.current);
    clearTimeout(contUnlockTimer.current);
    setDetecting(false);
    setDetectedBox(null);
    if (continuous) {
      setContCount(0);
      contLogsRef.current = [];
      contRecent.current.clear();
    }
    setScanState('scanning');
    setCamOn(true);
  }

  function stopScan() {
    scanLocked.current = false;
    detectingRef.current = false;
    clearTimeout(boxClearTimer.current);
    clearTimeout(contUnlockTimer.current);
    setCamOn(false); setFlashOn(false);
    setScanState('idle'); setDetecting(false);
    setDetectedBox(null);
    // continuous session summary
    if (continuous && contLogsRef.current.length > 0) {
      const n = contLogsRef.current.length;
      const t = TYPES.find(x => x.key === contType);
      showToast(`${t?.label} ${n}건 기록 완료`);
      contLogsRef.current = [];
      contRecent.current.clear();
      setContCount(0);
      setTab('history');
    }
  }

  // vision-camera delivers `codes` (array) and `frame` (camera buffer dims, in
  // device orientation). corners/frame on each code are in pixel-space of that
  // buffer — we cover-crop scale them into screen-space below.
  const onCodeScanned = useCallback((codes, frame) => {
    if (scanLocked.current) return;
    const c = codes && codes[0];
    const code = (c?.value || '').trim();
    if (!code || code.length < 2) return;

    // Cover-fit transform from camera buffer pixels → screen pixels.
    const fw = frame?.width || SCREEN_W;
    const fh = frame?.height || SCREEN_H;
    const scale = Math.max(SCREEN_W / fw, SCREEN_H / fh);
    const offX = (fw * scale - SCREEN_W) / 2;
    const offY = (fh * scale - SCREEN_H) / 2;
    const toView = (p) => ({
      x: (Number(p?.x) || 0) * scale - offX,
      y: (Number(p?.y) || 0) * scale - offY,
    });

    let corners = null;
    if (Array.isArray(c.corners) && c.corners.length >= 4) {
      corners = c.corners.slice(0, 4).map(toView);
    } else if (c.frame) {
      const { x = 0, y = 0, width = 0, height = 0 } = c.frame;
      corners = [
        toView({ x, y }), toView({ x: x + width, y }),
        toView({ x: x + width, y: y + height }), toView({ x, y: y + height }),
      ];
    }
    setDetectedBox(corners);

    // Throttle the "detecting" indicator so we don't setState every camera frame.
    if (!detectingRef.current) {
      detectingRef.current = true;
      setDetecting(true);
    }
    // Lock immediately on first read — QR has built-in error correction,
    // so the 2-frame confirmation we used to do just delayed the user.
    scanLocked.current = true;
    setScanState('detected');
    Vibration.vibrate(80);

    // Keep the highlighted box visible through the lock animation
    // (auto-clear in case continuous mode unlocks before stopScan).
    clearTimeout(boxClearTimer.current);
    boxClearTimer.current = setTimeout(() => {
      detectingRef.current = false;
      setDetecting(false);
      setDetectedBox(null);
    }, 800);

    Animated.sequence([
      Animated.timing(finderBorderAnim, { toValue: 1, duration: 150, useNativeDriver: false }),
      Animated.delay(280),
      Animated.timing(finderBorderAnim, { toValue: 0, duration: 150, useNativeDriver: false }),
    ]).start();

    if (continuous) {
      // Dedup: same code within last 30s is ignored to prevent
      // accidental double-counting when the camera briefly re-locks on
      // the same item.
      const DEDUP_WINDOW_MS = 30 * 1000;
      const nowMs = Date.now();
      const prev = contRecent.current.get(code);
      if (prev && nowMs - prev < DEDUP_WINDOW_MS) {
        const ago = Math.max(1, Math.round((nowMs - prev) / 1000));
        showToast(`이미 스캔됨 · ${ago}초 전`);
        Vibration.vibrate(25);
        contUnlockTimer.current = setTimeout(() => {
          scanLocked.current = false;
          setScanState('scanning');
        }, 700);
        return;
      }
      contRecent.current.set(code, nowMs);

      // rapid-save flow: auto-save + keep camera rolling
      const entry = { barcode: code, name: '', type: contType, qty: 1 };
      const newLog = { id: Date.now(), time: formatTimestamp(), sent: false, ...entry };
      contLogsRef.current.push(newLog);
      setLogs(ls => {
        const nl = [newLog, ...ls];
        saveLogs(nl);
        return nl;
      });
      setContCount(c => c + 1);

      // re-unlock camera after a beat so user can shift to next code
      contUnlockTimer.current = setTimeout(() => {
        scanLocked.current = false;
        setScanState('scanning');
      }, 700);
    } else {
      setTimeout(() => { stopScan(); openReg(code); }, 450);
    }
  }, [continuous, contType, saveLogs, showToast]);

  function openReg(code) {
    setRegBarcode(code);
    setRegVisible(true);
  }

  function saveLog(entry) {
    const newLog = { id: Date.now(), time: formatTimestamp(), sent: false, ...entry };
    const nl = [newLog, ...logs];
    setLogs(nl); saveLogs(nl);
    setRegVisible(false); setTab('history');
    showToast('기록을 저장했어요');
  }

  /* ======= history derived ======= */
  const filtered = filter === 'all' ? logs : logs.filter(l => l.type === filter);
  const todayLogs = logs.filter(l => (l.time || '').startsWith('오늘'));
  const pending = logs.filter(l => !l.sent);
  const counts = useMemo(() => ({
    all: logs.length,
    in: logs.filter(l => l.type==='in').length,
    out: logs.filter(l => l.type==='out').length,
    stamp: logs.filter(l => l.type==='stamp').length,
    assembly: logs.filter(l => l.type==='assembly').length,
  }), [logs]);

  function toggleSelect(id) {
    setSelectedIds(p => { const s = new Set(p); s.has(id) ? s.delete(id) : s.add(id); return s; });
  }
  function toggleSelectAll() {
    setSelectedIds(selectedIds.size === filtered.length ? new Set() : new Set(filtered.map(l => l.id)));
  }

  async function doSend(ids) {
    const toSend = logs.filter(l => ids.has(l.id));
    if (!toSend.length) return;
    const SERVER_URL = 'http://192.168.1.100:3000';
    let ok = false;
    try {
      const r = await fetch(`${SERVER_URL}/api/scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          records: toSend,
          userId: currentUser?.id || 'app_user',
          userName: currentUser?.name || '앱 사용자',
          sentAt: new Date().toISOString(),
        }),
      });
      ok = r.ok;
    } catch (e) { ok = false; }

    const nl = logs.map(l => ids.has(l.id) ? { ...l, sent: true } : l);
    setLogs(nl); saveLogs(nl);
    showToast(ok ? `${toSend.length}건 전송 완료` : `${toSend.length}건 로컬 저장 (서버 연결 실패)`);
  }

  async function sendSelected() {
    if (selectedIds.size === 0) return;
    const ids = selectedIds;
    setSelectedIds(new Set()); setSelectMode(false);
    await doSend(ids);
  }

  async function sendAllPending() {
    if (!pending.length) return;
    await doSend(new Set(pending.map(l => l.id)));
  }

  /* ======= render ======= */
  if (!fontsLoaded || !authChecked) {
    return (
      <View style={[st.root, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator color={T.accent} size="large" />
      </View>
    );
  }

  if (!currentUser) {
    return (
      <>
        <LoginScreen onLogin={handleLogin} />
        {toast && <Toast toast={toast} />}
      </>
    );
  }

  return (
    <View style={st.root}>
      <StatusBar barStyle={camOn ? 'light-content' : 'dark-content'} backgroundColor={camOn ? '#000' : T.shellBg} translucent={false}/>

      {tab === 'scan'
        ? <ScanScreen
            camOn={camOn} flashOn={flashOn} scanState={scanState} detecting={detecting}
            finderBorderAnim={finderBorderAnim} detectedBox={detectedBox}
            continuous={continuous} setContinuous={setContinuous}
            contType={contType} setContType={setContType} contCount={contCount}
            onStart={startScan} onStop={stopScan} onFlash={() => setFlashOn(f => !f)}
            onManual={() => { stopScan(); setManualVisible(true); }}
            device={device} onCodeScanned={onCodeScanned}
          />
        : <HistoryScreen
            user={currentUser} logs={logs} filtered={filtered} todayLogs={todayLogs} pending={pending} counts={counts}
            filter={filter} setFilter={setFilter}
            selectMode={selectMode} setSelectMode={setSelectMode}
            selectedIds={selectedIds} toggleSelect={toggleSelect} toggleSelectAll={toggleSelectAll}
            onAvatarPress={() => setProfileOpen(true)}
            onSendAllPending={sendAllPending} onSendSelected={sendSelected}
          />
      }

      {!camOn && <BottomTabs tab={tab} setTab={setTab} historyCount={logs.length}/>}

      <Modal visible={regVisible} animationType="slide" transparent onRequestClose={() => setRegVisible(false)}>
        <RegisterSheet barcode={regBarcode} onClose={() => setRegVisible(false)} onSave={saveLog}/>
      </Modal>

      <Modal visible={manualVisible} animationType="slide" transparent onRequestClose={() => { setManualVisible(false); setManualInput(''); }}>
        <ManualSheet value={manualInput} onChange={setManualInput}
          onClose={() => { setManualVisible(false); setManualInput(''); }}
          onSubmit={() => {
            const v = manualInput.trim();
            if (!v) return;
            setManualVisible(false); setManualInput('');
            openReg(v);
          }}/>
      </Modal>

      <Modal visible={profileOpen} animationType="slide" transparent onRequestClose={() => setProfileOpen(false)}>
        <ProfileSheet user={currentUser} onClose={() => setProfileOpen(false)}
          onLogout={() => { setProfileOpen(false); handleLogout(); }}/>
      </Modal>

      {toast && <Toast toast={toast} />}
    </View>
  );
}

/* ============================ BOTTOM TABS ============================ */
function BottomTabs({ tab, setTab, historyCount }) {
  return (
    <View style={st.tabBar}>
      <TouchableOpacity style={st.tab} activeOpacity={0.7} onPress={() => setTab('scan')}>
        <Ic.scan c={tab==='scan' ? T.accent : T.textMute} s={22}/>
        <Text style={[st.tabLbl, tab==='scan' && { color: T.accent, fontFamily: FONT.bold }]}>스캔</Text>
      </TouchableOpacity>
      <TouchableOpacity style={st.tab} activeOpacity={0.7} onPress={() => setTab('history')}>
        <Ic.list c={tab==='history' ? T.accent : T.textMute} s={22}/>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Text style={[st.tabLbl, tab==='history' && { color: T.accent, fontFamily: FONT.bold }]}>히스토리</Text>
          {historyCount > 0 && (
            <View style={st.tabBadge}>
              <Text style={st.tabBadgeTxt}>{historyCount > 99 ? '99+' : historyCount}</Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    </View>
  );
}

/* ============================ SCAN SCREEN ============================ */
function ScanScreen({ camOn, flashOn, scanState, detecting, finderBorderAnim, detectedBox,
  continuous, setContinuous, contType, setContType, contCount,
  onStart, onStop, onFlash, onManual, device, onCodeScanned }) {

  // Vision-camera code scanner — high-level QR detector running on JS thread.
  const codeScanner = useCodeScanner({
    codeTypes: ['qr'],
    onCodeScanned,
  });

  if (camOn) {
    const cornerColor = finderBorderAnim.interpolate({ inputRange:[0,1], outputRange:[T.accent, '#34C759'] });
    const FINDER_TOP = (SCREEN_H - FINDER_SIZE) * 0.42;
    const locked = scanState === 'detected';
    const finderFill = locked
      ? 'rgba(52,199,89,0.28)'
      : detecting
      ? 'rgba(49,130,246,0.22)'
      : 'transparent';
    const currentType = TYPES.find(t => t.key === contType);

    return (
      <View style={st.scanActive}>
        {device && (
          <Camera
            style={StyleSheet.absoluteFill}
            device={device}
            isActive={camOn}
            codeScanner={codeScanner}
            torch={flashOn ? 'on' : 'off'}
            resizeMode="cover"
            enableZoomGesture={false}
          />
        )}

        <View style={[st.maskBlock, { top: 0, left: 0, right: 0, height: FINDER_TOP }]} />
        <View style={[st.maskBlock, { top: FINDER_TOP + FINDER_SIZE, left: 0, right: 0, bottom: 0 }]} />
        <View style={[st.maskBlock, { top: FINDER_TOP, left: 0, width: (SCREEN_W - FINDER_SIZE)/2, height: FINDER_SIZE }]} />
        <View style={[st.maskBlock, { top: FINDER_TOP, right: 0, width: (SCREEN_W - FINDER_SIZE)/2, height: FINDER_SIZE }]} />

        <View style={[st.finder, { top: FINDER_TOP, left: (SCREEN_W - FINDER_SIZE)/2, backgroundColor: finderFill }]}>
          <Animated.View style={[st.corner, st.tl, { borderColor: cornerColor }]}/>
          <Animated.View style={[st.corner, st.tr, { borderColor: cornerColor }]}/>
          <Animated.View style={[st.corner, st.bl, { borderColor: cornerColor }]}/>
          <Animated.View style={[st.corner, st.br, { borderColor: cornerColor }]}/>
        </View>

        {/* Live QR outline — drawn on top of the camera over the detected code. */}
        {detectedBox && detectedBox.length === 4 && (
          <Svg pointerEvents="none" style={StyleSheet.absoluteFill} width={SCREEN_W} height={SCREEN_H}>
            <Polygon
              points={detectedBox.map(p => `${p.x},${p.y}`).join(' ')}
              fill={locked ? 'rgba(52,199,89,0.22)' : 'rgba(49,130,246,0.18)'}
              stroke={locked ? '#34C759' : '#3182F6'}
              strokeWidth={3}
              strokeLinejoin="round"
            />
            {detectedBox.map((p, i) => (
              <Circle
                key={i} cx={p.x} cy={p.y} r={5}
                fill={locked ? '#34C759' : '#3182F6'}
              />
            ))}
          </Svg>
        )}

        {continuous && (
          <View style={st.contBadge}>
            <View style={[st.contBadgeDot, { backgroundColor: currentType?.dot || T.accent }]}>
              <TypeIcon k={contType} c="#fff" s={12}/>
            </View>
            <Text style={st.contBadgeType}>{currentType?.label}</Text>
            <View style={st.contBadgeDivider}/>
            <Text style={st.contBadgeCount}>{contCount}건</Text>
          </View>
        )}

        <View style={[st.statusPillWrap, { top: FINDER_TOP + FINDER_SIZE + 22 }]}>
          <View style={st.statusPill}>
            <View style={[st.statusDot, { backgroundColor: locked ? '#34C759' : detecting ? '#FFD32A' : T.accent }]}/>
            <Text style={st.statusTxt}>
              {locked
                ? (continuous ? `저장됨 · ${contCount}건` : '인식 완료')
                : detecting ? 'QR 인식 중...'
                : continuous ? '계속 스캔하세요' : 'QR을 박스 안에 맞춰주세요'}
            </Text>
          </View>
        </View>

        <View style={st.camBottom}>
          <CamBtn label={flashOn ? '켜짐' : '조명'} onPress={onFlash}>
            <Ic.flash c="#fff" s={22} on={flashOn}/>
          </CamBtn>
          <TouchableOpacity onPress={onStop} activeOpacity={0.85} style={st.camMain}>
            <Ic.stop c="#fff" s={24}/>
          </TouchableOpacity>
          <CamBtn label="직접입력" onPress={onManual}>
            <Ic.pencil c="#fff" s={20}/>
          </CamBtn>
        </View>
      </View>
    );
  }

  // idle
  return (
    <View style={st.scanIdle}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 }}>
        <View style={st.heroIcon}>
          <Ic.box c={T.accent} s={44}/>
        </View>
        <Text style={st.heroTitle}>입출고 관리</Text>
        <Text style={st.heroSub}>QR을 스캔해서{'\n'}입출고 기록을 간단히 남기세요.</Text>
      </View>

      <View style={{ paddingHorizontal: 20, paddingBottom: 108 }}>
        {/* continuous mode toggle */}
        <TouchableOpacity activeOpacity={0.7} onPress={() => setContinuous(v => !v)} style={st.contToggle}>
          <View style={{ flex: 1 }}>
            <Text style={st.contToggleTitle}>연속 스캔 모드</Text>
            <Text style={st.contToggleSub}>
              {continuous ? 'QR 찍는 대로 자동 저장' : '한 건씩 유형·수량 입력'}
            </Text>
          </View>
          <View style={[st.contSwitch, continuous && { backgroundColor: T.accent }]}>
            <View style={[st.contSwitchKnob, continuous && { transform: [{ translateX: 18 }] }]}/>
          </View>
        </TouchableOpacity>

        {/* type picker (only when continuous) */}
        {continuous && (
          <View style={st.contTypePicker}>
            {TYPES.map(t => {
              const on = contType === t.key;
              return (
                <TouchableOpacity key={t.key} activeOpacity={0.8} onPress={() => setContType(t.key)}
                  style={[st.contTypeChip, on && { backgroundColor: t.bg, borderColor: t.color }]}>
                  <View style={[st.contTypeIcon, { backgroundColor: on ? '#fff' : t.bg }]}>
                    <TypeIcon k={t.key} c={t.color} s={12}/>
                  </View>
                  <Text style={[st.contTypeTxt, { color: on ? t.color : T.textSub }]}>{t.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        <TouchableOpacity onPress={onStart} activeOpacity={0.88} style={st.primaryBtn}>
          <Ic.scan c="#fff" s={18}/>
          <Text style={st.primaryBtnTxt}>
            {continuous ? `연속 스캔 시작 · ${TYPES.find(t => t.key === contType)?.label}` : '스캔 시작'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function CamBtn({ children, label, onPress }) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.75} style={{ alignItems: 'center', gap: 6 }}>
      <View style={st.camBtnCircle}>{children}</View>
      <Text style={st.camBtnLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

/* ============================ HISTORY SCREEN ============================ */
function HistoryScreen({ user, logs, filtered, todayLogs, pending, counts,
  filter, setFilter, selectMode, setSelectMode, selectedIds, toggleSelect, toggleSelectAll,
  onAvatarPress, onSendAllPending, onSendSelected }) {

  const groups = useMemo(() => {
    const out = [];
    for (const l of filtered) {
      const date = (l.time || '').split(' ')[0] || '기타';
      const last = out[out.length - 1];
      if (last && last.date === date) last.items.push(l);
      else out.push({ date, items: [l] });
    }
    return out;
  }, [filtered]);

  const todayIn = todayLogs.filter(l=>l.type==='in').length;
  const todayOut = todayLogs.filter(l=>l.type==='out').length;

  return (
    <View style={st.history}>
      {/* header */}
      <View style={st.histHeader}>
        <Text style={st.histTitle}>히스토리</Text>
        <TouchableOpacity onPress={onAvatarPress} activeOpacity={0.85} style={st.avatar}>
          <Text style={st.avatarTxt}>{(user.name || 'U').slice(0,1).toUpperCase()}</Text>
        </TouchableOpacity>
      </View>

      {/* KPI cards */}
      <View style={st.kpiRow}>
        <View style={st.kpiCard}>
          <Text style={st.kpiLabel}>오늘 총 기록</Text>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', marginTop: 4 }}>
            <Text style={st.kpiValue}>{todayLogs.length}</Text>
            <Text style={st.kpiUnit}>건</Text>
          </View>
          <Text style={[st.kpiMeta, { color: T.success }]}>
            입고 {todayIn} · 출고 {todayOut}
          </Text>
        </View>
        <TouchableOpacity onPress={onSendAllPending} disabled={!pending.length} activeOpacity={0.85} style={st.kpiCard}>
          <Text style={st.kpiLabel}>미전송</Text>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', marginTop: 4 }}>
            <Text style={[st.kpiValue, { color: pending.length ? T.dangerDark : T.textMain }]}>{pending.length}</Text>
            <Text style={st.kpiUnit}>건</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
            <Text style={[st.kpiMeta, { color: pending.length ? T.dangerDark : T.textMute }]}>
              {pending.length ? '전송 필요' : '모두 전송됨'}
            </Text>
            {pending.length > 0 && <Ic.send c={T.dangerDark} s={11}/>}
          </View>
        </TouchableOpacity>
      </View>

      {/* filter tabs (underline style) */}
      <View style={st.filterBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 20, paddingRight: 12 }}>
          {[['all','전체'],['in','입고'],['out','출고'],['stamp','도장'],['assembly','조립']].map(([k, lbl]) => {
            const active = filter === k;
            return (
              <TouchableOpacity key={k} onPress={() => setFilter(k)} activeOpacity={0.7} style={st.filterItem}>
                <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
                  <Text style={[st.filterTxt, active && { color: T.textMain, fontFamily: FONT.bold }]}>{lbl}</Text>
                  {counts[k] > 0 && (
                    <Text style={[st.filterCount, active && { color: T.textSub }]}>{counts[k]}</Text>
                  )}
                </View>
                {active && <View style={st.filterUnderline}/>}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
        <TouchableOpacity onPress={() => { setSelectMode(!selectMode); }} activeOpacity={0.7} style={{ paddingVertical: 10 }}>
          <Text style={{ fontFamily: FONT.semi, fontSize: 14, color: selectMode ? T.accent : T.textSub }}>
            {selectMode ? '취소' : '선택'}
          </Text>
        </TouchableOpacity>
      </View>

      {selectMode && (
        <View style={st.selectToolbar}>
          <Text style={{ fontSize: 13, color: T.textSub, fontFamily: FONT.medium }}>
            {selectedIds.size > 0
              ? <><Text style={{ color: T.textMain, fontFamily: FONT.bold }}>{selectedIds.size}건</Text> 선택됨</>
              : '항목을 선택하세요'}
          </Text>
          <View style={{ flex: 1 }}/>
          <TouchableOpacity onPress={toggleSelectAll} activeOpacity={0.7}>
            <Text style={{ fontFamily: FONT.semi, fontSize: 13, color: T.accent }}>
              {selectedIds.size === filtered.length && filtered.length > 0 ? '전체 해제' : '전체 선택'}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* list */}
      {filtered.length === 0 ? (
        <View style={st.empty}>
          <View style={st.emptyIcon}><Ic.list c={T.textMute} s={22}/></View>
          <Text style={st.emptyTitle}>기록이 없습니다</Text>
          <Text style={st.emptySub}>바코드를 스캔해서 기록을 남겨보세요</Text>
        </View>
      ) : (
        <FlatList
          data={groups}
          keyExtractor={g => g.date}
          contentContainerStyle={{ paddingBottom: selectMode ? 180 : 100 }}
          showsVerticalScrollIndicator={false}
          renderItem={({ item: g }) => (
            <View style={{ marginBottom: 8 }}>
              <View style={st.groupHeader}>
                <Text style={st.groupDate}>{g.date}</Text>
                <Text style={st.groupCount}>{g.items.length}건</Text>
              </View>
              <View style={st.groupCard}>
                {g.items.map((l, idx) => {
                  const t = typeInfo(l.type);
                  const sel = selectedIds.has(l.id);
                  const isLast = idx === g.items.length - 1;
                  const signed = l.type === 'in' ? `+${l.qty}` : l.type === 'out' ? `−${l.qty}` : `${l.qty}`;
                  return (
                    <TouchableOpacity
                      key={l.id}
                      activeOpacity={selectMode ? 0.7 : 1}
                      onPress={() => selectMode && toggleSelect(l.id)}
                      onLongPress={() => { if (!selectMode) { setSelectMode(true); toggleSelect(l.id); } }}
                      style={[st.row, !isLast && st.rowDivider, sel && { backgroundColor: T.accentSoft }]}
                    >
                      {selectMode && (
                        <View style={[st.checkbox, sel && { backgroundColor: T.accent, borderColor: T.accent }]}>
                          {sel && <Ic.check c="#fff" s={11}/>}
                        </View>
                      )}
                      <View style={[st.typeIcon, { backgroundColor: `${t.dot}26` }]}>
                        <TypeIcon k={l.type} c={t.dot} s={18}/>
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                          <Text numberOfLines={1} style={st.rowTitle}>{l.name || l.barcode}</Text>
                          {!l.sent && <View style={st.unsentDot}/>}
                        </View>
                        <Text numberOfLines={1} style={st.rowSub}>
                          {t.label} · {(l.time || '').split(' ')[1] || l.time}
                        </Text>
                      </View>
                      <Text style={st.rowAmt}>
                        {signed}<Text style={st.rowAmtUnit}>개</Text>
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}
        />
      )}

      {selectMode && (
        <View style={st.sendBar}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 11, color: T.textMute, fontFamily: FONT.medium }}>선택됨</Text>
            <Text style={{ fontSize: 16, color: T.textMain, fontFamily: FONT.bold }}>{selectedIds.size}건</Text>
          </View>
          <TouchableOpacity
            disabled={!selectedIds.size}
            onPress={onSendSelected}
            activeOpacity={0.85}
            style={[st.sendBtn, !selectedIds.size && { backgroundColor: T.border }]}
          >
            <Ic.send c="#fff" s={16}/>
            <Text style={st.sendBtnTxt}>서버로 전송</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

/* ============================ REGISTER SHEET ============================ */
function RegisterSheet({ barcode, onClose, onSave }) {
  const [type, setType] = useState('in');
  const [qty, setQty] = useState(1);
  const [name, setName] = useState('');

  return (
    <View style={st.modalOverlay}>
      <TouchableOpacity activeOpacity={1} onPress={onClose} style={StyleSheet.absoluteFillObject}>
        <View style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.5)' }}/>
      </TouchableOpacity>
      <View style={st.sheet}>
        <View style={st.handle}/>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
          <Text style={st.sheetTitle}>입출고 등록</Text>
          <View style={{ flex: 1 }}/>
          <TouchableOpacity onPress={onClose} style={st.sheetClose}>
            <Ic.close c={T.textSub} s={16}/>
          </TouchableOpacity>
        </View>
        <Text style={st.sheetSub}>방금 스캔한 바코드를 기록합니다</Text>

        <View style={st.barcodeCard}>
          <View style={st.barcodeIconWrap}>
            <Ic.scan c="#fff" s={20}/>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={st.barcodeLabel}>BARCODE</Text>
            <Text style={st.barcodeValue} numberOfLines={1}>{barcode}</Text>
          </View>
        </View>

        <Label>유형</Label>
        <View style={st.typeGrid}>
          {TYPES.map(t => {
            const on = type === t.key;
            return (
              <TouchableOpacity key={t.key} activeOpacity={0.8} onPress={() => setType(t.key)}
                style={[st.typeBtn, on && { backgroundColor: t.bg, borderColor: t.color }]}>
                <View style={[st.typeBtnIcon, { backgroundColor: on ? '#fff' : t.bg }]}>
                  <TypeIcon k={t.key} c={t.color} s={14}/>
                </View>
                <Text style={[st.typeBtnTxt, { color: on ? t.color : T.textSub }]}>{t.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Label>
          제품명 <Text style={{ color: '#CBD5E1', fontFamily: FONT.regular }}>(선택)</Text>
        </Label>
        <TextInput value={name} onChangeText={setName} placeholder="예: SN2700 볼트"
          placeholderTextColor={T.textMute} style={st.input}/>

        <Label>수량</Label>
        <View style={st.qtyRow}>
          <TouchableOpacity onPress={() => setQty(q => Math.max(1, q-1))} activeOpacity={0.7} style={st.qtyBtn}>
            <Ic.minus c={T.textMain} s={18}/>
          </TouchableOpacity>
          <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
            <Text style={st.qtyValue}>{qty}</Text>
            <Text style={st.qtyUnit}>개</Text>
          </View>
          <TouchableOpacity onPress={() => setQty(q => q+1)} activeOpacity={0.7} style={st.qtyBtn}>
            <Ic.plus c={T.textMain} s={18}/>
          </TouchableOpacity>
        </View>

        <TouchableOpacity activeOpacity={0.88} onPress={() => onSave({ barcode, name, type, qty })} style={st.submitBtn}>
          <Text style={st.submitTxt}>기록하기</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function Label({ children }) {
  return <Text style={st.label}>{children}</Text>;
}

/* ============================ MANUAL INPUT SHEET ============================ */
function ManualSheet({ value, onChange, onClose, onSubmit }) {
  return (
    <View style={st.modalOverlay}>
      <TouchableOpacity activeOpacity={1} onPress={onClose} style={StyleSheet.absoluteFillObject}>
        <View style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.5)' }}/>
      </TouchableOpacity>
      <View style={st.sheet}>
        <View style={st.handle}/>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
          <Text style={st.sheetTitle}>바코드 직접 입력</Text>
          <View style={{ flex: 1 }}/>
          <TouchableOpacity onPress={onClose} style={st.sheetClose}>
            <Ic.close c={T.textSub} s={16}/>
          </TouchableOpacity>
        </View>
        <Text style={st.sheetSub}>스캔이 어려운 경우 숫자로 입력하세요</Text>

        <View style={{ height: 10 }}/>
        <Label>바코드</Label>
        <TextInput value={value} onChangeText={onChange} placeholder="바코드 번호"
          placeholderTextColor={T.textMute} keyboardType="numeric" autoFocus returnKeyType="done"
          onSubmitEditing={onSubmit} style={st.input}/>

        <TouchableOpacity activeOpacity={0.88} onPress={onSubmit}
          style={[st.submitBtn, !value.trim() && { opacity: 0.5 }]} disabled={!value.trim()}>
          <Text style={st.submitTxt}>확인</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

/* ============================ PROFILE SHEET ============================ */
function ProfileSheet({ user, onClose, onLogout }) {
  return (
    <View style={st.modalOverlay}>
      <TouchableOpacity activeOpacity={1} onPress={onClose} style={StyleSheet.absoluteFillObject}>
        <View style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.5)' }}/>
      </TouchableOpacity>
      <View style={st.sheet}>
        <View style={st.handle}/>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 20 }}>
          <View style={st.profileAvatar}>
            <Text style={st.profileAvatarTxt}>{(user.name || 'U').slice(0,1).toUpperCase()}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={st.profileName}>{user.name}</Text>
            <Text style={st.profileMeta}>아이디 {user.id}</Text>
          </View>
        </View>

        <View style={st.profileRows}>
          <ProfileRow label="로그인" value="방금 전"/>
          <ProfileRow label="앱 버전" value="1.0.0" last/>
        </View>

        <TouchableOpacity onPress={onLogout} activeOpacity={0.85} style={st.logoutBtn}>
          <Text style={st.logoutTxt}>로그아웃</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function ProfileRow({ label, value, last }) {
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'center', paddingVertical: 14 }, !last && { borderBottomWidth: 1, borderColor: T.border }]}>
      <Text style={{ fontSize: 14, color: T.textSub, fontFamily: FONT.medium }}>{label}</Text>
      <View style={{ flex: 1 }}/>
      <Text style={{ fontSize: 14, color: T.textMain, fontFamily: FONT.semi }}>{value}</Text>
    </View>
  );
}

/* ============================ TOAST ============================ */
function Toast({ toast }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(-8)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 260, useNativeDriver: true }),
    ]).start();
  }, [toast.id]);

  return (
    <Animated.View pointerEvents="none" style={[st.toast, { opacity, transform: [{ translateY }] }]}>
      <View style={st.toastCheck}><Ic.check c="#fff" s={10}/></View>
      <Text style={st.toastTxt}>{toast.text}</Text>
    </Animated.View>
  );
}

/* ============================ STYLES ============================ */
const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: T.shellBg },

  /* bottom tab bar */
  tabBar: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    flexDirection: 'row', backgroundColor: T.cardBg,
    borderTopWidth: StyleSheet.hairlineWidth, borderColor: T.border,
    paddingBottom: Platform.OS === 'ios' ? 22 : 8, paddingTop: 8,
  },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 4 },
  tabLbl: { fontSize: 11, fontFamily: FONT.medium, color: T.textMute },
  tabBadge: { backgroundColor: T.accent, borderRadius: 99, paddingHorizontal: 6, paddingVertical: 1, minWidth: 16, alignItems: 'center' },
  tabBadgeTxt: { color: '#fff', fontSize: 10, fontFamily: FONT.bold },

  /* scan idle */
  scanIdle: {
    flex: 1, backgroundColor: T.shellBg,
    paddingTop: STATUS_BAR_HEIGHT,
  },
  heroIcon: {
    width: 92, height: 92, borderRadius: 24,
    backgroundColor: T.accentSoft, alignItems: 'center', justifyContent: 'center', marginBottom: 28,
  },
  heroTitle: { fontSize: 28, fontFamily: FONT.bold, color: T.textMain, letterSpacing: -0.5, marginBottom: 10 },
  heroSub: { fontSize: 15, lineHeight: 23, color: T.textSub, textAlign: 'center', maxWidth: 280, fontFamily: FONT.medium },
  primaryBtn: {
    height: 56, borderRadius: 16, backgroundColor: T.accent,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    shadowColor: T.accent, shadowOpacity: 0.3, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 6,
  },
  primaryBtnTxt: { color: '#fff', fontSize: 16, fontFamily: FONT.bold },

  /* continuous mode — idle */
  contToggle: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: T.cardBg, borderRadius: 14, padding: 14, marginBottom: 10,
    borderWidth: 1, borderColor: T.border,
  },
  contToggleTitle: { fontSize: 15, fontFamily: FONT.bold, color: T.textMain, letterSpacing: -0.2 },
  contToggleSub: { fontSize: 12, color: T.textSub, marginTop: 2, fontFamily: FONT.medium },
  contSwitch: {
    width: 44, height: 26, borderRadius: 13, backgroundColor: '#D1D6DB',
    justifyContent: 'center', paddingHorizontal: 3,
  },
  contSwitchKnob: {
    width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff',
    shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 2, shadowOffset: { width: 0, height: 1 }, elevation: 2,
  },
  contTypePicker: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12,
  },
  contTypeChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10,
    backgroundColor: T.cardBg, borderWidth: 1.5, borderColor: T.border,
    flex: 1, minWidth: '22%',
  },
  contTypeIcon: { width: 20, height: 20, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  contTypeTxt: { fontSize: 13, fontFamily: FONT.semi },

  /* continuous mode — active badge */
  contBadge: {
    position: 'absolute', top: STATUS_BAR_HEIGHT + 16,
    left: '50%', transform: [{ translateX: -72 }],
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 10, paddingVertical: 8, borderRadius: 99,
    backgroundColor: 'rgba(0,0,0,0.55)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
  },
  contBadgeDot: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  contBadgeType: { color: '#fff', fontSize: 13, fontFamily: FONT.bold },
  contBadgeDivider: { width: 1, height: 14, backgroundColor: 'rgba(255,255,255,0.25)' },
  contBadgeCount: { color: '#fff', fontSize: 13, fontFamily: FONT.semi, minWidth: 28 },

  /* scan active */
  scanActive: { flex: 1, backgroundColor: '#000' },
  maskBlock: { position: 'absolute', backgroundColor: 'rgba(0,0,0,0.6)' },
  finder: { position: 'absolute', width: FINDER_SIZE, height: FINDER_SIZE, overflow: 'hidden' },
  corner: { position: 'absolute', width: 30, height: 30 },
  tl: { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: 6 },
  tr: { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: 6 },
  bl: { bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: 6 },
  br: { bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: 6 },
  statusPillWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  statusPill: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 16, paddingVertical: 9, borderRadius: 99,
    backgroundColor: 'rgba(255,255,255,0.10)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusTxt: { fontSize: 13, fontFamily: FONT.medium, color: '#fff' },
  camBottom: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-around',
    paddingHorizontal: 28, paddingTop: 20,
    paddingBottom: Platform.OS === 'ios' ? 36 : 24,
  },
  camBtnCircle: {
    width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.14)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
  },
  camBtnLabel: { fontSize: 11, color: 'rgba(255,255,255,0.85)', fontFamily: FONT.medium },
  camMain: {
    width: 72, height: 72, borderRadius: 36, backgroundColor: T.accent,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 4, borderColor: 'rgba(255,255,255,0.18)',
    shadowColor: T.accent, shadowOpacity: 0.4, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 10,
  },

  /* history */
  history: { flex: 1, backgroundColor: T.shellBg, paddingTop: STATUS_BAR_HEIGHT },
  histHeader: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 20, paddingVertical: 12 },
  histTitle: { flex: 1, fontSize: 26, fontFamily: FONT.bold, color: T.textMain, letterSpacing: -0.6 },
  avatar: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: T.accent,
    alignItems: 'center', justifyContent: 'center', marginTop: 2,
    shadowColor: T.accent, shadowOpacity: 0.35, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 3,
  },
  avatarTxt: { color: '#fff', fontSize: 13, fontFamily: FONT.bold },

  kpiRow: { flexDirection: 'row', paddingHorizontal: 16, gap: 8, paddingBottom: 14 },
  kpiCard: {
    flex: 1, backgroundColor: T.cardBg, borderRadius: 16,
    padding: 16, borderWidth: 1, borderColor: T.border,
  },
  kpiLabel: { fontSize: 13, color: T.textSub, fontFamily: FONT.medium },
  kpiValue: { fontSize: 28, fontFamily: FONT.bold, color: T.textMain, letterSpacing: -0.8, lineHeight: 32 },
  kpiUnit: { fontSize: 14, color: T.textMute, fontFamily: FONT.medium, marginLeft: 2 },
  kpiMeta: { fontSize: 12, fontFamily: FONT.semi, marginTop: 4 },

  filterBar: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, borderColor: T.border,
  },
  filterItem: { paddingTop: 10, paddingBottom: 12, position: 'relative' },
  filterTxt: { fontSize: 15, color: T.textMute, fontFamily: FONT.medium },
  filterCount: { fontSize: 13, color: T.textMute, fontFamily: FONT.medium },
  filterUnderline: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 2, backgroundColor: T.textMain, borderRadius: 1 },

  selectToolbar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 10, paddingBottom: 4 },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 60 },
  emptyIcon: {
    width: 56, height: 56, borderRadius: 28, backgroundColor: T.cardBg,
    borderWidth: 1, borderColor: T.border, alignItems: 'center', justifyContent: 'center', marginBottom: 14,
  },
  emptyTitle: { fontSize: 14, color: T.textSub, fontFamily: FONT.medium },
  emptySub: { fontSize: 12, color: T.textMute, marginTop: 4, fontFamily: FONT.regular },

  groupHeader: { flexDirection: 'row', alignItems: 'baseline', gap: 8, paddingHorizontal: 20, paddingTop: 14, paddingBottom: 8 },
  groupDate: { fontSize: 13, fontFamily: FONT.bold, color: T.textMain, letterSpacing: -0.2 },
  groupCount: { fontSize: 11, color: T.textMute, fontFamily: FONT.medium },
  groupCard: { marginHorizontal: 16, backgroundColor: T.cardBg, borderRadius: 14, borderWidth: 1, borderColor: T.border, overflow: 'hidden' },

  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
  rowDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderColor: T.border },
  checkbox: {
    width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: T.border,
    alignItems: 'center', justifyContent: 'center',
  },
  typeIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontSize: 15, fontFamily: FONT.semi, color: T.textMain, letterSpacing: -0.2, flexShrink: 1 },
  unsentDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: T.danger, marginLeft: 6 },
  rowSub: { fontSize: 13, color: T.textMute, marginTop: 1, letterSpacing: -0.08, fontFamily: FONT.medium },
  rowAmt: { fontSize: 17, fontFamily: FONT.semi, color: T.textMain, letterSpacing: -0.4 },
  rowAmtUnit: { fontSize: 13, color: T.textMute, fontFamily: FONT.regular },

  sendBar: {
    position: 'absolute', left: 0, right: 0, bottom: Platform.OS === 'ios' ? 78 : 60,
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: T.cardBg, borderTopWidth: 1, borderColor: T.border,
  },
  sendBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 22, height: 48, borderRadius: 14, backgroundColor: T.accent,
    shadowColor: T.accent, shadowOpacity: 0.3, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 4,
  },
  sendBtnTxt: { color: '#fff', fontSize: 15, fontFamily: FONT.bold },

  /* modal / sheet */
  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: T.cardBg, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 20, paddingTop: 14, paddingBottom: Platform.OS === 'ios' ? 40 : 28,
    maxHeight: '92%',
  },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: T.border, alignSelf: 'center', marginBottom: 18 },
  sheetTitle: { fontSize: 20, fontFamily: FONT.bold, color: T.textMain, letterSpacing: -0.3 },
  sheetClose: { width: 32, height: 32, borderRadius: 16, backgroundColor: T.shellBg, alignItems: 'center', justifyContent: 'center' },
  sheetSub: { fontSize: 13, color: T.textSub, marginBottom: 16, marginTop: 2, fontFamily: FONT.medium },

  barcodeCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: T.summaryBg, borderRadius: 14, padding: 14, marginBottom: 18,
  },
  barcodeIconWrap: {
    width: 40, height: 40, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center', justifyContent: 'center',
  },
  barcodeLabel: { fontSize: 10, color: 'rgba(255,255,255,0.5)', fontFamily: FONT.medium, letterSpacing: 0.6, marginBottom: 2 },
  barcodeValue: { fontSize: 15, fontFamily: FONT.semi, color: '#fff', letterSpacing: 0.3 },

  label: {
    fontSize: 11, fontFamily: FONT.semi, color: T.textMute,
    letterSpacing: 0.6, marginBottom: 8,
  },

  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  typeBtn: {
    width: (SCREEN_W - 40 - 8) / 2,
    flexDirection: 'row', alignItems: 'center', gap: 10,
    padding: 12, borderRadius: 12,
    backgroundColor: T.shellBg, borderWidth: 1.5, borderColor: 'transparent',
  },
  typeBtnIcon: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  typeBtnTxt: { fontSize: 14, fontFamily: FONT.semi },

  input: {
    backgroundColor: T.shellBg, borderRadius: 12, paddingHorizontal: 14, height: 48,
    borderWidth: 1.5, borderColor: T.border, fontSize: 15, color: T.textMain, marginBottom: 16,
    fontFamily: FONT.medium,
  },

  qtyRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: T.shellBg, borderRadius: 12, padding: 6, borderWidth: 1.5, borderColor: T.border,
    marginBottom: 20,
  },
  qtyBtn: {
    width: 44, height: 44, borderRadius: 10, backgroundColor: T.cardBg,
    borderWidth: 1, borderColor: T.border, alignItems: 'center', justifyContent: 'center',
  },
  qtyValue: { fontSize: 26, fontFamily: FONT.bold, color: T.textMain },
  qtyUnit: { fontSize: 13, color: T.textMute, fontFamily: FONT.medium, marginLeft: 4 },

  submitBtn: {
    height: 54, borderRadius: 14, backgroundColor: T.accent, alignItems: 'center', justifyContent: 'center',
    shadowColor: T.accent, shadowOpacity: 0.3, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 6,
  },
  submitTxt: { color: '#fff', fontSize: 16, fontFamily: FONT.bold },

  /* profile sheet */
  profileAvatar: {
    width: 56, height: 56, borderRadius: 28, backgroundColor: T.accent,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: T.accent, shadowOpacity: 0.35, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 4,
  },
  profileAvatarTxt: { color: '#fff', fontSize: 22, fontFamily: FONT.bold },
  profileName: { fontSize: 18, fontFamily: FONT.bold, color: T.textMain, letterSpacing: -0.3 },
  profileMeta: { fontSize: 13, color: T.textSub, marginTop: 2, fontFamily: FONT.medium },
  profileRows: { backgroundColor: T.shellBg, borderRadius: 14, paddingHorizontal: 16, marginBottom: 14 },
  logoutBtn: {
    height: 52, borderRadius: 14, borderWidth: 1, borderColor: T.border,
    alignItems: 'center', justifyContent: 'center', backgroundColor: 'transparent',
  },
  logoutTxt: { fontSize: 15, color: T.danger, fontFamily: FONT.semi },

  /* toast */
  toast: {
    position: 'absolute', alignSelf: 'center', top: STATUS_BAR_HEIGHT + 16, zIndex: 100,
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 20, paddingVertical: 12, borderRadius: 99,
    backgroundColor: T.textMain,
    shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 14, shadowOffset: { width: 0, height: 10 }, elevation: 8,
  },
  toastCheck: {
    width: 18, height: 18, borderRadius: 9, backgroundColor: T.accent,
    alignItems: 'center', justifyContent: 'center',
  },
  toastTxt: { color: '#fff', fontSize: 14, fontFamily: FONT.semi },
});
