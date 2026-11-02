//! REQ-6.x — Transaction history, filters, daily summaries, credit settlement.

use crate::commands::checkout::CheckoutResult;
use crate::commands::require_admin;
use crate::AppState;
use rusqlite::{params, params_from_iter, Connection, OptionalExtension};
use serde::Serialize;
use tauri::State;

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct TransactionRecord {
    pub id: i64,
    pub table_identifier: String,
    pub customer_name: Option<String>,
    pub status: String,
    pub payment_method: Option<String>,
    pub cash_amount: f64,
    pub online_amount: f64,
    pub total_amount: f64,
    pub created_timestamp: String,
    pub closed_timestamp: Option<String>,
    pub cashier_username: String,
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct RangeSummary {
    pub cash_total: f64,
    pub online_total: f64,
    pub credit_total: f64,
    pub paid_bills: i64,
    pub credit_bills: i64,
}

/// All timestamps are UTC in SQLite; business-local day boundaries are used
/// for filtering via `datetime(..., 'localtime')`.
pub(crate) fn list_transactions_core(
    conn: &Connection,
    from_date: Option<&str>,
    to_date: Option<&str>,
    status: Option<&str>,
    method: Option<&str>,
) -> Result<Vec<TransactionRecord>, String> {
    let mut sql = String::from(
        "SELECT t.id, t.table_identifier, t.customer_name, t.status, t.payment_method,
                t.cash_amount, t.online_amount, t.total_amount,
                t.created_timestamp, t.closed_timestamp, u.username
         FROM Transactions t
         JOIN Users u ON u.id = t.cashier_id
         WHERE t.status != 'Open'",
    );
    let mut args: Vec<&str> = Vec::new();

    if from_date.is_some() {
        sql.push_str(" AND date(COALESCE(t.closed_timestamp, t.created_timestamp), 'localtime') >= ?");
    }
    if to_date.is_some() {
        sql.push_str(" AND date(COALESCE(t.closed_timestamp, t.created_timestamp), 'localtime') <= ?");
    }
    if status.is_some() {
        sql.push_str(" AND t.status = ?");
    }
    if method.is_some() {
        sql.push_str(" AND t.payment_method = ?");
    }
    sql.push_str(
        " ORDER BY COALESCE(t.closed_timestamp, t.created_timestamp) DESC, t.id DESC",
    );

    // Push filter values in the same order as the placeholders.
    args.extend(from_date);
    args.extend(to_date);
    args.extend(status);
    args.extend(method);

    let mut stmt = conn
        .prepare(&sql)
        .map_err(|e| format!("Database error: {e}"))?;
    let rows = stmt
        .query_map(params_from_iter(args.iter().copied()), |r| {
            Ok(TransactionRecord {
                id: r.get(0)?,
                table_identifier: r.get(1)?,
                customer_name: r.get(2)?,
                status: r.get(3)?,
                payment_method: r.get(4)?,
                cash_amount: r.get(5)?,
                online_amount: r.get(6)?,
                total_amount: r.get(7)?,
                created_timestamp: r.get(8)?,
                closed_timestamp: r.get(9)?,
                cashier_username: r.get(10)?,
            })
        })
        .map_err(|e| format!("Database error: {e}"))?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Database error: {e}"))
}

pub(crate) fn range_summary_core(
    conn: &Connection,
    from_date: Option<&str>,
    to_date: Option<&str>,
) -> Result<RangeSummary, String> {
    let mut sql = String::from(
        "SELECT
            COALESCE(SUM(CASE WHEN status = 'Paid'  THEN cash_amount   ELSE 0 END), 0),
            COALESCE(SUM(CASE WHEN status = 'Paid'  THEN online_amount ELSE 0 END), 0),
            COALESCE(SUM(CASE WHEN status = 'Credit' THEN total_amount ELSE 0 END), 0),
            COUNT(CASE WHEN status = 'Paid'  THEN 1 END),
            COUNT(CASE WHEN status = 'Credit' THEN 1 END)
         FROM Transactions
         WHERE status IN ('Paid', 'Credit')",
    );
    let mut args: Vec<&str> = Vec::new();
    if from_date.is_some() {
        sql.push_str(" AND date(COALESCE(closed_timestamp, created_timestamp), 'localtime') >= ?");
    }
    if to_date.is_some() {
        sql.push_str(" AND date(COALESCE(closed_timestamp, created_timestamp), 'localtime') <= ?");
    }
    args.extend(from_date);
    args.extend(to_date);

    conn.query_row(&sql, params_from_iter(args.iter().copied()), |r| {
        Ok(RangeSummary {
            cash_total: r.get(0)?,
            online_total: r.get(1)?,
            credit_total: r.get(2)?,
            paid_bills: r.get(3)?,
            credit_bills: r.get(4)?,
        })
    })
    .map_err(|e| format!("Database error: {e}"))
}

/// REQ-6.4 — Admin settles a Credit transaction to Paid.
pub(crate) fn settle_credit_core(
    conn: &Connection,
    actor_id: i64,
    transaction_id: i64,
    payment_method: &str,
    cash_amount: Option<f64>,
    online_amount: Option<f64>,
) -> Result<CheckoutResult, String> {
    require_admin(conn, actor_id)?;

    let (status_now, total): (String, f64) = conn
        .query_row(
            "SELECT status, total_amount FROM Transactions WHERE id = ?1",
            [transaction_id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .optional()
        .map_err(|e| format!("Database error: {e}"))?
        .ok_or_else(|| "Transaction not found".to_string())?;

    if status_now != "Credit" {
        return Err("Only credit transactions can be settled".to_string());
    }
    if total <= 0.0 {
        return Err("Nothing to settle".to_string());
    }

    let r2 = |x: f64| (x * 100.0).round() / 100.0;
    let (cash, online) = match payment_method {
        "Cash" => (r2(total), 0.0),
        "Online" => (0.0, r2(total)),
        "Split" => {
            let cash = r2(cash_amount.unwrap_or(-1.0));
            let online = r2(online_amount.unwrap_or(-1.0));
            if cash < 0.0 || online < 0.0 {
                return Err("Enter the cash and online amounts".to_string());
            }
            if (cash + online - total).abs() > 0.01 {
                return Err(format!(
                    "Split amounts ({} + {}) must add up to {}",
                    cash, online, total
                ));
            }
            (cash, online)
        }
        _ => return Err("Select a payment method: Cash, Online, or Split".to_string()),
    };

    conn.execute(
        "UPDATE Transactions
         SET status = 'Paid', payment_method = ?1, cash_amount = ?2,
             online_amount = ?3, closed_timestamp = CURRENT_TIMESTAMP
         WHERE id = ?4 AND status = 'Credit'",
        params![payment_method, cash, online, transaction_id],
    )
    .map_err(|e| format!("Failed to settle credit: {e}"))?;

    Ok(CheckoutResult {
        transaction_id,
        status: "Paid".to_string(),
        total_amount: r2(total),
        cash_amount: cash,
        online_amount: online,
    })
}

#[tauri::command]
pub fn list_transactions(
    state: State<'_, AppState>,
    from_date: Option<String>,
    to_date: Option<String>,
    status: Option<String>,
    method: Option<String>,
) -> Result<Vec<TransactionRecord>, String> {
    let conn = state
        .conn
        .lock()
        .map_err(|_| "Database unavailable".to_string())?;
    list_transactions_core(
        &conn,
        from_date.as_deref(),
        to_date.as_deref(),
        status.as_deref(),
        method.as_deref(),
    )
}

#[tauri::command]
pub fn range_summary(
    state: State<'_, AppState>,
    from_date: Option<String>,
    to_date: Option<String>,
) -> Result<RangeSummary, String> {
    let conn = state
        .conn
        .lock()
        .map_err(|_| "Database unavailable".to_string())?;
    range_summary_core(&conn, from_date.as_deref(), to_date.as_deref())
}

#[tauri::command]
pub fn settle_credit(
    state: State<'_, AppState>,
    actor_id: i64,
    transaction_id: i64,
    payment_method: String,
    cash_amount: Option<f64>,
    online_amount: Option<f64>,
) -> Result<CheckoutResult, String> {
    let conn = state
        .conn
        .lock()
        .map_err(|_| "Database unavailable".to_string())?;
    settle_credit_core(
        &conn,
        actor_id,
        transaction_id,
        &payment_method,
        cash_amount,
        online_amount,
    )
}
