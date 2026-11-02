//! SQLite connection setup, schema migrations, and initial seeding.
//!
//! Schema follows SRS section 5 exactly (table/column names), plus one
//! extension: `Users.must_change_password` to support the forced password
//! change for the seeded admin account.

use rusqlite::Connection;
use std::fs;
use std::path::Path;

/// Open (or create) the database at `path`, apply pragmas, run migrations,
/// and seed the default admin account.
pub fn open_and_migrate(path: &Path) -> Result<Connection, String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Cannot create data dir: {e}"))?;
    }

    let conn = Connection::open(path).map_err(|e| format!("Cannot open database: {e}"))?;

    // ACID + durability settings (SRS 4.1 Data Integrity)
    conn.pragma_update(None, "foreign_keys", "ON")
        .map_err(|e| e.to_string())?;
    // WAL improves concurrent read performance while keeping ACID guarantees.
    let _mode: String = conn
        .query_row("PRAGMA journal_mode=WAL", [], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    conn.pragma_update(None, "synchronous", "NORMAL")
        .map_err(|e| e.to_string())?;

    migrate(&conn)?;
    seed(&conn)?;
    Ok(conn)
}

fn migrate(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(SCHEMA)
        .map_err(|e| format!("Migration failed: {e}"))
}

/// SRS section 5 — Database Schema (SQLite)
const SCHEMA: &str = r#"
CREATE TABLE IF NOT EXISTS Users (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    username              TEXT    NOT NULL UNIQUE,
    password_hash         TEXT    NOT NULL,
    role                  TEXT    NOT NULL CHECK (role IN ('admin', 'staff')),
    must_change_password  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS MenuItems (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    name      TEXT    NOT NULL,
    category  TEXT    NOT NULL,
    price     REAL    NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS Transactions (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    cashier_id        INTEGER NOT NULL REFERENCES Users(id),
    table_identifier  TEXT    NOT NULL,
    customer_name     TEXT,
    status            TEXT    NOT NULL CHECK (status IN ('Open', 'Paid', 'Credit')),
    payment_method    TEXT    CHECK (payment_method IN ('Cash', 'Online', 'Split', 'None')),
    cash_amount       REAL    NOT NULL DEFAULT 0.0,
    online_amount     REAL    NOT NULL DEFAULT 0.0,
    total_amount      REAL    NOT NULL DEFAULT 0.0,
    created_timestamp DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    closed_timestamp  DATETIME
);

CREATE TABLE IF NOT EXISTS TransactionItems (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    transaction_id INTEGER NOT NULL REFERENCES Transactions(id) ON DELETE CASCADE,
    item_id        INTEGER NOT NULL REFERENCES MenuItems(id),
    quantity       INTEGER NOT NULL,
    price_at_time  REAL    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_transactions_status ON Transactions(status);
CREATE INDEX IF NOT EXISTS idx_transactions_created ON Transactions(created_timestamp);
CREATE INDEX IF NOT EXISTS idx_tx_items_txn ON TransactionItems(transaction_id);
"#;

/// Seed the default admin on first run (forced password change on login)
/// and a small sample menu so the app is usable out of the box (admin can
/// CRUD these later).
fn seed(conn: &Connection) -> Result<(), String> {
    seed_admin(conn)?;
    seed_sample_menu(conn)?;
    Ok(())
}

fn seed_admin(conn: &Connection) -> Result<(), String> {
    let user_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM Users", [], |r| r.get(0))
        .map_err(|e| e.to_string())?;

    if user_count == 0 {
        let hash = crate::auth::hash_password("admin")
            .map_err(|e| format!("Failed to seed admin: {e}"))?;
        conn.execute(
            "INSERT INTO Users (username, password_hash, role, must_change_password)
             VALUES ('admin', ?1, 'admin', 1)",
            rusqlite::params![hash],
        )
        .map_err(|e| format!("Failed to seed admin: {e}"))?;
        eprintln!("[db] Seeded default admin account (username: admin)");
    }
    Ok(())
}

/// Sample menu (Nepali restaurant) — inserted only when MenuItems is empty.
fn seed_sample_menu(conn: &Connection) -> Result<(), String> {
    let count: i64 = conn
        .query_row("SELECT COUNT(*) FROM MenuItems", [], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    if count > 0 {
        return Ok(());
    }

    let items = [
        ("Veg Momo (Steamed)", "Starters", 180.0),
        ("Chicken Momo (Steamed)", "Starters", 250.0),
        ("Chatamari", "Starters", 220.0),
        ("Paneer Chilli", "Starters", 320.0),
        ("Veg Thali", "Mains", 350.0),
        ("Chicken Thali", "Mains", 500.0),
        ("Dal Bhat", "Mains", 300.0),
        ("Chowmein", "Mains", 220.0),
        ("Fried Rice", "Mains", 260.0),
        ("Chiya", "Drinks", 40.0),
        ("Lassi", "Drinks", 120.0),
        ("Cold Drinks", "Drinks", 90.0),
        ("Mineral Water", "Drinks", 30.0),
    ];
    for (name, category, price) in items {
        conn.execute(
            "INSERT INTO MenuItems (name, category, price) VALUES (?1, ?2, ?3)",
            rusqlite::params![name, category, price],
        )
        .map_err(|e| format!("Failed to seed sample menu: {e}"))?;
    }
    eprintln!("[db] Seeded {} sample menu items", items.len());
    Ok(())
}
