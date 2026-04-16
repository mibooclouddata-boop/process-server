import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, SafeAreaView,
  FlatList, TextInput, Alert, Vibration, Dimensions, StatusBar,
  Animated, Modal, Platform, ScrollView
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const TEAL = '#00b894';
const FINDER_SIZE = Math.min(SCREEN_W * 0.75, 300);
const maskColor = 'rgba(0,0,0,0.55)';
const STATUS_BAR_HEIGHT = Platform.OS === 'android' ? StatusBar.currentHeight || 24 : 44;
const HEADER_HEIGHT = 56;
const FINDER_TOP = (SCREEN_H - STATUS_BAR_HEIGHT - HEADER_HEIGHT - FINDER_SIZE) / 2 + STATUS_BAR_HEIGHT + HEADER_HEIGHT;

const TYPE_OPTIONS = [
  { key: 'in',       label: '입고', icon: '⬇', color: '#00724f', bg: '#e8f8f2', border: '#00967a' },
  { key: 'out',      label: '출고', icon: '⬆', color: '#922b21', bg: '#fdf0ec', border: '#c0392b' },
  { key: 'stamp',    label: '도장', icon: '🔖', color: '#6c3483', bg: '#f5eef8', border: '#8e44ad' },
  { key: 'assembly', label: '조립', icon: '🔧', color: '#1a5276', bg: '#eaf2ff', border: '#2980b9' },
];
function getTypeInfo(key) { return TYPE_OPTIONS.find(t => t.key === key) || TYPE_OPTIONS[0]; }

