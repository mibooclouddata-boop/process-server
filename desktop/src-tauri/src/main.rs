#![windows_subsystem = "windows"]
use tauri::{ipc::CapabilityBuilder, Listener, Manager, Webview, WebviewBuilder, WebviewUrl, WindowBuilder, LogicalPosition, LogicalSize, Rect};
use std::sync::{Arc, Mutex, atomic::{AtomicBool, Ordering}};
mod updates;
#[cfg(windows)]
mod taskbar;

fn sync_zoom(content: &Webview, factor: f64) {
    let _ = content.eval(format!("window.__processZoom={factor};document.documentElement?.style.setProperty('--desktop-zoom','{factor}');window.dispatchEvent(new Event('process-zoom'));"));
}

fn connect(content: Webview, chrome: Webview, server: tauri::Url, busy: Arc<AtomicBool>) {
    if busy.swap(true, Ordering::SeqCst) { return; }
    std::thread::spawn(move || {
        let result = reqwest::blocking::Client::builder()
            .timeout(std::time::Duration::from_secs(10))
            .redirect(reqwest::redirect::Policy::none())
            .build().and_then(|client| client.head(server.clone()).send());
        let status = if result.is_ok_and(|response| !response.status().is_server_error()) {
            if content.navigate(server).is_ok() { "Process ERP" } else { "연결 실패 · 다시 연결을 눌러주세요" }
        } else { "연결 실패 · 다시 연결을 눌러주세요" };
        let encoded = serde_json::to_string(status).expect("status string");
        if status != "Process ERP" {
            let _ = content.eval(format!("(() => {{ const el=document.getElementById('connection-status'); if(el) el.textContent={encoded}; window.renderUpdate?.({{state:'error',message:{encoded}}}); }})();"));
        }
        let _ = chrome.eval(format!("window.__processConnectionStatus={encoded};window.dispatchEvent(new Event('process-connection-status'));"));
        busy.store(false, Ordering::SeqCst);
    });
}

