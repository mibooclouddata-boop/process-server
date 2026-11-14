(() => {
  // ERP gets only window dragging; all other window controls stay in the local overlay.
  const apply = () => {
    const background = getComputedStyle(document.body).background;
    const style = document.createElement('style');
    style.textContent = 'body #dashboard .app-header-tools{margin-right:calc(248px / var(--desktop-zoom,1))!important}' + (window.top === window.self ? `
      html{height:100%;background:transparent!important;clip-path:inset(0 round calc(var(--app-radius,26px) / var(--desktop-zoom,1)))}
      body{background:transparent!important;isolation:isolate}
      body::before{content:'';position:fixed;inset:0;z-index:-1;pointer-events:none;background:${background}}
      html.process-desktop-maximized{clip-path:none}
      html.process-desktop-maximized #dashboard{border-radius:0!important}
    ` : '');
    document.head.append(style);
    const syncZoom = () => {
      try {document.documentElement.style.setProperty('--desktop-zoom', String(window.top.__processZoom || 1));} catch {}
    };
    syncZoom();
    try {window.top.addEventListener('process-zoom', syncZoom);window.addEventListener('pagehide',()=>window.top.removeEventListener('process-zoom',syncZoom),{once:true});} catch {}
    document.addEventListener('mousedown', event => {
      if (event.button !== 0 || !event.target.closest('.app-topbar,.topbar')) return;
      if (event.target.closest('button,a,input,select,textarea,summary,[role="button"],[contenteditable]')) return;
      event.preventDefault();
      let api = window.__TAURI_INTERNALS__;
      if (!api) { try { api = window.top.__TAURI_INTERNALS__; } catch {} }
      api?.invoke('plugin:window|start_dragging', {label:'main'}).catch(console.error);
    });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', apply, {once:true}); else apply();
})();
