fn main() {
    println!("cargo:rerun-if-env-changed=PROCESS_SERVER_URL");
    let value = std::env::var("PROCESS_SERVER_URL")
        .expect("Use npm run dev/build with PROCESS_SERVER_URL set");
    assert!(!value.contains(['\n', '\r']), "Invalid server URL");
    println!("cargo:rustc-env=PROCESS_SERVER_URL={value}");
    tauri_build::build();
}
