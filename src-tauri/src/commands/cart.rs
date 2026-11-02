//! REQ-4.x — Order & cart management (add, quantity, removal, live totals).

use crate::AppState;
use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;
use tauri::State;

/// One line in a tab's cart.
#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CartLine {
    pub line_id: i64,
    pub item_id: i64,
    pub name: String,
    pub category: String,
    pub price: f64,
    pub quantity: i64,
    pub line_total: f64,
}

/// Ensure the transaction exists and is still open.
fn assert_open(conn: &Connection, tx_id: i64) -> Result<(), String> {
    let status: Option<String> = conn
        .query_row("SELECT status FROM Transactions WHERE id = ?1", [tx_id], |r| {
            r.get(0)
        })
        .optional()
        .map_err(|e| format!("Database error: {e}"))?;
    match status.as_deref() {
        Some("Open") => Ok(()),
        Some(_) => Err("This tab has already been checked out".to_string()),
        None => Err("Tab not found".to_string()),
    }
}

/// Recompute and persist the transaction total from its line items.
/// Returns the new total. (REQ-4.3 — dynamic total calculation.)
pub(crate) fn recalc_total(conn: &Connection, tx_id: i64) -> Result<f64, String> {
    let total: f64 = conn
        .query_row(
            "SELECT COALESCE(SUM(quantity * price_at_time), 0)
             FROM TransactionItems WHERE transaction_id = ?1",
            [tx_id],
            |r| r.get(0),
        )
        .map_err(|e| format!("Database error: {e}"))?;
    conn.execute(
        "UPDATE Transactions SET total_amount = ?1 WHERE id = ?2",
        params![total, tx_id],
    )
    .map_err(|e| format!("Database error: {e}"))?;
    Ok(total)
}

pub(crate) fn list_cart_lines_core(
    conn: &Connection,
    tx_id: i64,
) -> Result<Vec<CartLine>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT ti.id, ti.item_id, m.name, m.category, ti.price_at_time, ti.quantity
             FROM TransactionItems ti
             JOIN MenuItems m ON m.id = ti.item_id
             WHERE ti.transaction_id = ?1
             ORDER BY ti.id",
        )
        .map_err(|e| format!("Database error: {e}"))?;

    let rows = stmt
        .query_map([tx_id], |r| {
            let line_id: i64 = r.get(0)?;
            let price: f64 = r.get(4)?;
            let quantity: i64 = r.get(5)?;
            Ok(CartLine {
                line_id,
                item_id: r.get(1)?,
                name: r.get(2)?,
                category: r.get(3)?,
                price,
                quantity,
                line_total: price * quantity as f64,
            })
        })
        .map_err(|e| format!("Database error: {e}"))?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Database error: {e}"))
}

/// Single-click add (REQ-4.1): adds one unit, incrementing an existing line.
/// Price is locked into price_at_time on first add (SRS 5.4).
pub(crate) fn add_cart_item_core(
    conn: &Connection,
    tx_id: i64,
    item_id: i64,
) -> Result<(), String> {
    assert_open(conn, tx_id)?;

    let item: Option<(f64, i64)> = conn
        .query_row(
            "SELECT price, is_active FROM MenuItems WHERE id = ?1",
            [item_id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .optional()
        .map_err(|e| format!("Database error: {e}"))?;
    let (price, is_active) = item.ok_or_else(|| "Menu item not found".to_string())?;
    if is_active == 0 {
        return Err("This item is no longer available".to_string());
    }

    let existing: Option<i64> = conn
        .query_row(
            "SELECT id FROM TransactionItems WHERE transaction_id = ?1 AND item_id = ?2",
            params![tx_id, item_id],
            |r| r.get(0),
        )
        .optional()
        .map_err(|e| format!("Database error: {e}"))?;

    if let Some(line_id) = existing {
        conn.execute(
            "UPDATE TransactionItems SET quantity = quantity + 1 WHERE id = ?1",
            [line_id],
        )
        .map_err(|e| format!("Failed to add item: {e}"))?;
    } else {
        conn.execute(
            "INSERT INTO TransactionItems (transaction_id, item_id, quantity, price_at_time)
             VALUES (?1, ?2, 1, ?3)",
            params![tx_id, item_id, price],
        )
        .map_err(|e| format!("Failed to add item: {e}"))?;
    }

    recalc_total(conn, tx_id)?;
    Ok(())
}

pub(crate) fn update_cart_quantity_core(
    conn: &Connection,
    line_id: i64,
    quantity: i64,
) -> Result<(), String> {
    if quantity < 1 {
        return Err("Quantity must be at least 1 — remove the item instead".to_string());
    }
    if quantity > 999 {
        return Err("Quantity cannot exceed 999".to_string());
    }

    let tx_id: i64 = conn
        .query_row(
            "SELECT transaction_id FROM TransactionItems WHERE id = ?1",
            [line_id],
            |r| r.get(0),
        )
        .optional()
        .map_err(|e| format!("Database error: {e}"))?
        .ok_or_else(|| "Cart item not found".to_string())?;

    assert_open(conn, tx_id)?;
    conn.execute(
        "UPDATE TransactionItems SET quantity = ?1 WHERE id = ?2",
        params![quantity, line_id],
    )
    .map_err(|e| format!("Failed to update quantity: {e}"))?;
    recalc_total(conn, tx_id)?;
    Ok(())
}

pub(crate) fn remove_cart_item_core(conn: &Connection, line_id: i64) -> Result<(), String> {
    let tx_id: i64 = conn
        .query_row(
            "SELECT transaction_id FROM TransactionItems WHERE id = ?1",
            [line_id],
            |r| r.get(0),
        )
        .optional()
        .map_err(|e| format!("Database error: {e}"))?
        .ok_or_else(|| "Cart item not found".to_string())?;

    assert_open(conn, tx_id)?;
    conn.execute("DELETE FROM TransactionItems WHERE id = ?1", [line_id])
        .map_err(|e| format!("Failed to remove item: {e}"))?;
    recalc_total(conn, tx_id)?;
    Ok(())
}

#[tauri::command]
pub fn list_cart_lines(
    state: State<'_, AppState>,
    transaction_id: i64,
) -> Result<Vec<CartLine>, String> {
    let conn = state
        .conn
        .lock()
        .map_err(|_| "Database unavailable".to_string())?;
    list_cart_lines_core(&conn, transaction_id)
}

#[tauri::command]
pub fn add_cart_item(
    state: State<'_, AppState>,
    transaction_id: i64,
    item_id: i64,
) -> Result<(), String> {
    let conn = state
        .conn
        .lock()
        .map_err(|_| "Database unavailable".to_string())?;
    add_cart_item_core(&conn, transaction_id, item_id)
}

#[tauri::command]
pub fn update_cart_quantity(
    state: State<'_, AppState>,
    line_id: i64,
    quantity: i64,
) -> Result<(), String> {
    let conn = state
        .conn
        .lock()
        .map_err(|_| "Database unavailable".to_string())?;
    update_cart_quantity_core(&conn, line_id, quantity)
}

#[tauri::command]
pub fn remove_cart_item(state: State<'_, AppState>, line_id: i64) -> Result<(), String> {
    let conn = state
        .conn
        .lock()
        .map_err(|_| "Database unavailable".to_string())?;
    remove_cart_item_core(&conn, line_id)
}
