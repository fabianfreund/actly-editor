## 2024-05-15 - Path Traversal in Tauri Commands
**Vulnerability:** The Tauri backend filesystem commands (`fs_exists`, `fs_read_text`, etc.) didn't sanitize paths, allowing directory traversal (e.g., `../../etc/passwd`).
**Learning:** In a desktop AI workspace, untrusted input from the LLM or user could reach native `fs` calls.
**Prevention:** All native filesystem commands must validate that paths do not contain traversal components (`..`), and frontend boolean checks must gracefully catch rejection errors.
