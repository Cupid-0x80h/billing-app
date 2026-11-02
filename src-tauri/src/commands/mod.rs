pub mod auth;
pub mod backup;
pub mod cart;
pub mod checkout;
pub mod menu;
pub mod reports;
pub mod tabs;
pub mod users;

use rusqlite::{Connection, OptionalExtension};

/// Server-side role gate (REQ-1.3 — role-based access control).
pub(crate) fn require_admin(conn: &Connection, actor_id: i64) -> Result<(), String> {
    let role: Option<String> = conn
        .query_row("SELECT role FROM Users WHERE id = ?1", [actor_id], |r| {
            r.get(0)
        })
        .optional()
        .map_err(|e| format!("Database error: {e}"))?;
    match role.as_deref() {
        Some("admin") => Ok(()),
        Some(_) => Err("Only an admin can perform this action".to_string()),
        None => Err("User not found".to_string()),
    }
}

#[cfg(test)]
mod tests;
