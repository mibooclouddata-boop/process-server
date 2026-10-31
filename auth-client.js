'use strict';
// Cookies remain HttpOnly. Only same-origin API writes receive the CSRF header.
(() => {
  const originalFetch = window.fetch.bind(window);
  const IDLE_MS = 4 * 60 * 60 * 1000;
  const ACTIVITY_KEY = 'lastUserActivityAt';
  const IDLE_EXPIRED = -1; // Zero is a normal logout; idle expiry needs an acknowledgement in every tab.
  let timer, publishTimer, stopped = false;
  function readActivity() {
    for (const storage of [localStorage, sessionStorage]) {
      try {
        const value = storage.getItem(ACTIVITY_KEY);
        if (value !== null && Number.isFinite(Number(value)) && Number(value) >= IDLE_EXPIRED) return Number(value);
      } catch {}
    }
    return null;
  }
  function writeActivity(value) {
    for (const storage of [localStorage, sessionStorage]) {
      try { storage.setItem(ACTIVITY_KEY, String(value)); } catch {}
    }
  }
  let lastActivity = readActivity() ?? Date.now();
  if (readActivity() === null) writeActivity(lastActivity);
  function invalidate(idle = false) {
    stopped = true;
    clearTimeout(timer);
    clearTimeout(publishTimer);
    writeActivity(idle ? IDLE_EXPIRED : 0);
    for (const storage of [localStorage, sessionStorage]) {
      try { storage.removeItem('currentUser'); } catch {}
    }
  }
  function redirect() {
    // Login transitions host the dashboard in a same-origin iframe.
    window.top.location.replace('/login.html');
  }
  let expiryNotice;
  function showExpiryNotice() {
    if (expiryNotice) return;
    const doc = window.top.document || document;
    const dialog = doc.createElement('dialog');
    expiryNotice = dialog;
    dialog.id = 'sessionExpiredDialog';
    dialog.setAttribute('aria-labelledby', 'sessionExpiredTitle');
    dialog.setAttribute('aria-describedby', 'sessionExpiredMessage');
    dialog.innerHTML = `<style>
      #sessionExpiredDialog{position:fixed;inset:0;margin:auto;box-sizing:border-box;width:min(340px,calc(100vw - 32px));height:fit-content;max-height:calc(100dvh - 32px);overflow:auto;padding:0;border:0;border-radius:18px;background:#fff;color:#191f28;font-family:'Pretendard Variable',Pretendard,'Malgun Gothic',sans-serif}
      #sessionExpiredDialog::backdrop{background:rgba(15,23,42,.28)}
      #sessionExpiredDialog h2{margin:0;padding:28px 24px 0;font-size:20px;font-weight:700;line-height:1.4;letter-spacing:-.03em;text-align:center}
      #sessionExpiredDialog p{margin:22px 24px 28px;font-size:14px;line-height:1.7;color:#4e5968;word-break:keep-all;text-align:center}
      #sessionExpiredDialog button{width:100%;min-height:54px;border:0;border-top:1px solid #e5e8eb;background:#f2f6fb;color:#004a93;font:inherit;font-size:15px;font-weight:750;cursor:pointer}
      #sessionExpiredDialog button:focus-visible{outline:2px solid #004a93;outline-offset:-4px}
      #sessionExpiredDialog button:hover{background:#e8f1fa}
    </style><h2 id="sessionExpiredTitle">자동 로그아웃</h2>
    <p id="sessionExpiredMessage">4시간 동안 활동이 없어 로그아웃되었습니다.</p>
    <button type="button" autofocus>확인</button>`;
    dialog.querySelector('button').onclick = redirect;
    dialog.addEventListener('cancel', event => { event.preventDefault(); redirect(); });
    doc.body.appendChild(dialog);
    dialog.showModal();
  }
  function expire(revoke = true, idle = revoke) {
    if (stopped) return;
    window.sessionIdleExpired = idle;
    invalidate(idle);
    document.documentElement.inert = true;
    if (!revoke) { if (idle) showExpiryNotice(); else redirect(); return; }
    // A stalled logout request must not prevent the user from acknowledging expiry.
    const fallback = setTimeout(showExpiryNotice, 2000);
    originalFetch('/api/logout', {
      method: 'POST', credentials: 'same-origin', keepalive: true,
      headers: {'X-Requested-With': 'process-server'}
    }).catch(() => {}).finally(() => { clearTimeout(fallback); showExpiryNotice(); });
  }
  function checkActivity() {
    if (stopped) return false;
    const shared = readActivity();
    if (shared === IDLE_EXPIRED) { expire(false, true); return false; }
    if (shared === 0) { expire(false); return false; }
    lastActivity = Math.max(lastActivity, shared ?? 0);
    if (Date.now() - lastActivity >= IDLE_MS) { expire(); return false; }
    return true;
  }
  function scheduleCheck() {
    if (checkActivity()) timer = setTimeout(scheduleCheck, IDLE_MS - (Date.now() - lastActivity));
  }
  function activity(event) {
    if (!event.isTrusted || !checkActivity()) return;
    lastActivity = Date.now();
    // Share the first input immediately so another tab cannot expire at the old deadline.
    if (!publishTimer) {
      writeActivity(lastActivity);
      publishTimer = setTimeout(() => {
        publishTimer = null;
        if (checkActivity()) writeActivity(lastActivity);
      }, 1000);
    }
  }
  for (const event of ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart', 'scroll']) {
    window.addEventListener(event, activity, {capture: true, passive: true});
  }
  window.addEventListener('storage', event => { if (event.key === ACTIVITY_KEY) checkActivity(); });
  window.addEventListener('pageshow', checkActivity);
  window.addEventListener('pagehide', () => { if (checkActivity()) writeActivity(lastActivity); });
  window.addEventListener('focus', checkActivity);
  document.addEventListener('visibilitychange', checkActivity);
  scheduleCheck();
  window.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url, window.location.href);
    const api = url.origin === window.location.origin && url.pathname.startsWith('/api/');
    if (api && !['/api/login', '/api/logout'].includes(url.pathname) && !checkActivity()) {
      throw new Error('Session expired after inactivity');
    }
    const method = (init.method || input.method || 'GET').toUpperCase();
    if (api && !['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      const headers = new Headers(init.headers || input.headers);
      headers.set('X-Requested-With', 'process-server');
      init = {...init, headers};
    }
    const response = await originalFetch(input, init);
    if (api && url.pathname === '/api/logout' && response.ok) invalidate();
    if (api && url.pathname === '/api/login' && response.ok) {
      stopped = false;
      window.sessionIdleExpired = false;
      lastActivity = Date.now();
      writeActivity(lastActivity);
      clearTimeout(timer);
      scheduleCheck();
    }
    if (api && response.status === 401 && url.pathname !== '/api/login' && !stopped) {
      invalidate();
      redirect();
    }
    return response;
  };
})();
