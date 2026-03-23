// Database migrations are registered in lib.rs via tauri_plugin_sql::Builder.
// SQL schema: see migrations/001_initial.sql
//
// All queries run from the frontend using @tauri-apps/plugin-sql (JavaScript).
// This keeps the Rust layer thin — only git and process management live here.
