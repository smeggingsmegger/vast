//! Vast desktop shell (Tauri 2).
//!
//! Production: spawns the bundled Node sidecar (API + SPA) on 127.0.0.1,
//! waits for /api/health, then navigates the WebView to that origin so
//! relative `/api/*` calls work without a separate server process.

use std::fs;
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::thread;
use std::time::{Duration, Instant};

use tauri::{Manager, RunEvent, WindowEvent};
use url::Url;

struct SidecarState(Mutex<Option<Child>>);

fn pick_port() -> u16 {
    TcpListener::bind("127.0.0.1:0")
        .expect("bind ephemeral port")
        .local_addr()
        .expect("local_addr")
        .port()
}

fn data_dir() -> PathBuf {
    if let Ok(p) = std::env::var("VAST_DATA_DIR") {
        return PathBuf::from(p);
    }
    let home = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .unwrap_or_else(|_| ".".into());
    #[cfg(target_os = "macos")]
    {
        return PathBuf::from(home).join("Library/Application Support/Vast");
    }
    #[cfg(target_os = "windows")]
    {
        let base = std::env::var("APPDATA").unwrap_or(home);
        return PathBuf::from(base).join("Vast");
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        PathBuf::from(home).join(".local/share/vast")
    }
}

/// Persist a secret key so encrypted connection URIs survive restarts.
fn ensure_secret_key(data: &Path) -> String {
    let path = data.join("secret.key");
    if let Ok(existing) = fs::read_to_string(&path) {
        let t = existing.trim().to_string();
        if t.len() >= 16 {
            return t;
        }
    }
    let key = format!(
        "vast-desktop-{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0)
    );
    let _ = fs::write(&path, &key);
    key
}

fn wait_health(port: u16, timeout: Duration) -> bool {
    let addr = format!("127.0.0.1:{port}");
    let start = Instant::now();
    while start.elapsed() < timeout {
        if let Ok(mut stream) =
            TcpStream::connect_timeout(&addr.parse().unwrap(), Duration::from_millis(200))
        {
            let _ = stream.set_read_timeout(Some(Duration::from_millis(400)));
            let _ = stream.set_write_timeout(Some(Duration::from_millis(400)));
            let req = format!(
                "GET /api/health HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nConnection: close\r\n\r\n"
            );
            if stream.write_all(req.as_bytes()).is_ok() {
                let mut buf = Vec::new();
                let _ = stream.read_to_end(&mut buf);
                let body = String::from_utf8_lossy(&buf);
                if body.contains("\"status\"") && body.contains("ok") {
                    return true;
                }
            }
        }
        thread::sleep(Duration::from_millis(120));
    }
    false
}

/// Locate packaged sidecar directory (dev + release layouts).
fn find_sidecar_dir(resource_dir: &Path) -> Option<PathBuf> {
    // Tauri nests globs under Resources/resources/… when paths start with "resources/"
    let candidates = [
        resource_dir.join("resources").join("sidecar"),
        resource_dir.join("sidecar"),
        // Dev: monorepo path relative to CARGO_MANIFEST_DIR
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("resources/sidecar"),
        // Dev: cwd when running `tauri dev` from apps/desktop
        PathBuf::from("src-tauri/resources/sidecar"),
        PathBuf::from("resources/sidecar"),
    ];
    for c in candidates {
        if c.join("server/dist/index.js").is_file() {
            eprintln!("[vast] sidecar dir: {}", c.display());
            return Some(c);
        }
    }
    None
}

