//! REQ-3.x — Concurrent table / open-tab management.

use crate::AppState;
use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;
use tauri::State;

/// An open tab (a transaction with status 'Open').
#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Tab {
    pub id: i64,
    pub table_identifier: String,
    pub cashier_id: i64,
    pub total: f64,
    pub item_count: i64,
    pub created_timestamp: String,
}

fn row_to_tab(
    id: i64,
    table_identifier: String,
    cashier_id: i64,
    created_timestamp: String,
    total: f64,
    item_count: i64,
) -> Tab {
    Tab {
        id,
        table_identifier,
        cashier_id,
        total,
        item_count,
        created_timestamp,
    }
}

pub(crate) fn create_tab_core(
    conn: &Connection,
    cashier_id: i64,
    table_identifier: &str,
) -> Result<Tab, String> {
    let name = table_identifier.trim();
    if name.is_empty() {
        return Err("Tab name cannot be empty".to_string());
    }
    if name.chars().count() > 40 {
        return Err("Tab name is too long (max 40 characters)".to_string());
    }

    // Guard against accidentally opening the same table twice (REQ-3.3 keeps
    // tabs concurrent but one live tab per identifier).
    let open_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM Transactions WHERE status = 'Open' AND table_identifier = ?1",
            [name],
            |r| r.get(0),
        )
        .map_err(|e| format!("Database error: {e}"))?;
    if open_count > 0 {
        return Err(format!("An open tab named \"{name}\" already exists"));
    }

    // Validate cashier exists (referential sanity before hitting the FK).
    let cashier_exists: i64 = conn
        .query_row("SELECT COUNT(*) FROM Users WHERE id = ?1", [cashier_id], |r| {
            r.get(0)
        })
        .map_err(|e| format!("Database error: {e}"))?;
    if cashier_exists == 0 {
        return Err("Cashier user no longer exists".to_string());
    }

    conn.execute(
        "INSERT INTO Transactions (cashier_id, table_identifier, status)
         VALUES (?1, ?2, 'Open')",
        params![cashier_id, name],
    )
    .map_err(|e| format!("Failed to open tab: {e}"))?;

    get_tab_core(conn, conn.last_insert_rowid())?
        .ok_or_else(|| "Tab created but could not be read back".to_string())
}

pub(crate) fn get_tab_core(conn: &Connection, tx_id: i64) -> Result<Option<Tab>, String> {
    conn.query_row(
        "SELECT t.id, t.table_identifier, t.cashier_id, t.created_timestamp,
                COALESCE(SUM(ti.quantity * ti.price_at_time), 0),
                COALESCE(SUM(ti.quantity), 0)
         FROM Transactions t
         LEFT JOIN TransactionItems ti ON ti.transaction_id = t.id
         WHERE t.id = ?1 AND t.status = 'Open'
         GROUP BY t.id",
        [tx_id],
        |r| {
            Ok(row_to_tab(
                r.get(0)?,
                r.get(1)?,
                r.get(2)?,
                r.get(3)?,
                r.get(4)?,
                r.get(5)?,
            ))
        },
    )
    .optional()
    .map_err(|e| format!("Database error: {e}"))
}

pub(crate) fn list_open_tabs_core(conn: &Connection) -> Result<Vec<Tab>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT t.id, t.table_identifier, t.cashier_id, t.created_timestamp,
                    COALESCE(SUM(ti.quantity * ti.price_at_time), 0),
                    COALESCE(SUM(ti.quantity), 0)
             FROM Transactions t
             LEFT JOIN TransactionItems ti ON ti.transaction_id = t.id
             WHERE t.status = 'Open'
             GROUP BY t.id
             ORDER BY t.created_timestamp ASC",
        )
        .map_err(|e| format!("Database error: {e}"))?;

    let rows = stmt
        .query_map([], |r| {
            Ok(row_to_tab(
                r.get(0)?,
                r.get(1)?,
                r.get(2)?,
                r.get(3)?,
                r.get(4)?,
                r.get(5)?,
            ))
        })
        .map_err(|e| format!("Database error: {e}"))?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Database error: {e}"))
}

#[tauri::command]
pub fn create_tab(
    state: State<'_, AppState>,
    cashier_id: i64,
    table_identifier: String,
) -> Result<Tab, String> {
    let conn = state
        .conn
        .lock()
        .map_err(|_| "Database unavailable".to_string())?;
    create_tab_core(&conn, cashier_id, &table_identifier)
}

/// Remove an open tab — e.g. a customer asked about prices and left without
/// ordering. Only 'Open' tabs can be deleted; closed bills are permanent
/// history (Paid/Credit rows feed the reports and ledger).
pub(crate) fn delete_tab_core(conn: &Connection, tx_id: i64) -> Result<(), String> {
    let status: Option<String> = conn
        .query_row("SELECT status FROM Transactions WHERE id = ?1", [tx_id], |r| {
            r.get(0)
        })
        .optional()
        .map_err(|e| format!("Database error: {e}"))?;

    match status.as_deref() {
        None => Err("Tab not found".to_string()),
        Some("Open") => {
            // TransactionItems has ON DELETE CASCADE (SRS 5.4), so the cart
            // lines go with it; foreign_keys pragma is ON.
            let changed = conn
                .execute(
                    "DELETE FROM Transactions WHERE id = ?1 AND status = 'Open'",
                    [tx_id],
                )
                .map_err(|e| format!("Failed to delete tab: {e}"))?;
            if changed == 0 {
                return Err("Tab is no longer open".to_string());
            }
            Ok(())
        }
        Some(_) => Err(
            "Only open tabs can be deleted — closed bills are part of the history".to_string(),
        ),
    }
}

#[tauri::command]
pub fn delete_tab(state: State<'_, AppState>, transaction_id: i64) -> Result<(), String> {
    let conn = state
        .conn
        .lock()
        .map_err(|_| "Database unavailable".to_string())?;
    delete_tab_core(&conn, transaction_id)
}

#[tauri::command]
pub fn list_open_tabs(state: State<'_, AppState>) -> Result<Vec<Tab>, String> {
    let conn = state
        .conn
        .lock()
        .map_err(|_| "Database unavailable".to_string())?;
    list_open_tabs_core(&conn)
}
