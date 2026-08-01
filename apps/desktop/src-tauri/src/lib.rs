//! Vast desktop shell (Tauri 2) — sidecar lifecycle skeleton.
//!
//! Production path spawns `vast-server` on 127.0.0.1 only.
//! Dev path uses Vite `devUrl` with a separately running API.

use std::net::TcpListener;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::thread;
use std::time::{Duration, Instant};
use tauri::Manager;

struct SidecarState(Mutex<Option<Child>>);

fn pick_port() -> u16 {
    TcpListener::bind("127.0.0.1:0")
        .expect("bind ephemeral")
        .local_addr()
        .expect("local_addr")
        .port()
}

fn data_dir() -> std::path::PathBuf {
    if let Ok(p) = std::env::var("VAST_DATA_DIR") {
        return std::path::PathBuf::from(p);
    }
    let home = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .unwrap_or_else(|_| ".".into());
    #[cfg(target_os = "macos")]
    {
        return std::path::PathBuf::from(home).join("Library/Application Support/Vast");
    }
    #[cfg(target_os = "windows")]
    {
        let base = std::env::var("APPDATA").unwrap_or(home);
        return std::path::PathBuf::from(base).join("Vast");
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        std::path::PathBuf::from(home).join(".local/share/vast")
    }
}

fn wait_health(port: u16, timeout: Duration) -> bool {
    let url = format!("http://127.0.0.1:{port}/api/health");
    let start = Instant::now();
    while start.elapsed() < timeout {
        if let Ok(output) = Command::new("curl").args(["-fsS", &url]).output() {
            if output.status.success() {
                let body = String::from_utf8_lossy(&output.stdout);
                if body.contains("ok") {
                    return true;
                }
            }
        }
        thread::sleep(Duration::from_millis(150));
    }
    false
}

fn spawn_sidecar(port: u16, data: &std::path::Path) -> Option<Child> {
    let _ = std::fs::create_dir_all(data);
    let candidates = [
        std::env::current_exe()
            .ok()
            .and_then(|p| p.parent().map(|d| d.join("vast-server"))),
        Some(std::path::PathBuf::from("vast-server")),
    ];
    for cand in candidates.into_iter().flatten() {
        let child = Command::new(&cand)
            .env("PORT", port.to_string())
            .env("VAST_BIND", "127.0.0.1")
            .env("VAST_RUNTIME", "desktop")
            .env("VAST_AUTH_MODE", "none")
            .env("VAST_DATA_DIR", data)
            .env(
                "VAST_SECRET_KEY",
                std::env::var("VAST_SECRET_KEY")
                    .unwrap_or_else(|_| "desktop-dev-secret-change-me".into()),
            )
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn();
        if let Ok(c) = child {
            return Some(c);
        }
    }
    None
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let port = pick_port();
    let data = data_dir();
    let child = spawn_sidecar(port, &data);
    if child.is_some() {
        let _ = wait_health(port, Duration::from_secs(10));
    }
    let state = SidecarState(Mutex::new(child));

    tauri::Builder::default()
        .manage(state)
        .setup(move |_app| {
            let _ = port;
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                if let Some(state) = window.try_state::<SidecarState>() {
                    if let Ok(mut guard) = state.0.lock() {
                        if let Some(mut child) = guard.take() {
                            let _ = child.kill();
                            let _ = child.wait();
                        }
                    }
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running Vast desktop");
}
