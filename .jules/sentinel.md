## 2024-04-01 - Arbitrary Code Execution via unvalidated executable path
**Vulnerability:** User-provided executable path (`codex_path`) was passed directly to `tokio::process::Command::new` without validation in Tauri commands (`check_codex_path` and `start_codex_server`).
**Learning:** Directly passing user-supplied paths to `Command::new` allows arbitrary code execution. Malicious inputs could execute shells (`bash`, `cmd.exe`) or other binaries instead of the expected application.
**Prevention:** Strictly validate user-provided executable paths and binary names. Whitelist the expected executable filenames (e.g., checking it equals or ends with `codex` or `codex.exe`) before executing external processes.
