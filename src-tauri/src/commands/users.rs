//! Section 2.3 — Admin management of user accounts (RBAC admin-only).

use crate::commands::require_admin;
use crate::AppState;
use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;
use tauri::State;

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct UserRecord {
    pub id: i64,
    pub username: String,
    pub role: String,
    pub must_change_password: bool,
}

fn read_user(conn: &Connection, id: i64) -> Result<UserRecord, String> {
    conn.query_row(
        "SELECT id, username, role, must_change_password FROM Users WHERE id = ?1",
        [id],
        |r| {
            Ok(UserRecord {
                id: r.get(0)?,
                username: r.get(1)?,
                role: r.get(2)?,
                must_change_password: r.get::<_, i64>(3)? != 0,
            })
        },
    )
    .optional()
    .map_err(|e| format!("Database error: {e}"))?
    .ok_or_else(|| "User not found".to_string())
}

/// Guard: there must always remain at least one admin.
fn ensure_not_last_admin(conn: &Connection, user_id: i64, next_role: &str) -> Result<(), String> {
    let current_role: Option<String> = conn
        .query_row("SELECT role FROM Users WHERE id = ?1", [user_id], |r| r.get(0))
        .optional()
        .map_err(|e| format!("Database error: {e}"))?
        .ok_or_else(|| "User not found".to_string())?;

    if current_role.as_deref() == Some("admin") && next_role != "admin" {
        let other_admins: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM Users WHERE role = 'admin' AND id != ?1",
                [user_id],
                |r| r.get(0),
            )
            .map_err(|e| format!("Database error: {e}"))?;
        if other_admins == 0 {
            return Err("Cannot demote the last admin — create another admin first".to_string());
        }
    }
    Ok(())
}

fn validate_role(role: &str) -> Result<(), String> {
    match role {
        "admin" | "staff" => Ok(()),
        _ => Err("Role must be 'admin' or 'staff'".to_string()),
    }
}

pub(crate) fn list_users_core(conn: &Connection, actor_id: i64) -> Result<Vec<UserRecord>, String> {
    require_admin(conn, actor_id)?;
    let mut stmt = conn
        .prepare(
            "SELECT id, username, role, must_change_password
             FROM Users ORDER BY role DESC, username",
        )
        .map_err(|e| format!("Database error: {e}"))?;
    let rows = stmt
        .query_map([], |r| {
            Ok(UserRecord {
                id: r.get(0)?,
                username: r.get(1)?,
                role: r.get(2)?,
                must_change_password: r.get::<_, i64>(3)? != 0,
            })
        })
        .map_err(|e| format!("Database error: {e}"))?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Database error: {e}"))
}

pub(crate) fn create_user_core(
    conn: &Connection,
    actor_id: i64,
    username: &str,
    password: &str,
    role: &str,
) -> Result<UserRecord, String> {
    require_admin(conn, actor_id)?;
    validate_role(role)?;

    let username = username.trim();
    if username.chars().count() < 3 {
        return Err("Username must be at least 3 characters".to_string());
    }
    if username.chars().count() > 30 {
        return Err("Username is too long (max 30 characters)".to_string());
    }
    if password.len() < 4 {
        return Err("Password must be at least 4 characters".to_string());
    }

    // Case-insensitive uniqueness.
    let exists: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM Users WHERE lower(username) = lower(?1)",
            [username],
            |r| r.get(0),
        )
        .map_err(|e| format!("Database error: {e}"))?;
    if exists > 0 {
        return Err("That username is already taken".to_string());
    }

    let hash = crate::auth::hash_password(password)?;
    conn.execute(
        "INSERT INTO Users (username, password_hash, role, must_change_password)
         VALUES (?1, ?2, ?3, 0)",
        params![username, hash, role],
    )
    .map_err(|e| format!("Failed to create user: {e}"))?;
    read_user(conn, conn.last_insert_rowid())
}

pub(crate) fn set_user_role_core(
    conn: &Connection,
    actor_id: i64,
    user_id: i64,
    role: &str,
) -> Result<UserRecord, String> {
    require_admin(conn, actor_id)?;
    validate_role(role)?;
    ensure_not_last_admin(conn, user_id, role)?;
    conn.execute(
        "UPDATE Users SET role = ?1 WHERE id = ?2",
        params![role, user_id],
    )
    .map_err(|e| format!("Failed to change role: {e}"))?;
    read_user(conn, user_id)
}

/// Admin password reset — forces the user to change it on next login.
pub(crate) fn reset_user_password_core(
    conn: &Connection,
    actor_id: i64,
    user_id: i64,
    new_password: &str,
) -> Result<(), String> {
    require_admin(conn, actor_id)?;
    if new_password.len() < 4 {
        return Err("Password must be at least 4 characters".to_string());
    }
    let hash = crate::auth::hash_password(new_password)?;
    let changed = conn
        .execute(
            "UPDATE Users SET password_hash = ?1, must_change_password = 1 WHERE id = ?2",
            params![hash, user_id],
        )
        .map_err(|e| format!("Failed to reset password: {e}"))?;
    if changed == 0 {
        return Err("User not found".to_string());
    }
    Ok(())
}

pub(crate) fn delete_user_core(
    conn: &Connection,
    actor_id: i64,
    user_id: i64,
) -> Result<(), String> {
    require_admin(conn, actor_id)?;
    if actor_id == user_id {
        return Err("You cannot delete your own account".to_string());
    }
    ensure_not_last_admin(conn, user_id, "staff")?;

    match conn.execute("DELETE FROM Users WHERE id = ?1", [user_id]) {
        Ok(0) => Err("User not found".to_string()),
        Ok(_) => Ok(()),
        Err(e) => {
            let msg = e.to_string();
            if msg.contains("FOREIGN KEY") {
                Err("This user has transaction history and cannot be deleted — change their role to staff instead".to_string())
            } else {
                Err(format!("Failed to delete user: {msg}"))
            }
        }
    }
}

#[tauri::command]
pub fn list_users(state: State<'_, AppState>, actor_id: i64) -> Result<Vec<UserRecord>, String> {
    let conn = state
        .conn
        .lock()
        .map_err(|_| "Database unavailable".to_string())?;
    list_users_core(&conn, actor_id)
}

#[tauri::command]
pub fn create_user(
    state: State<'_, AppState>,
    actor_id: i64,
    username: String,
    password: String,
    role: String,
) -> Result<UserRecord, String> {
    let conn = state
        .conn
        .lock()
        .map_err(|_| "Database unavailable".to_string())?;
    create_user_core(&conn, actor_id, &username, &password, &role)
}

#[tauri::command]
pub fn set_user_role(
    state: State<'_, AppState>,
    actor_id: i64,
    user_id: i64,
    role: String,
) -> Result<UserRecord, String> {
    let conn = state
        .conn
        .lock()
        .map_err(|_| "Database unavailable".to_string())?;
    set_user_role_core(&conn, actor_id, user_id, &role)
}

#[tauri::command]
pub fn reset_user_password(
    state: State<'_, AppState>,
    actor_id: i64,
    user_id: i64,
    new_password: String,
) -> Result<(), String> {
    let conn = state
        .conn
        .lock()
        .map_err(|_| "Database unavailable".to_string())?;
    reset_user_password_core(&conn, actor_id, user_id, &new_password)
}

#[tauri::command]
pub fn delete_user(
    state: State<'_, AppState>,
    actor_id: i64,
    user_id: i64,
) -> Result<(), String> {
    let conn = state
        .conn
        .lock()
        .map_err(|_| "Database unavailable".to_string())?;
    delete_user_core(&conn, actor_id, user_id)
}
