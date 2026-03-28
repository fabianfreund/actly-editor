## 2024-11-20 - Safe File Path Operations
**Vulnerability:** Path Traversal
**Learning:** `src-tauri/src/commands/fs_helpers.rs` has several filesystem commands that allow reading and writing files based on a string path passed from the frontend without sanitization. An attacker could use `../` or similar to traverse outside of the intended directory.
**Prevention:** Introduce `is_path_safe` helper function or validate path components against `std::path::Component::ParentDir`.
