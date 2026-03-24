mod commands;
mod db;

use commands::codex::CodexProcesses;
use commands::terminal::TerminalSessions;
use commands::{codex, fs_helpers, git, terminal};
use std::collections::HashMap;
use std::sync::Mutex;
use tauri_plugin_sql::{Builder as SqlBuilder, Migration, MigrationKind};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations = vec![
        Migration {
            version: 1,
            description: "initial schema",
            sql: include_str!("db/migrations/001_initial.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "task extras",
            sql: include_str!("db/migrations/002_task_extras.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "workspace tasks",
            sql: include_str!("db/migrations/003_workspace_tasks.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 4,
            description: "workspace indexes",
            sql: include_str!("db/migrations/004_add_workspace_indexes.sql"),
            kind: MigrationKind::Up,
        },
    ];

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(
            SqlBuilder::default()
                .add_migrations("sqlite:actly.db", migrations)
                .build(),
        )
        .manage(CodexProcesses(Mutex::new(HashMap::new())))
        .manage(TerminalSessions(Mutex::new(HashMap::new())))
        .invoke_handler(tauri::generate_handler![
            codex::check_codex_path,
            codex::start_codex_server,
            codex::stop_codex_server,
            codex::get_codex_port,
            codex::debug_log,
            git::git_status,
            git::git_diff,
            git::git_stage,
            git::git_commit,
            git::git_branches,
            terminal::start_terminal_session,
            terminal::stop_terminal_session,
            terminal::write_terminal_session,
            terminal::resize_terminal_session,
            fs_helpers::fs_exists,
            fs_helpers::fs_read_text,
            fs_helpers::fs_write_text,
            fs_helpers::fs_mkdir,
            fs_helpers::fs_list_dir,
            fs_helpers::open_in_vscode,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
