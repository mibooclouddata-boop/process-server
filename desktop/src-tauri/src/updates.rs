use std::sync::{Arc, Mutex, atomic::{AtomicBool, Ordering}};
use std::time::Duration;
use tauri::{AppHandle, Listener, Webview};
use tauri_plugin_updater::{Update, UpdaterExt};
use serde_json::json;

fn render(view: &Webview, value: serde_json::Value) {
    let _ = view.eval(format!("window.renderUpdate?.({value});"));
}

pub fn setup(app: &AppHandle, content: Webview, allowed: Arc<AtomicBool>, connect: impl Fn() + Send + Sync + 'static) {
    let pending: Arc<Mutex<Option<Update>>> = Arc::new(Mutex::new(None));
    let busy = Arc::new(AtomicBool::new(false));
    let connect = Arc::new(connect);
    let handle = app.clone();
    let view = content.clone();
    let check_pending = pending.clone();
    let check_busy = busy.clone();
    app.listen("desktop-update-check", move |_| {
        if allowed.load(Ordering::SeqCst) { connect(); return; }
        if check_busy.swap(true, Ordering::SeqCst) { return; }
        let (app, view, pending, busy, allowed) = (handle.clone(), view.clone(), check_pending.clone(), check_busy.clone(), allowed.clone());
        tauri::async_runtime::spawn(async move {
            render(&view, json!({"state":"checking"}));
            *pending.lock().unwrap() = None;
            let result = async {
                let mut builder = app.updater_builder().timeout(Duration::from_secs(20));
                // Test fixtures may replace only the endpoint in debug builds. Signing remains required.
                if cfg!(debug_assertions) {
                    if let Ok(endpoint) = std::env::var("PROCESS_UPDATE_URL") {
                        let url: tauri::Url = endpoint.parse()?;
                        if url.scheme() == "https" || (url.scheme() == "http" && matches!(url.host_str(),Some("localhost"|"127.0.0.1"|"[::1]"))) {
                            builder = builder.endpoints(vec![url])?;
                        } else { return Err(tauri_plugin_updater::Error::InsecureTransportProtocol); }
                    }
                }
                builder.build()?.check().await
            }.await;
            match result {
                Ok(Some(update)) => {
                    let message = json!({"state":"available","current":update.current_version,"version":update.version,"notes":update.body});
                    *pending.lock().unwrap() = Some(update);
                    busy.store(false,Ordering::SeqCst);
                    render(&view,message);
                    return;
                }
                Ok(None) => {
                    allowed.store(true,Ordering::SeqCst);
                    // The local cover decides whether a just-updated app waits for access.
                    render(&view,json!({"state":"ready"}));
                }
                Err(error) => {
                    eprintln!("Update check failed: {error}");
                    busy.store(false,Ordering::SeqCst);
                    render(&view,json!({"state":"error","message":"최신 버전을 확인하지 못했습니다. 인터넷 연결을 확인한 뒤 다시 시도해 주세요."}));
                    return;
                }
            }
            busy.store(false,Ordering::SeqCst);
        });
    });
    app.listen("desktop-update-install", move |_| {
        if busy.swap(true,Ordering::SeqCst) { return; }
        let update = pending.lock().unwrap().take();
        let Some(update) = update else { busy.store(false,Ordering::SeqCst); return; };
        let (view,busy) = (content.clone(),busy.clone());
        tauri::async_runtime::spawn(async move {
            render(&view,json!({"state":"downloading","downloaded":0}));
            let mut downloaded = 0_u64;
            let result = update.download(|chunk,total| {
                downloaded += chunk as u64;
                render(&view,json!({"state":"downloading","downloaded":downloaded,"total":total}));
            }, || {}).await;
            let result = match result {
                Ok(bytes) => {
                    render(&view,json!({"state":"installing"}));
                    update.install(bytes)
                }
                Err(error) => Err(error)
            };
            if let Err(error) = result {
                eprintln!("Update installation failed: {error}");
                busy.store(false,Ordering::SeqCst);
                render(&view,json!({"state":"error","message":"다운로드 또는 설치에 실패했습니다. 다시 시도해 주세요."}));
                return;
            }
            busy.store(false,Ordering::SeqCst);
        });
    });
}