fn spawn_sidecar(port: u16, data: &Path, resource_dir: &Path) -> Result<Child, String> {
    let _ = fs::create_dir_all(data);
    let secret = ensure_secret_key(data);

    let sidecar = find_sidecar_dir(resource_dir)
        .ok_or_else(|| {
            format!(
                "Sidecar not found under {}. Run: bash scripts/desktop-package-sidecar.sh",
                resource_dir.display()
            )
        })?;

    let web_dist = sidecar.join("web-dist");
    let server_entry = sidecar.join("server/dist/index.js");
    if !server_entry.is_file() {
        return Err(format!("Missing server entry: {}", server_entry.display()));
    }

    // Prefer bundled Node, then system node
    let node = {
        let bundled = if cfg!(windows) {
            sidecar.join("node/node.exe")
        } else {
            sidecar.join("node/bin/node")
        };
        if bundled.is_file() {
            bundled
        } else {
            PathBuf::from("node")
        }
    };

    let mut cmd = Command::new(&node);
    cmd.arg(&server_entry)
        .current_dir(sidecar.join("server"))
        .env("PORT", port.to_string())
        .env("VAST_BIND", "127.0.0.1")
        .env("VAST_RUNTIME", "desktop")
        .env("VAST_AUTH_MODE", "none")
        .env("VAST_DATA_DIR", data)
        .env("VAST_SECRET_KEY", secret)
        .env("NODE_ENV", "production")
        .env(
            "VAST_WEB_DIST",
            if web_dist.is_dir() {
                web_dist
            } else {
                PathBuf::from("")
            },
        )
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::piped());

    cmd.spawn()
        .map_err(|e| format!("Failed to start sidecar ({}): {e}", node.display()))
}

fn kill_sidecar(state: &SidecarState) {
    if let Ok(mut guard) = state.0.lock() {
        if let Some(mut child) = guard.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let port = pick_port();
    let data = data_dir();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(SidecarState(Mutex::new(None)))
        .setup(move |app| {
            let resource_dir = app
                .path()
                .resource_dir()
                .unwrap_or_else(|_| PathBuf::from(env!("CARGO_MANIFEST_DIR")));

            let window = app
                .get_webview_window("main")
                .expect("main window missing");

            // Hide until the API is up so users don't see a broken UI flash.
            let _ = window.hide();

            match spawn_sidecar(port, &data, &resource_dir) {
                Ok(child) => {
                    if let Ok(mut guard) = app.state::<SidecarState>().0.lock() {
                        *guard = Some(child);
                    }
                }
                Err(err) => {
                    eprintln!("[vast] {err}");
                    let html = format!(
                        "<!doctype html><meta charset=utf-8><title>Vast</title>\
                         <body style='font-family:system-ui;padding:2rem;background:#0c0c0f;color:#fafafa'>\
                         <h1>Could not start Vast server</h1>\
                         <p style='color:#a1a1aa'>{err}</p>\
                         <p>Run <code>bash scripts/desktop-package-sidecar.sh</code> then rebuild.</p>\
                         </body>"
                    );
                    let _ = window.show();
                    // Fallback: still show static frontendDist if present
                    let _ = window.eval(&format!(
                        "document.open();document.write({});document.close();",
                        serde_json::to_string(&html).unwrap_or_else(|_| "\"error\"".into())
                    ));
                    return Ok(());
                }
            }

            if !wait_health(port, Duration::from_secs(20)) {
                eprintln!("[vast] sidecar health check timed out on port {port}");
                let html = format!(
                    "<!doctype html><meta charset=utf-8><title>Vast</title>\
                     <body style='font-family:system-ui;padding:2rem;background:#0c0c0f;color:#fafafa'>\
                     <h1>Vast server did not become ready</h1>\
                     <p style='color:#a1a1aa'>Timed out waiting for http://127.0.0.1:{port}/api/health</p>\
                     </body>"
                );
                let _ = window.show();
                let _ = window.eval(&format!(
                    "document.open();document.write({});document.close();",
                    serde_json::to_string(&html).unwrap_or_else(|_| "\"error\"".into())
                ));
                return Ok(());
            }

            let url = Url::parse(&format!("http://127.0.0.1:{port}/"))
                .expect("valid localhost url");
            if let Err(e) = window.navigate(url) {
                eprintln!("[vast] navigate failed: {e}");
            }
            let _ = window.show();
            let _ = window.set_focus();
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { .. } = event {
                if let Some(state) = window.try_state::<SidecarState>() {
                    kill_sidecar(&state);
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building Vast desktop")
        .run(|app_handle, event| {
            if let RunEvent::Exit = event {
                if let Some(state) = app_handle.try_state::<SidecarState>() {
                    kill_sidecar(&state);
                }
            }
        });
}
