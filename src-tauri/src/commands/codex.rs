use std::collections::HashMap;
use std::process::Stdio;
use std::sync::Mutex;
use tauri::State;
use tokio::process::Command;

/// One Codex app-server process per session.
pub struct CodexProcesses(pub Mutex<HashMap<String, (u32, u16)>>);
// Store (pid, port) — not Child, to avoid holding Child across await

fn find_free_port() -> u16 {
    let listener = std::net::TcpListener::bind("127.0.0.1:0").expect("bind failed");
    listener.local_addr().unwrap().port()
}

#[tauri::command]
pub async fn check_codex_path(path: Option<String>) -> Result<String, String> {
    let bin = path.as_deref().filter(|s| !s.is_empty()).unwrap_or("codex");
    let output = Command::new(bin)
        .arg("--version")
        .output()
        .await
        .map_err(|e| format!("Could not run `{bin}`: {e}"))?;
    if output.status.success() {
        let version = String::from_utf8_lossy(&output.stdout).trim().to_string();
        Ok(if version.is_empty() { format!("{bin} (ok)") } else { version })
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        Err(if stderr.is_empty() { format!("{bin} exited with status {}", output.status) } else { stderr })
    }
}

#[tauri::command]
pub async fn start_codex_server(
    session_id: String,
    project_path: String,
    codex_path: Option<String>,
    processes: State<'_, CodexProcesses>,
) -> Result<u16, String> {
    // Check if already running (drop guard immediately)
    {
        let map = processes.0.lock().map_err(|e| e.to_string())?;
        if let Some((_, port)) = map.get(&session_id) {
            return Ok(*port);
        }
    }

    let port = find_free_port();
    let addr = format!("ws://127.0.0.1:{port}");
    let bin = codex_path.as_deref().filter(|s| !s.is_empty()).unwrap_or("codex");

    eprintln!(
        "[actly/codex] starting session={} bin={} cwd={} listen={}",
        session_id, bin, project_path, addr
    );

    let child = Command::new(bin)
        .arg("app-server")
        .arg("--listen")
        .arg(&addr)
        .current_dir(&project_path)
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit())
        .spawn()
        .map_err(|e| format!("Failed to start codex app-server: {e}\nMake sure `codex` CLI is installed and in PATH."))?;

    let pid = child.id().unwrap_or(0);

    eprintln!(
        "[actly/codex] started session={} pid={} port={}",
        session_id, pid, port
    );

    // Store pid+port (release mutex before await)
    {
        let mut map = processes.0.lock().map_err(|e| e.to_string())?;
        map.insert(session_id, (pid, port));
    }

    // Brief wait for server to start
    tokio::time::sleep(std::time::Duration::from_millis(500)).await;

    Ok(port)
}

#[tauri::command]
pub async fn stop_codex_server(
    session_id: String,
    processes: State<'_, CodexProcesses>,
) -> Result<(), String> {
    let pid = {
        let mut map = processes.0.lock().map_err(|e| e.to_string())?;
        map.remove(&session_id).map(|(pid, _)| pid)
    };

    if let Some(pid) = pid {
        if pid > 0 {
            eprintln!(
                "[actly/codex] stopping session={} pid={}",
                session_id, pid
            );
            // Kill by PID — avoids holding Child across await
            let _ = Command::new("kill")
                .arg("-9")
                .arg(pid.to_string())
                .spawn();
        }
    }

    Ok(())
}

#[tauri::command]
pub fn get_codex_port(
    session_id: String,
    processes: State<'_, CodexProcesses>,
) -> Result<Option<u16>, String> {
    let map = processes.0.lock().map_err(|e| e.to_string())?;
    Ok(map.get(&session_id).map(|(_, port)| *port))
}

#[tauri::command]
pub fn debug_log(message: String) -> Result<(), String> {
    eprintln!("[actly/frontend] {}", message);
    Ok(())
}
