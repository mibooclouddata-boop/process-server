(() => {
  if (window.top !== window.self) return;
  const mount = () => {
    if (document.getElementById('process-window-controls')) return;
    const host = document.createElement('div');
    host.id = 'process-window-controls';
    host.innerHTML = `<div class="drag" title="드래그하여 창 이동 · 두 번 클릭하여 최대화" aria-label="창 이동"><svg viewBox="0 0 16 16"><path d="M5 3h1m4 0h1M5 8h1m4 0h1M5 13h1m4 0h1"/></svg></div>
      <select aria-label="화면 배율" title="화면 배율">${[75,90,100,110,125,150,175,200].map(value=>`<option value="${value}" ${value===100?'selected':''}>${value}%</option>`).join('')}</select>
      <button aria-label="다시 연결" title="다시 연결"><svg viewBox="0 0 12 12"><path d="M10 5a4 4 0 1 0 0 3M10 1v4H6"/></svg></button>
      <button aria-label="최소화" title="최소화"><svg viewBox="0 0 12 12"><path d="M1 6h10"/></svg></button>
      <button aria-label="최대화" title="최대화"><svg viewBox="0 0 12 12"><rect x="1.5" y="1.5" width="9" height="9"/></svg></button>
      <button class="close" aria-label="닫기" title="닫기"><svg viewBox="0 0 12 12"><path d="m1.5 1.5 9 9m0-9-9 9"/></svg></button>`;
    document.body.append(host);
    const invoke = name => window.__TAURI_INTERNALS__.invoke('plugin:window|' + name, {label:'main'});
    const buttons = host.querySelectorAll('button');
    const report = error => { buttons[0].title = '다시 연결 · 창 조작 실패'; console.error(error); };
    const zoom = host.querySelector('select');
    try { const saved=localStorage.getItem('erp-display-zoom'); if([...zoom.options].some(o=>o.value===saved))zoom.value=saved; } catch {}
    const applyZoom = async () => {
      try {
        await window.__TAURI_INTERNALS__.invoke('plugin:event|emit', {event:'desktop-zoom',payload:Number(zoom.value)/100});
        try {localStorage.setItem('erp-display-zoom',zoom.value);} catch {}
      } catch(error) { report(error); }
    };
    zoom.onchange = applyZoom;
    applyZoom();
    buttons[0].onclick = () => window.__TAURI_INTERNALS__.invoke('plugin:event|emit', {event:'desktop-reconnect',payload:null}).catch(report);
    window.addEventListener('process-connection-status', () => {
      buttons[0].title = window.__processConnectionStatus === 'MIPS' ? '다시 연결' : window.__processConnectionStatus;
    });
    buttons[1].onclick = () => invoke('minimize').catch(report);
    const update = async () => {
      const maximized = await invoke('is_maximized');
      const label = maximized ? '이전 크기로' : '최대화';
      buttons[2].setAttribute('aria-label', label); buttons[2].title = label;
    };
    const toggle = () => invoke('toggle_maximize').then(update).catch(report);
    buttons[2].onclick = toggle;
    buttons[3].onclick = () => invoke('close').catch(report);
    host.querySelector('.drag').onmousedown = event => {
      if (event.button !== 0) return;
      if (event.detail === 2) toggle(); else invoke('start_dragging').catch(report);
    };
    window.addEventListener('resize', () => update().catch(report));
    window.addEventListener('process-window-state', () => update().catch(report));
    update().catch(report);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, {once:true}); else mount();
})();
