use serde::Serialize;
use std::collections::HashMap;
use std::ffi::CString;
use std::path::Path;
use std::ptr;
use std::sync::Mutex;
use tauri::{command, AppHandle, Emitter, Manager, State};

#[cfg(unix)]
use std::os::fd::RawFd;

#[cfg(not(unix))]
type RawFd = i32;

pub struct TerminalSessions(pub Mutex<HashMap<String, TerminalSession>>);

pub struct TerminalSession {
    pub master_fd: RawFd,
    pub pid: i32,
}

#[derive(Clone, Serialize)]
struct TerminalDataEvent {
    session_id: String,
    data: String,
}

#[derive(Clone, Serialize)]
struct TerminalExitEvent {
    session_id: String,
    code: i32,
}

#[command]
pub fn start_terminal_session(
    app: AppHandle,
    sessions: State<TerminalSessions>,
    session_id: String,
    cwd: String,
    cols: u16,
    rows: u16,
    command: Option<String>,
    args: Option<Vec<String>>,
) -> Result<(), String> {
    stop_terminal_session(session_id.clone(), sessions.clone())?;

    let (master_fd, pid) = spawn_terminal_process(&cwd, cols, rows, command, args)?;
    {
        let mut guard = sessions.0.lock().map_err(|e| e.to_string())?;
        guard.insert(
            session_id.clone(),
            TerminalSession {
                master_fd,
                pid,
            },
        );
    }

    spawn_terminal_reader(app, session_id, master_fd, pid);
    Ok(())
}

#[command]
pub fn stop_terminal_session(
    session_id: String,
    sessions: State<TerminalSessions>,
) -> Result<(), String> {
    let removed = {
        let mut guard = sessions.0.lock().map_err(|e| e.to_string())?;
        guard.remove(&session_id)
    };

    if let Some(session) = removed {
        #[cfg(unix)]
        unsafe {
            libc::kill(session.pid, libc::SIGKILL);
            libc::close(session.master_fd);
        }
    }

    Ok(())
}

#[command]
pub fn write_terminal_session(
    session_id: String,
    data: String,
    sessions: State<TerminalSessions>,
) -> Result<(), String> {
    let master_fd = {
        let guard = sessions.0.lock().map_err(|e| e.to_string())?;
        guard
            .get(&session_id)
            .map(|session| session.master_fd)
            .ok_or_else(|| "Terminal session not found".to_string())?
    };

    write_all(master_fd, data.as_bytes())
}

#[command]
pub fn resize_terminal_session(
    session_id: String,
    cols: u16,
    rows: u16,
    sessions: State<TerminalSessions>,
) -> Result<(), String> {
    let master_fd = {
        let guard = sessions.0.lock().map_err(|e| e.to_string())?;
        guard
            .get(&session_id)
            .map(|session| session.master_fd)
            .ok_or_else(|| "Terminal session not found".to_string())?
    };

    resize_pty(master_fd, cols, rows)
}

#[cfg(unix)]
fn spawn_terminal_process(
    cwd: &str,
    cols: u16,
    rows: u16,
    command: Option<String>,
    args: Option<Vec<String>>,
) -> Result<(RawFd, i32), String> {
    let mut master_fd: RawFd = -1;
    let mut winsize = libc::winsize {
        ws_row: rows.max(1),
        ws_col: cols.max(1),
        ws_xpixel: 0,
        ws_ypixel: 0,
    };

    let pid = unsafe {
        libc::forkpty(
            &mut master_fd,
            ptr::null_mut(),
            ptr::null_mut(),
            &mut winsize,
        )
    };
    if pid < 0 {
        return Err(std::io::Error::last_os_error().to_string());
    }

    if pid == 0 {
        run_terminal_process(cwd, command, args);
    }

    Ok((master_fd, pid))
}

#[cfg(not(unix))]
fn spawn_terminal_process(
    _cwd: &str,
    _cols: u16,
    _rows: u16,
    _command: Option<String>,
    _args: Option<Vec<String>>,
) -> Result<(RawFd, i32), String> {
    Err("Interactive terminal is only supported on Unix builds right now".to_string())
}

#[cfg(unix)]
fn run_terminal_process(cwd: &str, command: Option<String>, args: Option<Vec<String>>) -> ! {
    if let Ok(cwd_cstr) = CString::new(cwd) {
        unsafe {
            libc::chdir(cwd_cstr.as_ptr());
        }
    }

    set_env("TERM", "xterm-256color");
    set_env("COLORTERM", "truecolor");
    set_env("TERM_PROGRAM", "Actly");
    set_env(
        "HISTFILE",
        &std::env::temp_dir()
            .join("actly-shell-history")
            .to_string_lossy(),
    );

    let (program_path, argv_values) = match command {
        Some(command) => {
            let (shell, shell_args) = resolve_command_shell(command, args.unwrap_or_default());
            let mut values = Vec::with_capacity(1 + shell_args.len());
            values.push(shell.clone());
            values.extend(shell_args);
            (shell, values)
        }
        None => {
            let (shell, shell_args) = resolve_shell_command();
            let mut values = Vec::with_capacity(1 + shell_args.len());
            values.push(shell.clone());
            values.extend(shell_args);
            (shell, values)
        }
    };

    let program =
        CString::new(program_path.clone()).expect("terminal program should not contain null bytes");
    let arg_values = argv_values
        .iter()
        .map(|arg| CString::new(arg.as_str()).expect("shell arg should not contain null bytes"))
        .collect::<Vec<_>>();

    let mut argv = Vec::with_capacity(arg_values.len() + 1);
    for arg in &arg_values {
        argv.push(arg.as_ptr());
    }
    argv.push(ptr::null());

    unsafe {
        libc::execvp(program.as_ptr(), argv.as_ptr());
        libc::perror(c"execvp".as_ptr());
        libc::_exit(1);
    }
}

