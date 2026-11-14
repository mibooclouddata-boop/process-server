(() => {
  // Window controls stay in the local overlay; ERP only reports its workspace visibility.
  const apply = () => {
    const background = document.body.dataset.desktopStartup === 'true' ? 'var(--flow-shell,#e5eaf0)' : getComputedStyle(document.body).background;
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
    let workspaceActive=false;
    const syncWorkspace=()=>{
      if(window.top!==window.self){try{window.top.__mipsSyncWorkspace?.();}catch{}return;}
      const frame=document.getElementById('loginTransitionFrame');
      let doc=document,visible=true;
      if(frame){visible=frame.getAttribute('aria-hidden')==='false';try{doc=frame.contentDocument;}catch{doc=null;}}
      const dashboard=doc?.getElementById('dashboard');
      const active=!!(visible&&dashboard?.querySelector('.app-topbar')&&!dashboard.inert&&doc.defaultView.getComputedStyle(dashboard).display!=='none');
      if(active===workspaceActive)return;
      workspaceActive=active;
      window.__TAURI_INTERNALS__?.invoke('workspace_window',{active}).catch(console.error);
    };
    if(window.top===window.self)window.__mipsSyncWorkspace=syncWorkspace;
    const workspaceObserver=new MutationObserver(syncWorkspace);
    workspaceObserver.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['style','hidden','inert','aria-hidden','class']});
    window.addEventListener('pagehide',()=>workspaceObserver.disconnect(),{once:true});
    syncWorkspace();
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
