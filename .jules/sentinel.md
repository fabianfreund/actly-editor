## 2024-03-26 - Fixed Path Traversal Vulnerability in fs_helpers.rs
**Vulnerability:** Path traversal vulnerability in Tauri native command handlers like fs_read_text, fs_write_text, fs_mkdir, fs_list_dir, and open_in_vscode.
**Learning:** These commands take untrusted path inputs from the frontend. Using Path::new(path) directly allows paths containing ../ to escape the intended directory constraints (e.g. workspace directory), potentially allowing an attacker to read/write arbitrary files on the local file system.
**Prevention:** Always validate paths for parent directory components .. before performing filesystem operations in Tauri native commands.
