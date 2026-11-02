//! REQ-2.x — Menu listing + Admin CRUD (REQ-2.3).

use crate::commands::require_admin;
use crate::AppState;
use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;
use tauri::State;

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct MenuItem {
    pub id: i64,
    pub name: String,
    pub category: String,
    pub price: f64,
    pub is_active: bool,
}

pub(crate) fn list_menu_items_core(
    conn: &Connection,
    include_inactive: bool,
) -> Result<Vec<MenuItem>, String> {
    let sql = if include_inactive {
        "SELECT id, name, category, price, is_active FROM MenuItems ORDER BY category, name"
    } else {
        "SELECT id, name, category, price, is_active FROM MenuItems
         WHERE is_active = 1 ORDER BY category, name"
    };

    let mut stmt = conn
        .prepare(sql)
        .map_err(|e| format!("Database error: {e}"))?;
    let rows = stmt
        .query_map([], |r| {
            Ok(MenuItem {
                id: r.get(0)?,
                name: r.get(1)?,
                category: r.get(2)?,
                price: r.get(3)?,
                is_active: r.get::<_, i64>(4)? != 0,
            })
        })
        .map_err(|e| format!("Database error: {e}"))?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Database error: {e}"))
}

fn validate_item(name: &str, category: &str, price: f64) -> Result<(String, String, f64), String> {
    let name = name.trim();
    let category = category.trim();
    if name.is_empty() {
        return Err("Item name cannot be empty".to_string());
    }
    if name.chars().count() > 60 {
        return Err("Item name is too long (max 60 characters)".to_string());
    }
    if category.is_empty() {
        return Err("Category cannot be empty".to_string());
    }
    if category.chars().count() > 40 {
        return Err("Category is too long (max 40 characters)".to_string());
    }
    if !price.is_finite() || price < 0.0 {
        return Err("Price must be zero or more".to_string());
    }
    if price > 1_000_000.0 {
        return Err("Price looks too large".to_string());
    }
    Ok((name.to_string(), category.to_string(), (price * 100.0).round() / 100.0))
}

fn read_item(conn: &Connection, id: i64) -> Result<MenuItem, String> {
    conn.query_row(
        "SELECT id, name, category, price, is_active FROM MenuItems WHERE id = ?1",
        [id],
        |r| {
            Ok(MenuItem {
                id: r.get(0)?,
                name: r.get(1)?,
                category: r.get(2)?,
                price: r.get(3)?,
                is_active: r.get::<_, i64>(4)? != 0,
            })
        },
    )
    .optional()
    .map_err(|e| format!("Database error: {e}"))?
    .ok_or_else(|| "Menu item not found".to_string())
}

/// SRS has no UNIQUE on MenuItems.name — enforce uniqueness app-side so the
/// menu grid can't show confusing duplicates (case-insensitive).
fn ensure_name_free(conn: &Connection, name: &str, exclude_id: Option<i64>) -> Result<(), String> {
    let dupes: i64 = match exclude_id {
        Some(id) => conn
            .query_row(
                "SELECT COUNT(*) FROM MenuItems WHERE lower(name) = lower(?1) AND id != ?2",
                rusqlite::params![name, id],
                |r| r.get(0),
            ),
        None => conn.query_row(
            "SELECT COUNT(*) FROM MenuItems WHERE lower(name) = lower(?1)",
            [name],
            |r| r.get(0),
        ),
    }
    .map_err(|e| format!("Database error: {e}"))?;
    if dupes > 0 {
        return Err("An item with this name already exists".to_string());
    }
    Ok(())
}

/// Admin create (soft-schema: category is free text, per SRS 5.2).
pub(crate) fn create_menu_item_core(
    conn: &Connection,
    actor_id: i64,
    name: &str,
    category: &str,
    price: f64,
) -> Result<MenuItem, String> {
    require_admin(conn, actor_id)?;
    let (name, category, price) = validate_item(name, category, price)?;
    ensure_name_free(conn, &name, None)?;
    conn.execute(
        "INSERT INTO MenuItems (name, category, price) VALUES (?1, ?2, ?3)",
        params![name, category, price],
    )
    .map_err(|e| {
        if e.to_string().contains("UNIQUE") {
            "An item with this name already exists".to_string()
        } else {
            format!("Failed to create item: {e}")
        }
    })?;
    read_item(conn, conn.last_insert_rowid())
}

/// Admin update: rename / reprice / move category / deactivate / reactivate.
pub(crate) fn update_menu_item_core(
    conn: &Connection,
    actor_id: i64,
    item_id: i64,
    name: &str,
    category: &str,
    price: f64,
    is_active: bool,
) -> Result<MenuItem, String> {
    require_admin(conn, actor_id)?;
    let (name, category, price) = validate_item(name, category, price)?;
    ensure_name_free(conn, &name, Some(item_id))?;
    let changed = conn
        .execute(
            "UPDATE MenuItems SET name = ?1, category = ?2, price = ?3, is_active = ?4
             WHERE id = ?5",
            params![name, category, price, is_active as i64, item_id],
        )
        .map_err(|e| {
            if e.to_string().contains("UNIQUE") {
                "An item with this name already exists".to_string()
            } else {
                format!("Failed to update item: {e}")
            }
        })?;
    if changed == 0 {
        return Err("Menu item not found".to_string());
    }
    read_item(conn, item_id)
}

/// Admin delete → soft delete (is_active = 0). Historical bills keep their
/// FK rows and price_at_time intact (SRS 5.2/5.4).
pub(crate) fn delete_menu_item_core(
    conn: &Connection,
    actor_id: i64,
    item_id: i64,
) -> Result<(), String> {
    require_admin(conn, actor_id)?;
    let changed = conn
        .execute("UPDATE MenuItems SET is_active = 0 WHERE id = ?1", [item_id])
        .map_err(|e| format!("Failed to delete item: {e}"))?;
    if changed == 0 {
        return Err("Menu item not found".to_string());
    }
    Ok(())
}

#[tauri::command]
pub fn create_menu_item(
    state: State<'_, AppState>,
    actor_id: i64,
    name: String,
    category: String,
    price: f64,
) -> Result<MenuItem, String> {
    let conn = state
        .conn
        .lock()
        .map_err(|_| "Database unavailable".to_string())?;
    create_menu_item_core(&conn, actor_id, &name, &category, price)
}

#[tauri::command]
pub fn update_menu_item(
    state: State<'_, AppState>,
    actor_id: i64,
    item_id: i64,
    name: String,
    category: String,
    price: f64,
    is_active: bool,
) -> Result<MenuItem, String> {
    let conn = state
        .conn
        .lock()
        .map_err(|_| "Database unavailable".to_string())?;
    update_menu_item_core(&conn, actor_id, item_id, &name, &category, price, is_active)
}

#[tauri::command]
pub fn delete_menu_item(
    state: State<'_, AppState>,
    actor_id: i64,
    item_id: i64,
) -> Result<(), String> {
    let conn = state
        .conn
        .lock()
        .map_err(|_| "Database unavailable".to_string())?;
    delete_menu_item_core(&conn, actor_id, item_id)
}

#[tauri::command]
pub fn list_menu_items(
    state: State<'_, AppState>,
    include_inactive: bool,
) -> Result<Vec<MenuItem>, String> {
    let conn = state
        .conn
        .lock()
        .map_err(|_| "Database unavailable".to_string())?;
    list_menu_items_core(&conn, include_inactive)
}
