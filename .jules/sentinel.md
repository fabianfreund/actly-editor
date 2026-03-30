## 2024-03-30 - Prevent Unsafe User Controlled Process Execution
**Vulnerability:** The `check_codex_path` and `start_codex_server` commands pass a user-provided `codex_path` straight to `Command::new()`. This could allow arbitrary command execution.
**Learning:** Rust's `std::process::Command::new` accepts a program name. It doesn't use a shell by default, so you can't easily chain commands, but executing arbitrary binaries if `path` is an arbitrary path (like `/bin/sh`) is a major command injection vulnerability. Wait, we're executing whatever binary is passed.
**Prevention:** We should validate `codex_path` properly to ensure it's either an absolute path to the actual `codex` executable or a sanitized filename.
## 2024-03-30 - Catch Error when Check `fs_exists` Promise Fails
**Vulnerability:** Frontend invocations to `fs_exists` do not catch rejected promises correctly if the backend throws an error or security exception. This can cause uncaught Promise rejections leading to crashes or leaked information if a path throws an unhandled error on `fs_exists`.
**Learning:** For Tauri invokes handling file system operations (like boolean check `fs_exists`), any error from Rust's end causes a Promise rejection. Thus, one must gracefully catch these rejections (e.g., `.catch(() => false)`) on the frontend to handle potential security checks safely without blowing up.
**Prevention:** Always append `.catch(() => false)` to `fs_exists` implementations.
