//! Integration tests for the tab / cart / checkout workflow (REQ 3–5).

use crate::commands::auth::login_core;
use crate::commands::backup::{backup_to, restore_swap, validate_backup};
use crate::commands::cart::{
    add_cart_item_core, list_cart_lines_core, remove_cart_item_core, update_cart_quantity_core,
};
use crate::commands::checkout::{checkout_core, CheckoutInput};
use crate::commands::menu::{
    create_menu_item_core, delete_menu_item_core, list_menu_items_core, update_menu_item_core,
};
use crate::commands::reports::{list_transactions_core, range_summary_core, settle_credit_core};
use crate::commands::tabs::{create_tab_core, delete_tab_core, list_open_tabs_core};
use crate::commands::users::{
    create_user_core, delete_user_core, list_users_core, reset_user_password_core,
    set_user_role_core,
};
use crate::testutil::TempDb;

fn admin_id(db: &TempDb) -> i64 {
    login_core(&db.conn, "admin", "admin").unwrap().id
}

fn item_id(db: &TempDb, name: &str) -> i64 {
    db.conn
        .query_row("SELECT id FROM MenuItems WHERE name = ?1", [name], |r| {
            r.get(0)
        })
        .unwrap()
}

fn paid_input(tx_id: i64, method: &str, cash: Option<f64>, online: Option<f64>) -> CheckoutInput {
    CheckoutInput {
        transaction_id: tx_id,
        status: "Paid".to_string(),
        payment_method: Some(method.to_string()),
        cash_amount: cash,
        online_amount: online,
        customer_name: None,
    }
}

#[test]
fn tab_open_list_and_duplicate_guard() {
    let db = TempDb::new();
    let admin = admin_id(&db);

    let tab = create_tab_core(&db.conn, admin, "  Table 4  ").unwrap();
    assert_eq!(tab.table_identifier, "Table 4"); // trimmed
    assert_eq!(tab.total, 0.0);
    assert_eq!(tab.item_count, 0);

    // Empty / over-long / duplicate / unknown-cashier guards
    assert!(create_tab_core(&db.conn, admin, "   ").is_err());
    assert!(create_tab_core(&db.conn, admin, &"x".repeat(41)).is_err());
    assert!(create_tab_core(&db.conn, admin, "Table 4").is_err());
    assert!(create_tab_core(&db.conn, 99999, "Takeaway").is_err());

    create_tab_core(&db.conn, admin, "Takeaway - Ram").unwrap();
    let open = list_open_tabs_core(&db.conn).unwrap();
    assert_eq!(open.len(), 2);
    // Ordered by creation time
    assert_eq!(open[0].table_identifier, "Table 4");
    assert_eq!(open[1].table_identifier, "Takeaway - Ram");
}

#[test]
fn cart_add_increments_and_totals_recalc() {
    let db = TempDb::new();
    let admin = admin_id(&db);
    let tab = create_tab_core(&db.conn, admin, "Table 1").unwrap();
    let momo = item_id(&db, "Veg Momo (Steamed)");
    let chiya = item_id(&db, "Chiya");

    // Single-click add increments the same line (REQ-4.1)
    add_cart_item_core(&db.conn, tab.id, momo).unwrap();
    add_cart_item_core(&db.conn, tab.id, momo).unwrap();
    add_cart_item_core(&db.conn, tab.id, chiya).unwrap();

    let lines = list_cart_lines_core(&db.conn, tab.id).unwrap();
    assert_eq!(lines.len(), 2);
    assert_eq!(lines[0].quantity, 2);
    assert_eq!(lines[0].line_total, 360.0); // 180 x 2
    assert_eq!(lines[1].line_total, 40.0);

    let open = list_open_tabs_core(&db.conn).unwrap();
    assert_eq!(open[0].total, 400.0);
    assert_eq!(open[0].item_count, 3); // units

    // Quantity edit and removal
    update_cart_quantity_core(&db.conn, lines[0].line_id, 5).unwrap();
    assert!(update_cart_quantity_core(&db.conn, lines[0].line_id, 0).is_err());
    let lines = list_cart_lines_core(&db.conn, tab.id).unwrap();
    assert_eq!(lines[0].line_total, 900.0); // 180 x 5

    remove_cart_item_core(&db.conn, lines[1].line_id).unwrap();
    let open = list_open_tabs_core(&db.conn).unwrap();
    assert_eq!(open[0].total, 900.0);

    // Price lock: changing the menu price must not alter an existing cart line
    db.conn
        .execute("UPDATE MenuItems SET price = 999 WHERE id = ?", [momo])
        .unwrap();
    add_cart_item_core(&db.conn, tab.id, momo).unwrap(); // still at old price
    let open = list_open_tabs_core(&db.conn).unwrap();
    assert_eq!(open[0].total, 1080.0); // 900 + 180 (locked price)
}