#[cfg(unix)]
fn resolve_shell_command() -> (String, Vec<String>) {
    let shell = std::env::var("SHELL")
        .ok()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| "/bin/zsh".to_string());
    let shell_name = Path::new(&shell)
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or_default();

    let args = match shell_name {
        "zsh" => vec!["-f".to_string(), "-i".to_string()],
        "bash" => vec![
            "--noprofile".to_string(),
            "--norc".to_string(),
            "-i".to_string(),
        ],
        "fish" => vec!["-i".to_string()],
        _ => vec!["-i".to_string()],
    };

    (shell, args)
}

#[cfg(unix)]
fn resolve_command_shell(command: String, args: Vec<String>) -> (String, Vec<String>) {
    let shell = std::env::var("SHELL")
        .ok()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| "/bin/zsh".to_string());

    let command_line = std::iter::once(command)
        .chain(args)
        .map(|part| shell_escape(&part))
        .collect::<Vec<_>>()
        .join(" ");

    (shell, vec!["-l".to_string(), "-c".to_string(), command_line])
}

#[cfg(unix)]
fn shell_escape(value: &str) -> String {
    if value.is_empty() {
        return "''".to_string();
    }

    let escaped = value.replace('\'', r#"'\''"#);
    format!("'{escaped}'")
}

#[cfg(unix)]
fn set_env(name: &str, value: &str) {
    let Ok(name_cstr) = CString::new(name) else {
        return;
    };
    let Ok(value_cstr) = CString::new(value) else {
        return;
    };

    unsafe {
        libc::setenv(name_cstr.as_ptr(), value_cstr.as_ptr(), 1);
    }
}

#[cfg(unix)]
fn write_all(master_fd: RawFd, mut bytes: &[u8]) -> Result<(), String> {
    while !bytes.is_empty() {
        let written = unsafe { libc::write(master_fd, bytes.as_ptr().cast(), bytes.len()) };
        if written < 0 {
            let error = std::io::Error::last_os_error();
            if error.kind() == std::io::ErrorKind::Interrupted {
                continue;
            }
            return Err(error.to_string());
        }
        bytes = &bytes[written as usize..];
    }

    Ok(())
}

#[cfg(not(unix))]
fn write_all(_master_fd: RawFd, _bytes: &[u8]) -> Result<(), String> {
    Err("Interactive terminal is only supported on Unix builds right now".to_string())
}

#[cfg(unix)]
fn resize_pty(master_fd: RawFd, cols: u16, rows: u16) -> Result<(), String> {
    let winsize = libc::winsize {
        ws_row: rows.max(1),
        ws_col: cols.max(1),
        ws_xpixel: 0,
        ws_ypixel: 0,
    };
    let result = unsafe { libc::ioctl(master_fd, libc::TIOCSWINSZ, &winsize) };
    if result == 0 {
        Ok(())
    } else {
        Err(std::io::Error::last_os_error().to_string())
    }
}

#[cfg(not(unix))]
fn resize_pty(_master_fd: RawFd, _cols: u16, _rows: u16) -> Result<(), String> {
    Err("Interactive terminal is only supported on Unix builds right now".to_string())
}

#[cfg(unix)]
fn spawn_terminal_reader(app: AppHandle, session_id: String, master_fd: RawFd, pid: i32) {
    let reader_fd = unsafe { libc::dup(master_fd) };
    if reader_fd < 0 {
        let _ = app.emit(
            "terminal:exit",
            TerminalExitEvent {
                session_id,
                code: -1,
            },
        );
        return;
    }

    std::thread::spawn(move || {
        let mut buffer = [0u8; 4096];

        loop {
            let read = unsafe { libc::read(reader_fd, buffer.as_mut_ptr().cast(), buffer.len()) };
            if read == 0 {
                break;
            }
            if read < 0 {
                let error = std::io::Error::last_os_error();
                if error.kind() == std::io::ErrorKind::Interrupted {
                    continue;
                }
                break;
            }

            let data = String::from_utf8_lossy(&buffer[..read as usize]).into_owned();
            let _ = app.emit(
                "terminal:data",
                TerminalDataEvent {
                    session_id: session_id.clone(),
                    data,
                },
            );
        }

        unsafe {
            libc::close(reader_fd);
        }

        let code = wait_for_child(pid);
        cleanup_terminal_session(&app, &session_id, pid);
        let _ = app.emit("terminal:exit", TerminalExitEvent { session_id, code });
    });
}

#[cfg(not(unix))]
fn spawn_terminal_reader(_app: AppHandle, _session_id: String, _master_fd: RawFd, _pid: i32) {}

#[cfg(unix)]
fn wait_for_child(pid: i32) -> i32 {
    let mut status = 0;
    let result = unsafe { libc::waitpid(pid, &mut status, 0) };
    if result < 0 {
        return -1;
    }
    if libc::WIFEXITED(status) {
        libc::WEXITSTATUS(status)
    } else if libc::WIFSIGNALED(status) {
        128 + libc::WTERMSIG(status)
    } else {
        -1
    }
}

#[cfg(not(unix))]
fn wait_for_child(_pid: i32) -> i32 {
    -1
}

fn cleanup_terminal_session(app: &AppHandle, session_id: &str, pid: i32) {
    let state = app.state::<TerminalSessions>();
    let removed = {
        let mut guard = match state.0.lock() {
            Ok(guard) => guard,
            Err(_) => return,
        };

        match guard.get(session_id) {
            Some(session) if session.pid == pid => guard.remove(session_id),
            _ => None,
        }
    };

    #[cfg(unix)]
    if let Some(session) = removed {
        unsafe {
            libc::close(session.master_fd);
        }
    }
}
