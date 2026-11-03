// Offline Local POS & Billing System — Tauri backend entry point
mod auth;
mod commands;
mod db;
#[cfg(test)]
mod testutil;

use rusqlite::Connection;
use std::sync::Mutex;
use tauri::Manager;

/// Shared application state: the single SQLite connection (thread-safe)
/// plus its file location (needed for backup/restore).
pub struct AppState {
    pub conn: Mutex<Connection>,
    pub db_path: std::path::PathBuf,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            // All data lives in the app's local data dir (SRS 2.1 — local SQLite file).
            let data_dir = app
                .path()
                .app_data_dir()
                .map_err(|e| format!("Cannot resolve data dir: {e}"))?;
            let db_path = data_dir.join("billing.db");
            let conn = db::open_and_migrate(&db_path)?;
            app.manage(AppState {
                conn: Mutex::new(conn),
                db_path,
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::auth::login,
            commands::auth::change_password,
            commands::tabs::create_tab,
            commands::tabs::delete_tab,
            commands::tabs::list_open_tabs,
            commands::menu::list_menu_items,
            commands::cart::list_cart_lines,
            commands::cart::add_cart_item,
            commands::cart::update_cart_quantity,
            commands::cart::remove_cart_item,
            commands::checkout::checkout,
            commands::reports::list_transactions,
            commands::reports::range_summary,
            commands::reports::settle_credit,
            commands::menu::create_menu_item,
            commands::menu::update_menu_item,
            commands::menu::delete_menu_item,
            commands::users::list_users,
            commands::users::create_user,
            commands::users::set_user_role,
            commands::users::reset_user_password,
            commands::users::delete_user,
            commands::backup::database_info,
            commands::backup::backup_database,
            commands::backup::restore_database,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