#[test]
fn checkout_cash_online_and_validation() {
    let db = TempDb::new();
    let admin = admin_id(&db);
    let tab = create_tab_core(&db.conn, admin, "Table 2").unwrap();
    let momo = item_id(&db, "Veg Momo (Steamed)");
    add_cart_item_core(&db.conn, tab.id, momo).unwrap(); // total 180

    // Empty tab and bad split are rejected
    let empty = create_tab_core(&db.conn, admin, "Empty").unwrap();
    assert!(checkout_core(&db.conn, &paid_input(empty.id, "Cash", None, None)).is_err());
    assert!(checkout_core(&db.conn, &paid_input(tab.id, "Split", Some(100.0), Some(50.0))).is_err());
    assert!(checkout_core(&db.conn, &paid_input(tab.id, "Bank", None, None)).is_err());

    // Split with exact sum passes; cash and online are recorded correctly
    let res = checkout_core(&db.conn, &paid_input(tab.id, "Split", Some(100.0), Some(80.0))).unwrap();
    assert_eq!(res.status, "Paid");
    assert_eq!(res.cash_amount, 100.0);
    assert_eq!(res.online_amount, 80.0);

    // Fully-cash checkout fills amounts automatically
    let tab3 = create_tab_core(&db.conn, admin, "Table 3").unwrap();
    add_cart_item_core(&db.conn, tab3.id, momo).unwrap();
    let res = checkout_core(&db.conn, &paid_input(tab3.id, "Cash", None, None)).unwrap();
    assert_eq!(res.cash_amount, 180.0);
    assert_eq!(res.online_amount, 0.0);

    // Closed tabs leave the open list and reject further edits
    assert!(list_open_tabs_core(&db.conn).unwrap().iter().all(|t| t.table_identifier != "Table 2"));
    assert!(add_cart_item_core(&db.conn, tab.id, momo).is_err());
    assert!(checkout_core(&db.conn, &paid_input(tab.id, "Cash", None, None)).is_err());
}

