use std::fs;
use std::path::{Path, Component};
use std::process::Command;
use serde::Serialize;

#[derive(Serialize)]
pub struct FsDirEntry {
    name: String,
    path: String,
    is_dir: bool,
}

fn is_path_safe(path: &str) -> bool {
    let p = Path::new(path);
    for component in p.components() {
        match component {
            Component::ParentDir | Component::RootDir | Component::Prefix(_) => return false,
            _ => continue,
        }
    }
    true
}

/// Check whether a path exists on disk.
#[tauri::command]
pub fn fs_exists(path: String) -> Result<bool, String> {
    if !is_path_safe(&path) {
        return Err("Unsafe path detected".to_string());
    }
    Path::new(&path).try_exists().map_err(|e| e.to_string())
}

/// Read the text content of a file.
#[tauri::command]
pub fn fs_read_text(path: String) -> Result<String, String> {
    if !is_path_safe(&path) {
        return Err("Unsafe path detected".to_string());
    }
    fs::read_to_string(&path).map_err(|e| e.to_string())
}

/// Write text to a file, creating it (and parent dirs) if necessary.
#[tauri::command]
pub fn fs_write_text(path: String, content: String) -> Result<(), String> {
    if !is_path_safe(&path) {
        return Err("Unsafe path detected".to_string());
    }
    if let Some(parent) = Path::new(&path).parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(&path, content).map_err(|e| e.to_string())
}

/// Create a directory (and all parents).
#[tauri::command]
pub fn fs_mkdir(path: String) -> Result<(), String> {
    if !is_path_safe(&path) {
        return Err("Unsafe path detected".to_string());
    }
    fs::create_dir_all(&path).map_err(|e| e.to_string())
}

/// List a directory's direct children.
#[tauri::command]
pub fn fs_list_dir(path: String) -> Result<Vec<FsDirEntry>, String> {
    if !is_path_safe(&path) {
        return Err("Unsafe path detected".to_string());
    }
    let entries = fs::read_dir(&path).map_err(|e| e.to_string())?;
    let mut result = Vec::new();

    for entry in entries {
        let entry = entry.map_err(|e| e.to_string())?;
        let file_type = entry.file_type().map_err(|e| e.to_string())?;
        result.push(FsDirEntry {
            name: entry.file_name().to_string_lossy().to_string(),
            path: entry.path().to_string_lossy().to_string(),
            is_dir: file_type.is_dir(),
        });
    }

    result.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(result)
}

/// Open a path in VS Code using the macOS `open` command.
#[tauri::command]
pub fn open_in_vscode(path: String) -> Result<(), String> {
    if !is_path_safe(&path) {
        return Err("Unsafe path detected".to_string());
    }
    Command::new("/usr/bin/open")
        .args(["-a", "Visual Studio Code", &path])
        .spawn()
        .map(|_| ())
        .map_err(|e| e.to_string())
}
