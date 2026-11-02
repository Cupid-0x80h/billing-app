//! Your added feature — one-click backup & restore of the local database.

use crate::commands::require_admin;
use crate::{db, AppState};
use rusqlite::{Connection, OpenFlags};
use serde::Serialize;
use std::fs;
use std::path::Path;
use tauri::State;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DatabaseInfo {
    pub path: String,
    pub size_bytes: u64,
}

/// Validate a backup file: readable, integrity ok, schema present, has users.
pub(crate) fn validate_backup(path: &Path) -> Result<(), String> {
    if !path.exists() {
        return Err("Backup file not found".to_string());
    }
    let conn = Connection::open_with_flags(
        path,
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_URI,
    )
    .map_err(|e| format!("Cannot open backup file: {e}"))?;

    let integrity: String = conn
        .query_row("PRAGMA integrity_check", [], |r| r.get(0))
        .map_err(|e| format!("Cannot read backup file: {e}"))?;
    if integrity != "ok" {
        return Err("Backup file is corrupted".to_string());
    }

    for table in ["Users", "MenuItems", "Transactions", "TransactionItems"] {
        let found: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = ?1",
                [table],
                |r| r.get(0),
            )
            .map_err(|e| format!("Cannot read backup file: {e}"))?;
        if found == 0 {
            return Err(format!("Not a valid backup (missing table {table})"));
        }
    }

    let users: i64 = conn
        .query_row("SELECT COUNT(*) FROM Users", [], |r| r.get(0))
        .map_err(|e| format!("Cannot read backup file: {e}"))?;
    if users == 0 {
        return Err("Backup contains no user accounts".to_string());
    }
    Ok(())
}

/// Consistent snapshot via VACUUM INTO — atomic and WAL-safe (SRS 4.1).
pub(crate) fn backup_to(conn: &Connection, dest: &Path) -> Result<(), String> {
    if dest.exists() {
        fs::remove_file(dest).map_err(|e| format!("Cannot overwrite destination: {e}"))?;
    }
    let dest_str = dest.to_string_lossy().to_string();
    conn.execute("VACUUM INTO ?1", [&dest_str])
        .map_err(|e| format!("Backup failed: {e}"))?;
    Ok(())
}

/// Replace the live database with a validated backup.
/// The open connection is closed first so this works on Windows too.
pub(crate) fn restore_swap(state: &AppState, src: &Path) -> Result<(), String> {
    validate_backup(src)?;

    // Refuse restoring the database onto itself.
    if let (Ok(a), Ok(b)) = (fs::canonicalize(src), fs::canonicalize(&state.db_path)) {
        if a == b {
            return Err("That file IS the live database — pick a backup file".to_string());
        }
    }

    let mut guard = state
        .conn
        .lock()
        .map_err(|_| "Database unavailable".to_string())?;

    // Move the old connection out and close it (WAL is checkpointed on close).
    let placeholder = Connection::open_in_memory().map_err(|e| e.to_string())?;
    let old = std::mem::replace(&mut *guard, placeholder);
    drop(old);

    let mut restore = || -> Result<(), String> {
        fs::copy(src, &state.db_path)
            .map_err(|e| format!("Cannot write database file: {e}"))?;
        // Stale WAL files must never be paired with the new main file.
        let _ = fs::remove_file(format!("{}-wal", state.db_path.display()));
        let _ = fs::remove_file(format!("{}-shm", state.db_path.display()));
        let new_conn = db::open_and_migrate(&state.db_path)?;
        *guard = new_conn;
        Ok(())
    };

    let result = restore();
    if result.is_err() {
        // Best effort recovery: bring the original database back online.
        if let Ok(c) = db::open_and_migrate(&state.db_path) {
            *guard = c;
        }
    }
    result
}

#[tauri::command]
pub fn database_info(state: State<'_, AppState>, actor_id: i64) -> Result<DatabaseInfo, String> {
    let info = {
        let conn = state
            .conn
            .lock()
            .map_err(|_| "Database unavailable".to_string())?;
        require_admin(&conn, actor_id)?;
        DatabaseInfo {
            path: state.db_path.to_string_lossy().to_string(),
            size_bytes: fs::metadata(&state.db_path).map(|m| m.len()).unwrap_or(0),
        }
    };
    Ok(info)
}

#[tauri::command]
pub fn backup_database(
    state: State<'_, AppState>,
    actor_id: i64,
    dest_path: String,
) -> Result<String, String> {
    let conn = state
        .conn
        .lock()
        .map_err(|_| "Database unavailable".to_string())?;
    require_admin(&conn, actor_id)?;
    let dest = Path::new(&dest_path);
    if dest
        .extension()
        .map_or(true, |ext| !ext.eq_ignore_ascii_case("db"))
    {
        return Err("Destination must be a .db file".to_string());
    }
    backup_to(&conn, dest)?;
    Ok(dest_path)
}

#[tauri::command]
pub fn restore_database(
    state: State<'_, AppState>,
    actor_id: i64,
    src_path: String,
) -> Result<(), String> {
    {
        let conn = state
            .conn
            .lock()
            .map_err(|_| "Database unavailable".to_string())?;
        require_admin(&conn, actor_id)?;
    }
    restore_swap(&state, Path::new(&src_path))
}