#[test]
fn checkout_credit_requires_customer_and_is_recoverable() {
    let db = TempDb::new();
    let admin = admin_id(&db);
    let tab = create_tab_core(&db.conn, admin, "Table 5").unwrap();
    let thali = item_id(&db, "Veg Thali");
    add_cart_item_core(&db.conn, tab.id, thali).unwrap(); // total 350

    // Credit without a customer is rejected
    let no_name = CheckoutInput {
        transaction_id: tab.id,
        status: "Credit".to_string(),
        payment_method: None,
        cash_amount: None,
        online_amount: None,
        customer_name: Some("   ".to_string()),
    };
    assert!(checkout_core(&db.conn, &no_name).is_err());

    // Credit with a name records it and zeroes payment amounts
    let mut credit = no_name;
    credit.customer_name = Some("Ram".to_string());
    let res = checkout_core(&db.conn, &credit).unwrap();
    assert_eq!(res.status, "Credit");
    assert_eq!(res.total_amount, 350.0);

    let (status, method, customer): (String, String, String) = db
        .conn
        .query_row(
            "SELECT status, payment_method, customer_name FROM Transactions WHERE id = ?1",
            [tab.id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )
        .unwrap();
    assert_eq!(status, "Credit");
    assert_eq!(method, "None");
    assert_eq!(customer, "Ram");
}

#[test]
fn menu_lists_active_only_by_default_and_sample_menu_exists() {
    let db = TempDb::new();

    let active = list_menu_items_core(&db.conn, false).unwrap();
    assert_eq!(active.len(), 13); // sample menu seed

    db.conn
        .execute("UPDATE MenuItems SET is_active = 0 WHERE name = 'Chiya'", [])
        .unwrap();
    let active = list_menu_items_core(&db.conn, false).unwrap();
    assert!(active.iter().all(|m| m.name != "Chiya"));
    let all = list_menu_items_core(&db.conn, true).unwrap();
    assert_eq!(all.len(), 13);

    // Inactive items cannot be added to a cart
    let admin = admin_id(&db);
    let tab = create_tab_core(&db.conn, admin, "Table 6").unwrap();
    let chiya = item_id(&db, "Chiya");
    let err = add_cart_item_core(&db.conn, tab.id, chiya).unwrap_err();
    assert!(err.contains("no longer available"));
}

// ─── Phase 7: Reporting & Ledger ────────────────────────────────────────────

fn local_date(db: &TempDb, modifier: &str) -> String {
    if modifier.is_empty() {
        db.conn
            .query_row("SELECT date('now', 'localtime')", [], |r| r.get(0))
            .unwrap()
    } else {
        db.conn
            .query_row("SELECT date('now', 'localtime', ?1)", [modifier], |r| {
                r.get(0)
            })
            .unwrap()
    }
}

fn checkout_paid(db: &TempDb, cashier: i64, name: &str, method: &str) -> f64 {
    let tab = create_tab_core(&db.conn, cashier, name).unwrap();
    let momo = item_id(db, "Veg Momo (Steamed)");
    add_cart_item_core(&db.conn, tab.id, momo).unwrap(); // 180
    checkout_core(
        &db.conn,
        &CheckoutInput {
            transaction_id: tab.id,
            status: "Paid".to_string(),
            payment_method: Some(method.to_string()),
            cash_amount: None,
            online_amount: None,
            customer_name: None,
        },
    )
    .unwrap()
    .total_amount
}

#[test]
fn reports_filters_and_summary() {
    let db = TempDb::new();
    let admin = admin_id(&db);

    // One cash bill, one online bill, one credit bill (all "today")
    checkout_paid(&db, admin, "R1", "Cash");
    checkout_paid(&db, admin, "R2", "Online");
    let credit_tab = create_tab_core(&db.conn, admin, "R3").unwrap();
    add_cart_item_core(&db.conn, credit_tab.id, item_id(&db, "Veg Thali")).unwrap(); // 350
    checkout_core(
        &db.conn,
        &CheckoutInput {
            transaction_id: credit_tab.id,
            status: "Credit".to_string(),
            payment_method: None,
            cash_amount: None,
            online_amount: None,
            customer_name: Some("Sita".to_string()),
        },
    )
    .unwrap();

    // No filters → all closed transactions, newest first
    let all = list_transactions_core(&db.conn, None, None, None, None).unwrap();
    assert_eq!(all.len(), 3);
    assert_eq!(all[0].table_identifier, "R3");
    assert_eq!(all[0].customer_name.as_deref(), Some("Sita"));
    assert_eq!(all[0].cashier_username, "admin");

    // Status filter
    let credit = list_transactions_core(&db.conn, None, None, Some("Credit"), None).unwrap();
    assert_eq!(credit.len(), 1);
    // Payment method filter
    let cash = list_transactions_core(&db.conn, None, None, None, Some("Cash")).unwrap();
    assert_eq!(cash.len(), 1);
    assert_eq!(cash[0].cash_amount, 180.0);

    // Date filters use business-local days
    let today = local_date(&db, "");
    let tomorrow = local_date(&db, "+1 day");
    let today_rows =
        list_transactions_core(&db.conn, Some(&today), Some(&today), None, None).unwrap();
    assert_eq!(today_rows.len(), 3);
    let future =
        list_transactions_core(&db.conn, Some(&tomorrow), None, None, None).unwrap();
    assert_eq!(future.len(), 0);

    // Range summary (REQ-6.3)
    let sum = range_summary_core(&db.conn, None, None).unwrap();
    assert_eq!(sum.cash_total, 180.0);
    assert_eq!(sum.online_total, 180.0);
    assert_eq!(sum.credit_total, 350.0);
    assert_eq!(sum.paid_bills, 2);
    assert_eq!(sum.credit_bills, 1);

    // Summary over a range with no data
    let empty = range_summary_core(&db.conn, Some(&tomorrow), None).unwrap();
    assert_eq!(empty.cash_total, 0.0);
    assert_eq!(empty.paid_bills, 0);
}

#[test]
fn settle_credit_flow_and_rbac() {
    let db = TempDb::new();
    let admin = admin_id(&db);

    // Non-admin cannot settle
    let staff = create_user_core(&db.conn, admin, "staff1", "pass123", "staff").unwrap();

    let tab = create_tab_core(&db.conn, admin, "S1").unwrap();
    add_cart_item_core(&db.conn, tab.id, item_id(&db, "Veg Thali")).unwrap(); // 350
    checkout_core(
        &db.conn,
        &CheckoutInput {
            transaction_id: tab.id,
            status: "Credit".to_string(),
            payment_method: None,
            cash_amount: None,
            online_amount: None,
            customer_name: Some("Hari".to_string()),
        },
    )
    .unwrap();

    // Staff blocked (REQ-1.3)
    let err = settle_credit_core(&db.conn, staff.id, tab.id, "Cash", None, None).unwrap_err();
    assert!(err.contains("admin"));

    // Bad split rejected
    let err = settle_credit_core(
        &db.conn,
        admin,
        tab.id,
        "Split",
        Some(100.0),
        Some(100.0),
    )
    .unwrap_err();
    assert!(err.contains("must add up"));

    // Admin settles in cash (REQ-6.4)
    let res = settle_credit_core(&db.conn, admin, tab.id, "Cash", None, None).unwrap();
    assert_eq!(res.status, "Paid");
    assert_eq!(res.cash_amount, 350.0);

    // Customer name is preserved after settlement; double-settle rejected
    let (status, customer): (String, String) = db
        .conn
        .query_row(
            "SELECT status, customer_name FROM Transactions WHERE id = ?1",
            [tab.id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .unwrap();
    assert_eq!(status, "Paid");
    assert_eq!(customer, "Hari");
    assert!(settle_credit_core(&db.conn, admin, tab.id, "Cash", None, None).is_err());

    // Settled credit no longer counts as outstanding
    let sum = range_summary_core(&db.conn, None, None).unwrap();
    assert_eq!(sum.credit_total, 0.0);
    assert_eq!(sum.cash_total, 350.0);
}

// ─── Phase 8: Admin menu & user CRUD ────────────────────────────────────────

#[test]
fn menu_crud_and_rbac() {
    let db = TempDb::new();
    let admin = admin_id(&db);
    let staff = create_user_core(&db.conn, admin, "staff2", "pass123", "staff").unwrap();

    // Staff blocked from mutations (REQ-1.3 / REQ-2.3)
    assert!(create_menu_item_core(&db.conn, staff.id, "X", "Drinks", 10.0).is_err());
    assert!(delete_menu_item_core(&db.conn, staff.id, 1).is_err());

    // Create + duplicate name + validation
    let item = create_menu_item_core(&db.conn, admin, "Sekuwa", "Starters", 300.0).unwrap();
    assert!(create_menu_item_core(&db.conn, admin, "Sekuwa", "Starters", 300.0).is_err());
    assert!(create_menu_item_core(&db.conn, admin, "  ", "Starters", 300.0).is_err());
    assert!(create_menu_item_core(&db.conn, admin, "Bad", "Starters", -5.0).is_err());

    // Update: reprice + move category
    let updated =
        update_menu_item_core(&db.conn, admin, item.id, "Sekuwa Plate", "Mains", 350.0, true)
            .unwrap();
    assert_eq!(updated.name, "Sekuwa Plate");
    assert_eq!(updated.price, 350.0);
    assert_eq!(updated.category, "Mains");

    // Delete = soft delete: hidden from active list, still visible with flag
    delete_menu_item_core(&db.conn, admin, item.id).unwrap();
    let active = list_menu_items_core(&db.conn, false).unwrap();
    assert!(active.iter().all(|m| m.id != item.id));
    let all = list_menu_items_core(&db.conn, true).unwrap();
    assert!(all.iter().any(|m| m.id == item.id && !m.is_active));

    // Restore via update
    update_menu_item_core(&db.conn, admin, item.id, "Sekuwa Plate", "Mains", 350.0, true)
        .unwrap();
    let active = list_menu_items_core(&db.conn, false).unwrap();
    assert!(active.iter().any(|m| m.id == item.id));
}

#[test]
fn user_management_rules() {
    let db = TempDb::new();
    let admin = admin_id(&db);

    // Creation validation (incl. case-insensitive duplicate)
    let staff = create_user_core(&db.conn, admin, "Ram", "ram1234", "staff").unwrap();
    assert!(create_user_core(&db.conn, admin, "ram", "ram1234", "staff").is_err());
    assert!(create_user_core(&db.conn, admin, "ab", "ram1234", "staff").is_err());
    assert!(create_user_core(&db.conn, admin, "newbie", "12", "staff").is_err());
    assert!(create_user_core(&db.conn, admin, "newbie", "1234", "superuser").is_err());

    // Staff cannot manage users
    assert!(list_users_core(&db.conn, staff.id).is_err());
    assert!(create_user_core(&db.conn, staff.id, "x123456", "pass1234", "staff").is_err());

    // Role changes: create a second admin so the last-admin rule can be tested
    let admin2 = create_user_core(&db.conn, admin, "Manager", "mgr1234", "admin").unwrap();
    let demoted =
        set_user_role_core(&db.conn, admin, admin2.id, "staff").unwrap();
    assert_eq!(demoted.role, "staff");
    // admin2 is staff now → admin is the last admin → self-demotion blocked
    assert!(set_user_role_core(&db.conn, admin, admin, "staff").is_err());
    // …but promoting back works
    let promoted = set_user_role_core(&db.conn, admin, admin2.id, "admin").unwrap();
    assert_eq!(promoted.role, "admin");

    // Self-deletion blocked
    assert!(delete_user_core(&db.conn, admin, admin).is_err());

    // Password reset forces change on next login
    reset_user_password_core(&db.conn, admin, staff.id, "newpass99").unwrap();
    let login = login_core(&db.conn, "Ram", "newpass99").unwrap();
    assert!(login.must_change_password);
    assert!(login_core(&db.conn, "Ram", "ram1234").is_err());

    // User with transaction history cannot be deleted (FK)…
    let tab = create_tab_core(&db.conn, staff.id, "Hist").unwrap();
    add_cart_item_core(&db.conn, tab.id, item_id(&db, "Chiya")).unwrap();
    assert!(delete_user_core(&db.conn, admin, staff.id).is_err());
    // …and neither can one with an open tab
    checkout_core(
        &db.conn,
        &CheckoutInput {
            transaction_id: tab.id,
            status: "Paid".to_string(),
            payment_method: Some("Cash".to_string()),
            cash_amount: None,
            online_amount: None,
            customer_name: None,
        },
    )
    .unwrap();
    assert!(delete_user_core(&db.conn, admin, staff.id).is_err());

    // A fresh user with no history can be deleted
    let temp = create_user_core(&db.conn, admin, "Temps", "temp1234", "staff").unwrap();
    delete_user_core(&db.conn, admin, temp.id).unwrap();
    assert!(list_users_core(&db.conn, admin).unwrap().iter().all(|u| u.id != temp.id));
}

// ─── Phase 9: Backup & restore ──────────────────────────────────────────────

#[test]
fn backup_and_restore_roundtrip() {
    use std::fs;
    use std::sync::Mutex;
    use std::time::{SystemTime, UNIX_EPOCH};

    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    let main_path = std::env::temp_dir().join(format!("backup_main_{nanos}.db"));
    let dest = std::env::temp_dir().join(format!("backup_dest_{nanos}.db"));
    let bogus = std::env::temp_dir().join(format!("backup_bogus_{nanos}.db"));

    let conn = crate::db::open_and_migrate(&main_path).unwrap();
    let admin: i64 = conn
        .query_row("SELECT id FROM Users WHERE username = 'admin'", [], |r| r.get(0))
        .unwrap();
    let state = crate::AppState {
        conn: Mutex::new(conn),
        db_path: main_path.clone(),
    };

    // State A: one open tab, then back it up
    create_tab_core(&state.conn.lock().unwrap(), admin, "Before").unwrap();
    backup_to(&state.conn.lock().unwrap(), &dest).unwrap();
    assert!(validate_backup(&dest).is_ok());

    // State B: add another tab after the backup
    create_tab_core(&state.conn.lock().unwrap(), admin, "After").unwrap();
    assert_eq!(
        list_open_tabs_core(&state.conn.lock().unwrap()).unwrap().len(),
        2
    );

    // Restore → rolled back to state A
    restore_swap(&state, &dest).unwrap();
    let open = list_open_tabs_core(&state.conn.lock().unwrap()).unwrap();
    assert_eq!(open.len(), 1);
    assert_eq!(open[0].table_identifier, "Before");

    // Restored DB still accepts the admin login (schema + data intact)
    assert!(login_core(&state.conn.lock().unwrap(), "admin", "admin").is_ok());

    // Invalid backups are rejected
    fs::write(&bogus, b"definitely not sqlite").unwrap();
    assert!(validate_backup(&bogus).is_err());
    assert!(validate_backup(&main_path.with_extension("missing.db")).is_err());
    // Restoring the live database onto itself is refused
    assert!(restore_swap(&state, &main_path).is_err());

    // Teardown: close the connection, then remove every file we created
    drop(state);
    let _ = fs::remove_file(&main_path);
    let _ = fs::remove_file(format!("{}-wal", main_path.display()));
    let _ = fs::remove_file(format!("{}-shm", main_path.display()));
    let _ = fs::remove_file(&dest);
    let _ = fs::remove_file(&bogus);
}

// ─── Tab deletion (customer inquiry / walk-out without an order) ────────────

#[test]
fn delete_open_tab_with_cascade_and_guards() {
    let db = TempDb::new();
    let admin = admin_id(&db);

    // Tab with items and a plain empty tab
    let doomed = create_tab_core(&db.conn, admin, "Walk-in 1").unwrap();
    add_cart_item_core(&db.conn, doomed.id, item_id(&db, "Chiya")).unwrap();
    add_cart_item_core(&db.conn, doomed.id, item_id(&db, "Chiya")).unwrap();
    let keeper = create_tab_core(&db.conn, admin, "Table 9").unwrap();

    // Deleting removes the tab AND cascades its cart lines
    delete_tab_core(&db.conn, doomed.id).unwrap();
    let open = list_open_tabs_core(&db.conn).unwrap();
    assert_eq!(open.len(), 1);
    assert_eq!(open[0].table_identifier, "Table 9");
    let orphans: i64 = db
        .conn
        .query_row(
            "SELECT COUNT(*) FROM TransactionItems WHERE transaction_id = ?1",
            [doomed.id],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(orphans, 0);
    let row_count: i64 = db
        .conn
        .query_row(
            "SELECT COUNT(*) FROM Transactions WHERE id = ?1",
            [doomed.id],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(row_count, 0);

    // Guards: double-delete and unknown id
    assert_eq!(
        delete_tab_core(&db.conn, doomed.id).unwrap_err(),
        "Tab not found"
    );
    assert!(delete_tab_core(&db.conn, 99999).is_err());

    // Closed bills can never be deleted (reports/ledger integrity)
    add_cart_item_core(&db.conn, keeper.id, item_id(&db, "Chiya")).unwrap();
    checkout_core(
        &db.conn,
        &CheckoutInput {
            transaction_id: keeper.id,
            status: "Paid".to_string(),
            payment_method: Some("Cash".to_string()),
            cash_amount: None,
            online_amount: None,
            customer_name: None,
        },
    )
    .unwrap();
    let err = delete_tab_core(&db.conn, keeper.id).unwrap_err();
    assert!(err.contains("history"));
    let still_there: i64 = db
        .conn
        .query_row(
            "SELECT COUNT(*) FROM Transactions WHERE id = ?1",
            [keeper.id],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(still_there, 1);
}