export default function App() {
  const [permission, requestPermission] = useCameraPermissions();
  const [tab, setTab] = useState('scan');
  const [camOn, setCamOn] = useState(false);
  const [flashOn, setFlashOn] = useState(false);
  const [scanState, setScanState] = useState('idle');

  // 화면 좌표계 기준 빨간 박스
  const [screenBox, setScreenBox] = useState(null);
  // 카메라 실제 해상도 (onCameraReady에서 받아옴)
  const camSize = useRef({ width: 1920, height: 1080 });

  const [regVisible, setRegVisible] = useState(false);
  const [regBarcode, setRegBarcode] = useState('');
  const [regName, setRegName] = useState('');
  const [regType, setRegType] = useState('in');
  const [regQty, setRegQty] = useState(1);
  const [manualInput, setManualInput] = useState('');
  const [manualVisible, setManualVisible] = useState(false);
  const [logs, setLogs] = useState([]);
  const [filter, setFilter] = useState('all');
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [sendConfirmVisible, setSendConfirmVisible] = useState(false);

  const scanLocked = useRef(false);
  const finderBorderAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => { loadLogs(); }, []);

  async function loadLogs() {
    try { const s = await AsyncStorage.getItem('inv_logs'); if (s) setLogs(JSON.parse(s)); } catch (e) {}
  }
  async function saveLogs(nl) {
    try { await AsyncStorage.setItem('inv_logs', JSON.stringify(nl)); } catch (e) {}
  }

  async function startScan() {
    if (!permission?.granted) {
      const r = await requestPermission();
      if (!r.granted) { Alert.alert('카메라 권한 필요', '설정에서 카메라 권한을 허용해주세요.'); return; }
    }
    scanLocked.current = false;
    setScreenBox(null);
    setScanState('scanning');
    setCamOn(true);
  }

  function stopScan() {
    scanLocked.current = false;
    setCamOn(false); setFlashOn(false);
    setScanState('idle'); setScreenBox(null);
  }

  /* ══════════════════════════════════════════════════════
     핵심: 카메라 좌표 → 화면 좌표 변환
     CameraView는 object-fit: cover 방식으로 렌더링됨
     → 카메라 프레임이 화면에 맞게 크롭/스케일됨
     → bounds는 카메라 프레임 기준이라 변환 필요
  ══════════════════════════════════════════════════════ */
  function transformBounds(bounds) {
    if (!bounds) return null;
    try {
      const camW = camSize.current.width;
      const camH = camSize.current.height;

      // cover 방식 스케일: 화면을 꽉 채우는 스케일 계산
      const scaleX = SCREEN_W / camW;
      const scaleY = SCREEN_H / camH;
      const scale = Math.max(scaleX, scaleY); // cover = max

      // 카메라 프레임이 화면 중앙에 위치할 때 오프셋
      const offsetX = (SCREEN_W - camW * scale) / 2;
      const offsetY = (SCREEN_H - camH * scale) / 2;

      // bounds 원본값 추출 (버전별 대응)
      const bx = bounds.origin?.x ?? bounds.x ?? 0;
      const by = bounds.origin?.y ?? bounds.y ?? 0;
      const bw = bounds.size?.width ?? bounds.width ?? 60;
      const bh = bounds.size?.height ?? bounds.height ?? 30;

      return {
        x: bx * scale + offsetX,
        y: by * scale + offsetY,
        width: bw * scale,
        height: bh * scale,
      };
    } catch (e) { return null; }
  }

  const onBarcodeScanned = useCallback((scanResult) => {
    if (scanLocked.current) return;
    const code = scanResult?.data?.trim() || scanResult?.value?.trim() || '';
    if (!code || code.length < 2) return;

    scanLocked.current = true;
    setScanState('detected');
    Vibration.vibrate(100);

    // 빨간 박스 → 좌표 변환 후 표시
    const rawBounds = scanResult?.bounds || scanResult?.boundingBox;
    const box = transformBounds(rawBounds);
    if (box) setScreenBox(box);

    // 코너 초록색 애니메이션
    Animated.sequence([
      Animated.timing(finderBorderAnim, { toValue: 1, duration: 200, useNativeDriver: false }),
      Animated.delay(600),
      Animated.timing(finderBorderAnim, { toValue: 0, duration: 200, useNativeDriver: false }),
    ]).start();

    setTimeout(() => { stopScan(); openReg(code); }, 1000);
  }, []);

  function openReg(code) {
    setRegBarcode(code); setRegName(''); setRegType('in'); setRegQty(1); setRegVisible(true);
  }

  function registerIO() {
    if (!regBarcode) return;
    const now = new Date();
    const ts = `${now.getMonth()+1}/${now.getDate()} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
    const newLog = { id: Date.now(), barcode: regBarcode, name: regName, type: regType, qty: regQty, time: ts };
    const nl = [newLog, ...logs];
    setLogs(nl); saveLogs(nl); setRegVisible(false); setTab('history');
  }

  function deleteLog(id) {
    Alert.alert('삭제', '이 기록을 삭제할까요?', [
      { text: '취소', style: 'cancel' },
      { text: '삭제', style: 'destructive', onPress: () => {
        const nl = logs.filter(l => l.id !== id); setLogs(nl); saveLogs(nl);
        setSelectedIds(prev => { const s = new Set(prev); s.delete(id); return s; });
      }}
    ]);
  }

  function clearAll() {
    if (!logs.length) return;
    Alert.alert('전체 삭제', '모든 기록을 삭제할까요?', [
      { text: '취소', style: 'cancel' },
      { text: '삭제', style: 'destructive', onPress: () => { setLogs([]); saveLogs([]); setSelectedIds(new Set()); setSelectMode(false); }}
    ]);
  }

  function toggleSelectMode() { setSelectMode(v => !v); setSelectedIds(new Set()); }
  function toggleSelectAll() {
    const f = getFiltered();
    setSelectedIds(selectedIds.size === f.length ? new Set() : new Set(f.map(l => l.id)));
  }
  function toggleSelect(id) {
    setSelectedIds(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  }

  async function sendSelected() {
    if (selectedIds.size === 0) { Alert.alert('알림', '전송할 항목을 선택해주세요.'); return; }
    setSendConfirmVisible(true);
  }
  async function confirmSend() {
    setSendConfirmVisible(false);
    const toSend = getFiltered().filter(l => selectedIds.has(l.id));

    // ✅ 서버 주소 — PC IP 또는 배포 주소로 변경
    // 로컬 테스트: 'http://192.168.x.x:3000' (PC의 로컬 IP)
    // 배포 후: 'https://your-app.onrender.com'
    const SERVER_URL = 'http://192.168.1.100:3000';

    try {
      const r = await fetch(`${SERVER_URL}/api/scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          records: toSend,
          userId: 'app_user',    // 나중에 앱 로그인 기능 추가 시 교체
          userName: '앱 사용자',
          sentAt: new Date().toISOString(),
        }),
      });
      if (r.ok) {
        Alert.alert('전송 완료', `${toSend.length}건이 전송되었습니다.`);
        setSelectMode(false); setSelectedIds(new Set());
      } else {
        Alert.alert('전송 실패', '서버 오류가 발생했습니다.');
      }
    } catch (e) {
      Alert.alert('전송 실패', `서버에 연결할 수 없습니다.\n주소 확인: ${SERVER_URL}`);
    }
  }

  function getFiltered() { return filter === 'all' ? logs : logs.filter(l => l.type === filter); }
  const filteredLogs = getFiltered();
  const allSelected = filteredLogs.length > 0 && selectedIds.size === filteredLogs.length;
  const selectedToSend = filteredLogs.filter(l => selectedIds.has(l.id));

  const cornerColor = finderBorderAnim.interpolate({ inputRange:[0,1], outputRange:['#ffffff','#00b894'] });

  const ScanScreen = () => (
    <View style={s.scanScreen}>
      {camOn ? (
        <>
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            enableTorch={flashOn}
            autofocus="on"
            onBarcodeScanned={onBarcodeScanned}
            barcodeScannerSettings={{
              barcodeTypes: ['code128','code39','code93','ean13','ean8','upc_a','upc_e','qr','itf14','codabar','datamatrix'],
            }}
          />

          {/* 마스크 */}
          <View style={[s.maskTop, { height: FINDER_TOP }]} />
          <View style={[s.maskBottom, { top: FINDER_TOP + FINDER_SIZE }]} />
          <View style={[s.maskSide, { left: 0, top: FINDER_TOP, height: FINDER_SIZE }]} />
          <View style={[s.maskSide, { right: 0, top: FINDER_TOP, height: FINDER_SIZE }]} />

          {/* 뷰파인더 코너 */}
          <View style={[s.finder, { top: FINDER_TOP, left: (SCREEN_W-FINDER_SIZE)/2 }]}>
            <Animated.View style={[s.corner, s.tl, { borderColor: cornerColor }]} />
            <Animated.View style={[s.corner, s.tr, { borderColor: cornerColor }]} />
            <Animated.View style={[s.corner, s.bl, { borderColor: cornerColor }]} />
            <Animated.View style={[s.corner, s.br, { borderColor: cornerColor }]} />
            {scanState === 'detected' && (
              <View style={s.detectedOverlay}><Text style={s.detectedText}>✓</Text></View>
            )}
          </View>

          {/* ✅ 변환된 화면 좌표로 빨간 박스 표시 */}
          {screenBox && (
            <View pointerEvents="none" style={[s.boundingBox, {
              left: screenBox.x,
              top: screenBox.y,
              width: screenBox.width,
              height: screenBox.height,
            }]} />
          )}

          {/* 상태 텍스트 */}
          <View style={[s.scanStatusWrap, { top: FINDER_TOP + FINDER_SIZE + 16 }]}>
            <Text style={s.scanStatusTxt}>
              {scanState === 'detected' ? '✓ 인식 완료!' : '바코드를 박스 안에 맞춰주세요'}
            </Text>
          </View>

          {/* 하단 버튼 */}
          <View style={s.camBottom}>
            <TouchableOpacity style={s.camBtn} onPress={() => setFlashOn(f => !f)}>
              <View style={[s.camBtnCircle, flashOn && s.camBtnCircleOn]}>
                <Text style={s.camBtnIcon}>{flashOn ? '🔦' : '💡'}</Text>
              </View>
              <Text style={[s.camBtnLabel, flashOn && { color:'#ffd32a' }]}>{flashOn ? '켜짐' : '조명'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.camBtnMainWrap} onPress={stopScan}>
              <View style={s.camBtnMain}><Text style={s.camBtnMainIcon}>⏹</Text></View>
              <Text style={s.camBtnLabel}>중지</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.camBtn} onPress={() => { stopScan(); setManualVisible(true); }}>
              <View style={s.camBtnCircle}><Text style={s.camBtnIcon}>✏️</Text></View>
              <Text style={s.camBtnLabel}>직접입력</Text>
            </TouchableOpacity>
          </View>
        </>
      ) : (
        <View style={s.hintWrap}>
          <Text style={s.hintIcon}>📦</Text>
          <Text style={s.hintTitle}>입출고 관리</Text>
          <Text style={s.hintText}>바코드를 스캔해서{'\n'}입출고를 기록하세요</Text>
          <View style={s.hintBtnRow}>
            <TouchableOpacity style={s.hintBtnSub} onPress={() => setManualVisible(true)}>
              <Text style={s.hintBtnSubTxt}>✏️ 직접입력</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.hintBtnMain} onPress={startScan}>
              <Text style={s.hintBtnMainTxt}>📷 스캔 시작</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );

  const HistoryScreen = () => (
    <View style={s.historyScreen}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.metricsScroll} contentContainerStyle={s.metricsRow}>
        {[
          { label:'전체', val:logs.length, color:'#1a1a18' },
          { label:'입고', val:logs.filter(l=>l.type==='in').length, color:'#00967a' },
          { label:'출고', val:logs.filter(l=>l.type==='out').length, color:'#c0392b' },
          { label:'도장', val:logs.filter(l=>l.type==='stamp').length, color:'#8e44ad' },
          { label:'조립', val:logs.filter(l=>l.type==='assembly').length, color:'#2980b9' },
        ].map(m => (
          <View key={m.label} style={s.metric}>
            <Text style={s.metricLbl}>{m.label}</Text>
            <Text style={[s.metricVal, { color: m.color }]}>{m.val}</Text>
          </View>
        ))}
      </ScrollView>

      <View style={s.filterRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filterScroll}>
          {[['all','전체'],['in','입고'],['out','출고'],['stamp','도장'],['assembly','조립']].map(([f,label]) => (
            <TouchableOpacity key={f} style={[s.filterBtn, filter===f && s.filterBtnOn]} onPress={() => setFilter(f)}>
              <Text style={[s.filterTxt, filter===f && s.filterTxtOn]}>{label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <View style={s.toolbar}>
        <TouchableOpacity style={[s.toolBtn, selectMode && s.toolBtnOn]} onPress={toggleSelectMode}>
          <Text style={[s.toolBtnTxt, selectMode && s.toolBtnTxtOn]}>{selectMode ? '선택 취소' : '선택'}</Text>
        </TouchableOpacity>
        {selectMode && (
          <TouchableOpacity style={s.toolBtn} onPress={toggleSelectAll}>
            <Text style={s.toolBtnTxt}>{allSelected ? '전체 해제' : '전체 선택'}</Text>
          </TouchableOpacity>
        )}
        <View style={s.toolSpacer} />
        <TouchableOpacity onPress={clearAll}><Text style={s.clearTxt}>전체 삭제</Text></TouchableOpacity>
      </View>

      {filteredLogs.length === 0 ? (
        <View style={s.empty}>
          <Text style={s.emptyIcon}>📋</Text>
          <Text style={s.emptyTxt}>기록이 없습니다{'\n'}바코드를 스캔해보세요</Text>
        </View>
      ) : (
        <FlatList
          data={filteredLogs}
          keyExtractor={item => String(item.id)}
          contentContainerStyle={{ padding:16, paddingBottom: selectMode ? 100 : 32 }}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => {
            const t = getTypeInfo(item.type);
            const isSelected = selectedIds.has(item.id);
            return (
              <TouchableOpacity
                style={[s.logItem, isSelected && s.logItemSelected]}
                onPress={() => selectMode && toggleSelect(item.id)}
                onLongPress={() => { if (!selectMode) { setSelectMode(true); toggleSelect(item.id); } }}
                activeOpacity={0.7}
              >
                {selectMode && (
                  <View style={[s.checkbox, isSelected && s.checkboxOn]}>
                    {isSelected && <Text style={s.checkmark}>✓</Text>}
                  </View>
                )}
                <View style={[s.badge, { backgroundColor: t.bg }]}>
                  <Text style={[s.badgeTxt, { color: t.color }]}>{t.label}</Text>
                </View>
                <View style={s.logInfo}>
                  <Text style={s.logBarcode} numberOfLines={1}>{item.barcode}</Text>
                  {item.name ? <Text style={s.logName} numberOfLines={1}>{item.name}</Text> : null}
                  <Text style={s.logTime}>{item.time}</Text>
                </View>
                <Text style={[s.logQty, { color: t.color }]}>{item.qty}개</Text>
              </TouchableOpacity>
            );
          }}
        />
      )}

      {selectMode && (
        <View style={s.sendBar}>
          <Text style={s.sendBarCount}>{selectedIds.size > 0 ? `${selectedIds.size}건 선택됨` : '항목을 선택하세요'}</Text>
          <TouchableOpacity style={[s.sendBtn, selectedIds.size === 0 && s.sendBtnDisabled]} onPress={sendSelected} disabled={selectedIds.size === 0} activeOpacity={0.8}>
            <Text style={s.sendBtnTxt}>📤 전송</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );

  return (
    <View style={s.root}>
      <StatusBar barStyle={camOn ? 'light-content' : 'dark-content'} backgroundColor={camOn ? 'transparent' : '#fff'} translucent={false} />
      <View style={[s.safeTop, { height: STATUS_BAR_HEIGHT, backgroundColor: camOn ? '#000' : '#fff' }]} />

      {!camOn && (
        <View style={s.header}>
          <TouchableOpacity style={[s.headerTab, tab==='scan' && s.headerTabOn]} onPress={() => setTab('scan')} activeOpacity={0.7}>
            <Text style={s.headerTabIcon}>🔲</Text>
            <Text style={[s.headerTabTxt, tab==='scan' && s.headerTabTxtOn]}>스캔</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.headerTab, tab==='history' && s.headerTabOn]} onPress={() => setTab('history')} activeOpacity={0.7}>
            <Text style={s.headerTabIcon}>📋</Text>
            <Text style={[s.headerTabTxt, tab==='history' && s.headerTabTxtOn]}>히스토리</Text>
          </TouchableOpacity>
        </View>
      )}

      {tab === 'scan' ? <ScanScreen /> : <HistoryScreen />}

      {/* 전송 확인 모달 */}
      <Modal visible={sendConfirmVisible} animationType="fade" transparent onRequestClose={() => setSendConfirmVisible(false)}>
        <View style={s.confirmOverlay}>
          <View style={s.confirmBox}>
            <Text style={s.confirmIcon}>📤</Text>
            <Text style={s.confirmTitle}>전송 확인</Text>
            <Text style={s.confirmMsg}>총 <Text style={s.confirmCount}>{selectedToSend.length}건</Text>을{'\n'}전송하시겠습니까?</Text>
            <View style={s.confirmList}>
              {selectedToSend.slice(0, 5).map(item => {
                const t = getTypeInfo(item.type);
                return (
                  <View key={item.id} style={s.confirmItem}>
                    <View style={[s.confirmBadge, { backgroundColor: t.bg }]}><Text style={[s.confirmBadgeTxt, { color: t.color }]}>{t.label}</Text></View>
                    <Text style={s.confirmBarcode} numberOfLines={1}>{item.barcode}</Text>
                    <Text style={s.confirmQty}>{item.qty}개</Text>
                  </View>
                );
              })}
              {selectedToSend.length > 5 && <Text style={s.confirmMore}>외 {selectedToSend.length - 5}건 더...</Text>}
            </View>
            <View style={s.confirmBtnRow}>
              <TouchableOpacity style={s.confirmCancelBtn} onPress={() => setSendConfirmVisible(false)} activeOpacity={0.7}>
                <Text style={s.confirmCancelTxt}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.confirmSendBtn} onPress={confirmSend} activeOpacity={0.8}>
                <Text style={s.confirmSendTxt}>전송하기</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* 등록 모달 */}
      <Modal visible={regVisible} animationType="slide" transparent onRequestClose={() => setRegVisible(false)}>
        <View style={s.modalOverlay}>
          <TouchableOpacity style={s.modalDim} activeOpacity={1} onPress={() => setRegVisible(false)} />
          <View style={s.modalSheet}>
            <View style={s.modalHandle} />
            <Text style={s.modalTitle}>입출고 등록</Text>
            <Text style={s.fieldLabel}>스캔된 바코드</Text>
            <View style={s.barcodeBox}><Text style={s.barcodeVal} numberOfLines={2}>{regBarcode}</Text></View>
            <Text style={s.fieldLabel}>제품명 (선택)</Text>
            <TextInput style={s.input} value={regName} onChangeText={setRegName} placeholder="예: SN2700 볼트" placeholderTextColor="#bbb" returnKeyType="done" />
            <Text style={s.fieldLabel}>유형</Text>
            <View style={s.typeGrid}>
              {TYPE_OPTIONS.map(t => (
                <TouchableOpacity key={t.key} style={[s.typeBtn, regType===t.key && { backgroundColor: t.bg, borderColor: t.border }]} onPress={() => setRegType(t.key)} activeOpacity={0.7}>
                  <Text style={s.typeBtnIcon}>{t.icon}</Text>
                  <Text style={[s.typeBtnTxt, regType===t.key && { color: t.color }]}>{t.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={s.fieldLabel}>수량</Text>
            <View style={s.qtyRow}>
              <TouchableOpacity style={s.qtyBtn} onPress={() => setRegQty(q => Math.max(1, q-1))} activeOpacity={0.7}><Text style={s.qtyBtnTxt}>−</Text></TouchableOpacity>
              <Text style={s.qtyVal}>{regQty}</Text>
              <TouchableOpacity style={s.qtyBtn} onPress={() => setRegQty(q => q+1)} activeOpacity={0.7}><Text style={s.qtyBtnTxt}>+</Text></TouchableOpacity>
            </View>
            <TouchableOpacity style={s.submitBtn} onPress={registerIO} activeOpacity={0.8}><Text style={s.submitTxt}>기록하기</Text></TouchableOpacity>
            <TouchableOpacity style={s.cancelBtn} onPress={() => setRegVisible(false)} activeOpacity={0.7}><Text style={s.cancelTxt}>취소</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* 직접입력 모달 */}
      <Modal visible={manualVisible} animationType="slide" transparent onRequestClose={() => { setManualVisible(false); setManualInput(''); }}>
        <View style={s.modalOverlay}>
          <TouchableOpacity style={s.modalDim} activeOpacity={1} onPress={() => { setManualVisible(false); setManualInput(''); }} />
          <View style={s.modalSheet}>
            <View style={s.modalHandle} />
            <Text style={s.modalTitle}>바코드 직접 입력</Text>
            <TextInput style={s.input} value={manualInput} onChangeText={setManualInput} placeholder="바코드 번호 입력" placeholderTextColor="#bbb" keyboardType="numeric" autoFocus returnKeyType="done"
              onSubmitEditing={() => { if (!manualInput.trim()) return; setManualVisible(false); openReg(manualInput.trim()); setManualInput(''); }}
            />
            <TouchableOpacity style={s.submitBtn} onPress={() => { if (!manualInput.trim()) return; setManualVisible(false); openReg(manualInput.trim()); setManualInput(''); }} activeOpacity={0.8}><Text style={s.submitTxt}>확인</Text></TouchableOpacity>
            <TouchableOpacity style={s.cancelBtn} onPress={() => { setManualVisible(false); setManualInput(''); }} activeOpacity={0.7}><Text style={s.cancelTxt}>취소</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex:1, backgroundColor:'#fff' },
  safeTop: { width:'100%' },
  header: { flexDirection:'row', borderBottomWidth:0.5, borderColor:'#ebebea', backgroundColor:'#fff' },
  headerTab: { flex:1, paddingVertical:12, alignItems:'center', gap:4 },
  headerTabOn: { borderBottomWidth:2.5, borderColor:TEAL },
  headerTabIcon: { fontSize:18 },
  headerTabTxt: { fontSize:13, color:'#aaa', fontWeight:'500' },
  headerTabTxtOn: { color:TEAL, fontWeight:'700' },
  scanScreen: { flex:1, backgroundColor:'#000' },
  maskTop: { position:'absolute', top:0, left:0, right:0, backgroundColor:maskColor },
  maskBottom: { position:'absolute', bottom:0, left:0, right:0, backgroundColor:maskColor },
  maskSide: { position:'absolute', width:(SCREEN_W-FINDER_SIZE)/2, backgroundColor:maskColor },
  finder: { position:'absolute', width:FINDER_SIZE, height:FINDER_SIZE },
  corner: { position:'absolute', width:26, height:26, borderStyle:'solid' },
  tl: { top:0, left:0, borderTopWidth:3, borderLeftWidth:3, borderTopLeftRadius:5 },
  tr: { top:0, right:0, borderTopWidth:3, borderRightWidth:3, borderTopRightRadius:5 },
  bl: { bottom:0, left:0, borderBottomWidth:3, borderLeftWidth:3, borderBottomLeftRadius:5 },
  br: { bottom:0, right:0, borderBottomWidth:3, borderRightWidth:3, borderBottomRightRadius:5 },
  boundingBox: {
    position:'absolute',
    borderWidth:2.5,
    borderColor:'#ff4757',
    borderRadius:4,
    backgroundColor:'rgba(255,71,87,0.12)',
  },
  detectedOverlay: { position:'absolute', top:0, left:0, right:0, bottom:0, backgroundColor:'rgba(0,184,148,0.2)', alignItems:'center', justifyContent:'center', borderRadius:4 },
  detectedText: { fontSize:48, color:'#00b894' },
  scanStatusWrap: { position:'absolute', left:0, right:0, alignItems:'center' },
  scanStatusTxt: { fontSize:13, color:'rgba(255,255,255,0.85)', fontWeight:'500' },
  camBottom: { position:'absolute', bottom:0, left:0, right:0, flexDirection:'row', justifyContent:'space-around', alignItems:'center', paddingBottom: Platform.OS==='android'?24:36, paddingTop:20, backgroundColor:'rgba(0,0,0,0.5)' },
  camBtn: { alignItems:'center', gap:8 },
  camBtnMainWrap: { alignItems:'center', gap:8 },
  camBtnCircle: { width:52, height:52, borderRadius:26, backgroundColor:'rgba(255,255,255,0.18)', borderWidth:0.5, borderColor:'rgba(255,255,255,0.3)', alignItems:'center', justifyContent:'center' },
  camBtnCircleOn: { backgroundColor:'rgba(255,211,42,0.25)', borderColor:'#ffd32a' },
  camBtnMain: { width:68, height:68, borderRadius:34, backgroundColor:TEAL, alignItems:'center', justifyContent:'center' },
  camBtnIcon: { fontSize:22 },
  camBtnMainIcon: { fontSize:26, color:'#fff' },
  camBtnLabel: { fontSize:11, color:'rgba(255,255,255,0.85)', fontWeight:'500' },
  hintWrap: { flex:1, backgroundColor:'#111', alignItems:'center', justifyContent:'center', padding:32 },
  hintIcon: { fontSize:72, marginBottom:16 },
  hintTitle: { fontSize:22, fontWeight:'800', color:'#fff', marginBottom:10 },
  hintText: { fontSize:15, color:'rgba(255,255,255,0.6)', textAlign:'center', lineHeight:24, marginBottom:48 },
  hintBtnRow: { flexDirection:'row', gap:12, width:'100%' },
  hintBtnSub: { flex:1, paddingVertical:15, borderRadius:14, borderWidth:1, borderColor:'rgba(255,255,255,0.2)', alignItems:'center' },
  hintBtnSubTxt: { fontSize:15, color:'rgba(255,255,255,0.8)', fontWeight:'600' },
  hintBtnMain: { flex:2, paddingVertical:15, borderRadius:14, backgroundColor:TEAL, alignItems:'center' },
  hintBtnMainTxt: { fontSize:15, color:'#fff', fontWeight:'800' },
  historyScreen: { flex:1, backgroundColor:'#f5f5f3' },
  metricsScroll: { flexGrow:0 },
  metricsRow: { gap:8, padding:12, paddingBottom:0 },
  metric: { backgroundColor:'#fff', borderRadius:12, padding:12, alignItems:'center', borderWidth:0.5, borderColor:'#ebebea', minWidth:68 },
  metricLbl: { fontSize:10, color:'#aaa', marginBottom:4, fontWeight:'500' },
  metricVal: { fontSize:22, fontWeight:'800' },
  filterRow: { paddingVertical:10 },
  filterScroll: { gap:6, paddingHorizontal:14 },
  filterBtn: { paddingHorizontal:14, paddingVertical:6, borderRadius:20, borderWidth:1, borderColor:'#e0e0e0', backgroundColor:'#fff' },
  filterBtnOn: { backgroundColor:'#1a1a18', borderColor:'#1a1a18' },
  filterTxt: { fontSize:12, color:'#888', fontWeight:'500' },
  filterTxtOn: { color:'#fff', fontWeight:'700' },
  toolbar: { flexDirection:'row', alignItems:'center', paddingHorizontal:14, paddingBottom:8, gap:8 },
  toolBtn: { paddingHorizontal:14, paddingVertical:6, borderRadius:20, borderWidth:1, borderColor:'#e0e0e0', backgroundColor:'#fff' },
  toolBtnOn: { backgroundColor:'#1a1a18', borderColor:'#1a1a18' },
  toolBtnTxt: { fontSize:12, color:'#888', fontWeight:'500' },
  toolBtnTxtOn: { color:'#fff', fontWeight:'700' },
  toolSpacer: { flex:1 },
  clearTxt: { fontSize:12, color:'#ccc' },
  empty: { flex:1, alignItems:'center', justifyContent:'center', gap:14 },
  emptyIcon: { fontSize:48 },
  emptyTxt: { fontSize:14, color:'#bbb', textAlign:'center', lineHeight:22 },
  logItem: { backgroundColor:'#fff', borderRadius:14, padding:14, marginBottom:8, flexDirection:'row', alignItems:'center', gap:10, borderWidth:0.5, borderColor:'#ebebea' },
  logItemSelected: { borderColor:TEAL, borderWidth:1.5, backgroundColor:'#f0fdf9' },
  checkbox: { width:22, height:22, borderRadius:11, borderWidth:1.5, borderColor:'#ccc', alignItems:'center', justifyContent:'center', backgroundColor:'#fff' },
  checkboxOn: { backgroundColor:TEAL, borderColor:TEAL },
  checkmark: { fontSize:12, color:'#fff', fontWeight:'800' },
  badge: { paddingHorizontal:9, paddingVertical:4, borderRadius:16 },
  badgeTxt: { fontSize:11, fontWeight:'700' },
  logInfo: { flex:1 },
  logBarcode: { fontFamily:'monospace', fontSize:13, fontWeight:'700', color:'#1a1a18' },
  logName: { fontSize:12, color:'#888', marginTop:2 },
  logTime: { fontSize:11, color:'#ccc', marginTop:2 },
  logQty: { fontSize:16, fontWeight:'800' },
  sendBar: { position:'absolute', bottom:0, left:0, right:0, flexDirection:'row', alignItems:'center', backgroundColor:'#fff', borderTopWidth:0.5, borderColor:'#ebebea', paddingHorizontal:16, paddingVertical:12, paddingBottom: Platform.OS==='android'?16:28, gap:12 },
  sendBarCount: { flex:1, fontSize:14, color:'#888', fontWeight:'500' },
  sendBtn: { backgroundColor:TEAL, borderRadius:12, paddingHorizontal:24, paddingVertical:12 },
  sendBtnDisabled: { backgroundColor:'#ccc' },
  sendBtnTxt: { color:'#fff', fontSize:15, fontWeight:'800' },
  confirmOverlay: { flex:1, backgroundColor:'rgba(0,0,0,0.5)', alignItems:'center', justifyContent:'center', padding:24 },
  confirmBox: { backgroundColor:'#fff', borderRadius:20, padding:24, width:'100%', maxWidth:360 },
  confirmIcon: { fontSize:40, textAlign:'center', marginBottom:12 },
  confirmTitle: { fontSize:18, fontWeight:'800', color:'#1a1a18', textAlign:'center', marginBottom:8 },
  confirmMsg: { fontSize:15, color:'#666', textAlign:'center', lineHeight:24, marginBottom:16 },
  confirmCount: { fontSize:18, fontWeight:'800', color:TEAL },
  confirmList: { backgroundColor:'#f5f5f3', borderRadius:12, padding:12, marginBottom:20, gap:8 },
  confirmItem: { flexDirection:'row', alignItems:'center', gap:8 },
  confirmBadge: { paddingHorizontal:8, paddingVertical:3, borderRadius:12 },
  confirmBadgeTxt: { fontSize:11, fontWeight:'700' },
  confirmBarcode: { flex:1, fontFamily:'monospace', fontSize:12, color:'#444' },
  confirmQty: { fontSize:12, color:'#888', fontWeight:'600' },
  confirmMore: { fontSize:12, color:'#aaa', textAlign:'center', marginTop:4 },
  confirmBtnRow: { flexDirection:'row', gap:10 },
  confirmCancelBtn: { flex:1, paddingVertical:14, borderRadius:12, borderWidth:1, borderColor:'#e0e0e0', alignItems:'center' },
  confirmCancelTxt: { fontSize:15, color:'#888', fontWeight:'600' },
  confirmSendBtn: { flex:2, paddingVertical:14, borderRadius:12, backgroundColor:TEAL, alignItems:'center' },
  confirmSendTxt: { fontSize:15, color:'#fff', fontWeight:'800' },
  modalOverlay: { flex:1, justifyContent:'flex-end' },
  modalDim: { ...StyleSheet.absoluteFillObject, backgroundColor:'rgba(0,0,0,0.5)' },
  modalSheet: { backgroundColor:'#fff', borderTopLeftRadius:24, borderTopRightRadius:24, padding:24, paddingBottom:36 },
  modalHandle: { width:40, height:4, borderRadius:2, backgroundColor:'#e0e0e0', alignSelf:'center', marginBottom:20 },
  modalTitle: { fontSize:18, fontWeight:'800', marginBottom:20, color:'#1a1a18' },
  fieldLabel: { fontSize:11, fontWeight:'700', color:'#bbb', marginBottom:8, textTransform:'uppercase', letterSpacing:0.8 },
  barcodeBox: { backgroundColor:'#f5f5f3', borderRadius:12, padding:14, marginBottom:18 },
  barcodeVal: { fontFamily:'monospace', fontSize:16, fontWeight:'700', color:'#1a1a18' },
  input: { backgroundColor:'#f5f5f3', borderRadius:12, padding:14, fontSize:16, color:'#1a1a18', marginBottom:18 },
  typeGrid: { flexDirection:'row', flexWrap:'wrap', gap:10, marginBottom:18 },
  typeBtn: { width:(SCREEN_W-48-10)/2, paddingVertical:14, borderRadius:14, borderWidth:1.5, borderColor:'#e8e8e8', alignItems:'center', gap:6 },
  typeBtnIcon: { fontSize:22 },
  typeBtnTxt: { fontSize:14, fontWeight:'700', color:'#bbb' },
  qtyRow: { flexDirection:'row', alignItems:'center', justifyContent:'center', gap:24, marginBottom:24 },
  qtyBtn: { width:48, height:48, borderRadius:24, borderWidth:1, borderColor:'#e8e8e8', backgroundColor:'#f5f5f3', alignItems:'center', justifyContent:'center' },
  qtyBtnTxt: { fontSize:26, color:'#1a1a18', lineHeight:30 },
  qtyVal: { fontSize:36, fontWeight:'800', minWidth:64, textAlign:'center', color:'#1a1a18' },
  submitBtn: { backgroundColor:TEAL, borderRadius:14, padding:17, alignItems:'center', marginBottom:10 },
  submitTxt: { color:'#fff', fontSize:17, fontWeight:'800' },
  cancelBtn: { borderRadius:14, padding:15, alignItems:'center' },
  cancelTxt: { color:'#bbb', fontSize:15, fontWeight:'500' },
});
