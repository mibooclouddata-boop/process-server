use std::{io::Write, path::Path};
use tauri::{Manager, Webview};
use tauri_plugin_dialog::DialogExt;

pub struct DownloadOrigin(pub tauri::Url);

fn validate(name: &str, bytes: &[u8]) -> Result<(), String> {
    let extension = Path::new(name).extension().and_then(|v| v.to_str()).unwrap_or("");
    if name.is_empty() || name.len() > 240 || name.chars().any(|c| c.is_control() || "<>:\"/\\|?*".contains(c))
        || !matches!(extension.to_ascii_lowercase().as_str(), "xls" | "xlsx") {
        return Err("올바른 Excel 파일 이름이 아닙니다.".into());
    }
    if bytes.is_empty() || bytes.len() > 20 * 1024 * 1024 {
        return Err("Excel 파일 크기가 허용 범위를 벗어났습니다. (최대 20MB)".into());
    }
    Ok(())
}

fn save(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
    let mut file = tempfile::NamedTempFile::new_in(path.parent().ok_or_else(|| std::io::Error::other("저장 폴더가 없습니다."))?)?;
    file.write_all(bytes)?;
    file.as_file().sync_all()?;
    // Replace only after all bytes have been written successfully.
    file.persist(path).map_err(|error| error.error)?;
    Ok(())
}

#[tauri::command]
pub async fn save_excel(app: tauri::AppHandle, webview: Webview, name: String, bytes: Vec<u8>) -> Result<Option<String>, String> {
    let url = webview.url().map_err(|e| e.to_string())?;
    if webview.label() != "erp" || url.origin() != app.state::<DownloadOrigin>().0.origin() {
        return Err("업무 시스템에서만 Excel을 저장할 수 있습니다.".into());
    }
    validate(&name, &bytes)?;
    let window = webview.window();
    tauri::async_runtime::spawn_blocking(move || {
        let extension = if name.to_ascii_lowercase().ends_with(".xlsx") { "xlsx" } else { "xls" };
        let selected = app.dialog().file().set_parent(&window).set_title("Excel 저장").set_file_name(&name)
            .add_filter("Excel", &[extension]).blocking_save_file();
        let Some(selected) = selected else { return Ok(None); };
        let path = selected.into_path().map_err(|e| e.to_string())?;
        save(&path, &bytes).map_err(|e| format!("파일을 저장할 수 없습니다: {e}"))?;
        Ok(Some(path.to_string_lossy().into_owned()))
    }).await.map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn validates_names_and_limits() {
        assert!(validate("AS접수목록_2026-11-14.xls", b"excel").is_ok());
        assert!(validate("report.XLSX", b"excel").is_ok());
        for name in ["../a.xls", "C:\\a.xls", "a.exe", "a\n.xls", "", "report.xls:stream"] {
            assert!(validate(name, b"excel").is_err(), "{name}");
        }
        assert!(validate("a.xls", b"").is_err());
        assert!(validate("a.xls", &vec![0; 20 * 1024 * 1024 + 1]).is_err());
    }
    #[test]
    fn writes_exact_bytes_and_preserves_existing_target_on_failure() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("장부.xls");
        let bytes = b"\xef\xbb\xbf<table>ledger</table>";
        save(&path, bytes).unwrap();
        assert_eq!(std::fs::read(&path).unwrap(), bytes);
        save(&path, b"replacement").unwrap();
        assert_eq!(std::fs::read(&path).unwrap(), b"replacement");
        let existing_directory = dir.path().join("existing.xls");
        std::fs::create_dir(&existing_directory).unwrap();
        assert!(save(&existing_directory, bytes).is_err());
        assert!(existing_directory.is_dir());
        assert_eq!(std::fs::read_dir(dir.path()).unwrap().count(), 2);
    }
}
