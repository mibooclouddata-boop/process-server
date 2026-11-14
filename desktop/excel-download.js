(() => {
 'use strict';
 if (window.__desktopExcelSave || !window.__TAURI_INTERNALS__) return;
 window.__desktopExcelSave = true;
 let busy = false;
 let status;
 function notify(message) {
  if (!status?.isConnected) {
   status = document.createElement('div');
   status.setAttribute('role', 'status');
   status.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:2147483647;max-width:min(520px,calc(100vw - 48px));padding:16px 20px;background:#172b3b;color:#fff;border:1px solid #526577;border-radius:8px;font:14px/1.6 sans-serif;overflow-wrap:anywhere;box-shadow:0 4px 20px #0003';
   (document.body || document.documentElement).append(status);
  }
  status.textContent = message;
 }
 document.addEventListener('click', async event => {
  const anchor = event.target.closest?.('a[download]');
  if (!anchor || !/\.xlsx?$/i.test(anchor.download) || !anchor.href.startsWith('blob:')) return;
  event.preventDefault();
  if (busy) return;
  busy = true;
  notify('Excel 저장 위치를 선택해 주세요.');
  try {
   // Read before the export caller revokes its temporary blob URL.
   const response = await fetch(anchor.href);
   const bytes = new Uint8Array(await response.arrayBuffer());
   if (bytes.length > 20 * 1024 * 1024) throw new Error('Excel 파일은 최대 20MB까지 저장할 수 있습니다.');
   const saved = await window.__TAURI_INTERNALS__.invoke('save_excel', {name: anchor.download, bytes: Array.from(bytes)});
   notify(saved ? `Excel을 저장했습니다. ${saved}` : 'Excel 저장을 취소했습니다.');
  } catch (error) {
   notify(`Excel을 저장하지 못했습니다. ${String(error?.message || error)} 다시 다운로드해 주세요.`);
  } finally { busy = false; }
 }, true);
})();
