// Tauri's window icon sets ICON_SMALL only. Windows taskbar uses ICON_BIG.
// Load the current executable's bundled star resource instead of Explorer's cached icon.
use windows_sys::Win32::{System::LibraryLoader::GetModuleHandleW, UI::WindowsAndMessaging::{
    LoadImageW, SendMessageW, IMAGE_ICON, LR_SHARED, WM_SETICON, ICON_BIG,
}};

pub fn set_icon(window: &tauri::Window) -> Result<(), Box<dyn std::error::Error>> {
    set_big_icon(window.hwnd()?.0)
}

fn set_big_icon(hwnd: windows_sys::Win32::Foundation::HWND) -> Result<(), Box<dyn std::error::Error>> {
    // Resource 32512 is the application icon emitted by tauri-build.
    // LR_SHARED keeps the handle valid for the process lifetime; do not destroy it.
    unsafe {
        let module = GetModuleHandleW(std::ptr::null());
        if module.is_null() { return Err(std::io::Error::last_os_error().into()); }
        let icon = LoadImageW(module, 32512usize as *const u16, IMAGE_ICON, 48, 48, LR_SHARED);
        if icon.is_null() { return Err(std::io::Error::last_os_error().into()); }
        SendMessageW(hwnd, WM_SETICON, ICON_BIG as usize, icon as isize);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use windows_sys::Win32::UI::WindowsAndMessaging::{CreateWindowExW, DestroyWindow, WM_GETICON};

    #[test]
    fn sets_the_taskbar_icon_on_a_native_window() {
        unsafe {
            let class: Vec<u16> = "STATIC\0".encode_utf16().collect();
            let hwnd = CreateWindowExW(0, class.as_ptr(), std::ptr::null(), 0,
                0, 0, 32, 32, std::ptr::null_mut(), std::ptr::null_mut(),
                GetModuleHandleW(std::ptr::null()), std::ptr::null());
            assert!(!hwnd.is_null());
            let before = SendMessageW(hwnd, WM_GETICON, ICON_BIG as usize, 0);
            let result = set_big_icon(hwnd);
            let after = SendMessageW(hwnd, WM_GETICON, ICON_BIG as usize, 0);
            DestroyWindow(hwnd);
            assert_eq!(before, 0, "test window starts without a taskbar icon");
            result.expect("bundled icon must load");
            assert_ne!(after, 0, "Windows must retain the explicit taskbar icon");
        }
    }
}
