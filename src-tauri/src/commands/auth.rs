//! REQ-1.1 / 1.2 / 1.3 — Local login, credential verification, role info.

use crate::auth;
use crate::AppState;
use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;
use tauri::State;

/// User info returned to the frontend after successful login.
#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SessionUser {
    pub id: i64,
    pub username: String,
    pub role: String,
    pub must_change_password: bool,
}

pub(crate) fn login_core(
    conn: &Connection,
    username: &str,
    password: &str,
) -> Result<SessionUser, String> {
    let row: Option<(i64, String, String, String, i64)> = conn
        .query_row(
            "SELECT id, username, password_hash, role, must_change_password
             FROM Users WHERE username = ?1",
            [username],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?)),
        )
        .optional()
        .map_err(|e| format!("Database error: {e}"))?;

    // Same generic error for unknown user and wrong password (no user enumeration).
    let Some((id, uname, hash, role, must)) = row else {
        return Err("Invalid username or password".to_string());
    };
    if !auth::verify_password(password, &hash) {
        return Err("Invalid username or password".to_string());
    }

    Ok(SessionUser {
        id,
        username: uname,
        role,
        must_change_password: must != 0,
    })
}

pub(crate) fn change_password_core(
    conn: &Connection,
    user_id: i64,
    old_password: &str,
    new_password: &str,
) -> Result<(), String> {
    if new_password.len() < 4 {
        return Err("New password must be at least 4 characters".to_string());
    }
    if new_password == old_password {
        return Err("New password must differ from the current one".to_string());
    }

    let stored_hash: String = conn
        .query_row(
            "SELECT password_hash FROM Users WHERE id = ?1",
            [user_id],
            |r| r.get(0),
        )
        .optional()
        .map_err(|e| format!("Database error: {e}"))?
        .ok_or_else(|| "User not found".to_string())?;

    if !auth::verify_password(old_password, &stored_hash) {
        return Err("Current password is incorrect".to_string());
    }

    let new_hash = auth::hash_password(new_password)?;
    conn.execute(
        "UPDATE Users SET password_hash = ?1, must_change_password = 0 WHERE id = ?2",
        params![new_hash, user_id],
    )
    .map_err(|e| format!("Failed to update password: {e}"))?;
    Ok(())
}

#[tauri::command]
pub fn login(
    state: State<'_, AppState>,
    username: String,
    password: String,
) -> Result<SessionUser, String> {
    let conn = state
        .conn
        .lock()
        .map_err(|_| "Database unavailable".to_string())?;
    login_core(&conn, &username, &password)
}

#[tauri::command]
pub fn change_password(
    state: State<'_, AppState>,
    user_id: i64,
    old_password: String,
    new_password: String,
) -> Result<(), String> {
    let conn = state
        .conn
        .lock()
        .map_err(|_| "Database unavailable".to_string())?;
    change_password_core(&conn, user_id, &old_password, &new_password)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    /// Open a fresh temp database (auto-seeded with admin/admin).
    fn temp_db() -> (Connection, Vec<PathBuf>) {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let path = std::env::temp_dir().join(format!("billing_test_{nanos}.db"));
        let conn = crate::db::open_and_migrate(&path).expect("open temp db");
        let files = [path.clone(), PathBuf::from(format!("{}-wal", path.display())), PathBuf::from(format!("{}-shm", path.display()))]
            .to_vec();
        (conn, files)
    }

    fn cleanup(files: &[PathBuf]) {
        for f in files {
            let _ = std::fs::remove_file(f);
        }
    }

    #[test]
    fn admin_seeded_and_can_login_with_must_change_flag() {
        let (conn, files) = temp_db();
        let user = login_core(&conn, "admin", "admin").expect("admin should login");
        assert_eq!(user.username, "admin");
        assert_eq!(user.role, "admin");
        assert!(user.must_change_password);
        cleanup(&files);
    }

    #[test]
    fn wrong_password_and_unknown_user_give_same_error() {
        let (conn, files) = temp_db();
        let e1 = login_core(&conn, "admin", "wrong").unwrap_err();
        let e2 = login_core(&conn, "ghost", "wrong").unwrap_err();
        assert_eq!(e1, e2);
        assert_eq!(e1, "Invalid username or password");
        cleanup(&files);
    }

    #[test]
    fn change_password_flow() {
        let (conn, files) = temp_db();
        let user = login_core(&conn, "admin", "admin").unwrap();

        // Wrong current password rejected
        assert!(change_password_core(&conn, user.id, "bad", "newpass").is_err());

        // Valid change clears the must-change flag
        change_password_core(&conn, user.id, "admin", "newpass").expect("change should succeed");
        let after = login_core(&conn, "admin", "newpass").expect("new password works");
        assert!(!after.must_change_password);
        assert!(login_core(&conn, "admin", "admin").is_err());

        // Weak password rejected
        assert!(change_password_core(&conn, user.id, "newpass", "123").is_err());
        cleanup(&files);
    }
}
