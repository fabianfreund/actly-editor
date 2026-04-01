
## $(date +%Y-%m-%d) - Prevent Arbitrary Command Execution in Codex Binary Path
**Vulnerability:** The application executed a user-provided codex binary path directly using `tokio::process::Command::new(bin)`. This unsanitized input could lead to arbitrary command execution if an attacker provides a path to a malicious executable.
**Learning:** External processes should never be executed using unvalidated user input, especially when the input dictates the executable path itself. Ensure the binary path strictly aligns with expected application names.
**Prevention:** Strictly validate the user-provided executable path to verify the file name precisely matches the expected executable name (e.g. `codex` or `codex.exe`) or ends with the appropriate expected sequence.