fn main() {
    let configured = if cfg!(debug_assertions) {
        std::env::var("PROCESS_SERVER_URL").unwrap_or_else(|_| env!("PROCESS_SERVER_URL").into())
    } else { env!("PROCESS_SERVER_URL").into() };
    let server: tauri::Url = configured.parse().expect("Invalid server URL");
    let loopback = matches!(server.host_str(), Some("localhost" | "127.0.0.1" | "[::1]"));
    assert!(server.scheme() == "https" || (cfg!(debug_assertions) && loopback && server.scheme() == "http"));
    assert!(server.username().is_empty() && server.password().is_none() && server.query().is_none() && server.fragment().is_none());
    tauri::Builder::default().plugin(tauri_plugin_updater::Builder::new().build()).setup(move |app| {
        // Bundled chrome handles controls; the ERP only gets window dragging.
        app.add_capability(CapabilityBuilder::new("desktop-window-controls")
            .webview("titlebar")
            .permission("core:window:allow-minimize")
            .permission("core:window:allow-toggle-maximize")
            .permission("core:window:allow-is-maximized")
            .permission("core:window:allow-start-dragging")
            .permission("core:window:allow-close")
            .permission("core:event:allow-emit"))?;
        app.add_capability(CapabilityBuilder::new("local-startup-update")
            .webview("erp").permission("core:event:allow-emit"))?;
        app.add_capability(CapabilityBuilder::new("erp-header-drag")
            .webview("erp").local(false)
            .remote(format!("{}/*", server.origin().ascii_serialization()))
            .permission("core:window:allow-start-dragging"))?;
        let window = WindowBuilder::new(app, "main")
            .icon(tauri::include_image!("icons/icon.png"))?
            .title("Process ERP").decorations(false).transparent(true)
            // Windows otherwise adds a white outline to undecorated windows.
            .shadow(false).inner_size(1440.0, 960.0).min_inner_size(1000.0, 700.0).build()?;
        #[cfg(windows)]
        taskbar::set_icon(&window)?;
        let origin = server.origin();
        let allowed = Arc::new(AtomicBool::new(false));
        let navigation_allowed = allowed.clone();
        let zoom = Arc::new(Mutex::new(1.0_f64));
        let load_zoom = zoom.clone();
        let content = window.add_child(
            WebviewBuilder::new("erp", WebviewUrl::App("index.html".into())).transparent(true).initialization_script_for_all_frames(include_str!("../../erp-chrome-spacing.js"))
                .on_page_load(move |webview, _| {
                    let maximized = webview.window().is_maximized().unwrap_or(false);
                    let _ = webview.eval(format!("document.documentElement?.classList.toggle('process-desktop-maximized',{maximized});"));
                    let factor = *load_zoom.lock().expect("zoom state");
                    let _ = webview.set_zoom(factor);
                    sync_zoom(&webview, factor);
                })
                .on_navigation(move |url| (navigation_allowed.load(Ordering::SeqCst) && url.origin() == origin) || matches!(url.as_str(), "http://tauri.localhost/" | "http://tauri.localhost/index.html" | "tauri://localhost/" | "tauri://localhost/index.html"))
                .on_new_window(|_, _| tauri::webview::NewWindowResponse::Deny),
            LogicalPosition::new(0.0, 0.0), LogicalSize::new(1440.0, 960.0))?;
        let zoom_content = content.clone();
        app.listen("desktop-zoom", move |event| {
            if let Ok(factor) = serde_json::from_str::<f64>(event.payload()) {
                if [0.75,0.9,1.0,1.1,1.25,1.5,1.75,2.0].contains(&factor) && zoom_content.set_zoom(factor).is_ok() {
                    *zoom.lock().expect("zoom state") = factor;
                    sync_zoom(&zoom_content, factor);
                }
            }
        });
        let chrome = window.add_child(
            WebviewBuilder::new("titlebar", WebviewUrl::App("titlebar.html".into()))
                .transparent(true).initialization_script(include_str!("../../titlebar.js"))
                .on_navigation(|url| matches!(url.as_str(), "http://tauri.localhost/titlebar.html" | "tauri://localhost/titlebar.html"))
                .on_new_window(|_, _| tauri::webview::NewWindowResponse::Deny),
            LogicalPosition::new(1192.0, 18.0), LogicalSize::new(232.0, 32.0))?;
        let resize_window = window.clone();
        let resize_chrome = chrome.clone();
        let resize_content = content.clone();
        window.on_window_event(move |event| {
            if let tauri::WindowEvent::Resized(size) = event {
                let logical = size.to_logical::<f64>(resize_window.scale_factor().unwrap_or(1.0));
                let _ = resize_chrome.set_bounds(Rect { position: LogicalPosition::new((logical.width - 248.0).max(0.0), 18.0).into(), size: LogicalSize::new(232.0, 32.0).into() });
                let _ = resize_content.set_bounds(Rect { position: LogicalPosition::new(0.0, 0.0).into(), size: LogicalSize::new(logical.width, logical.height).into() });
                let maximized = resize_window.is_maximized().unwrap_or(false);
                let _ = resize_chrome.eval("window.dispatchEvent(new Event('process-window-state'));".to_string());
                let _ = resize_content.eval(format!("document.documentElement?.classList.toggle('process-desktop-maximized',{maximized});"));
            }
        });
        let busy = Arc::new(AtomicBool::new(false));
        let retry_content = content.clone();
        let retry_chrome = chrome.clone();
        let retry_server = server.clone();
        let retry_busy = busy.clone();
        let retry_allowed = allowed.clone();
        app.listen("desktop-reconnect", move |_| {
            if retry_allowed.load(Ordering::SeqCst) {
                connect(retry_content.clone(), retry_chrome.clone(), retry_server.clone(), retry_busy.clone());
            }
        });
        let update_content = content.clone();
        updates::setup(app.handle(), content.clone(), allowed, move || {
            connect(update_content.clone(), chrome.clone(), server.clone(), busy.clone());
        });
        // Reload after listeners exist: the first local page may finish loading during setup.
        content.navigate(tauri::Url::parse("http://tauri.localhost/index.html")?)?;
        Ok(())
    }).run(tauri::generate_context!()).expect("Failed to run Process ERP");
}
