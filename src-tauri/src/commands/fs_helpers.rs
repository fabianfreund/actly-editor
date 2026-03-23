use std::fs;
use std::path::Path;

/// Check whether a path exists on disk.
#[tauri::command]
pub fn fs_exists(path: String) -> bool {
    Path::new(&path).exists()
}

/// Read the text content of a file.
#[tauri::command]
pub fn fs_read_text(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| e.to_string())
}

/// Write text to a file, creating it (and parent dirs) if necessary.
#[tauri::command]
pub fn fs_write_text(path: String, content: String) -> Result<(), String> {
    if let Some(parent) = Path::new(&path).parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(&path, content).map_err(|e| e.to_string())
}

/// Create a directory (and all parents).
#[tauri::command]
pub fn fs_mkdir(path: String) -> Result<(), String> {
    fs::create_dir_all(&path).map_err(|e| e.to_string())
}
