//! REQ-5.x — Checkout & payment processing (Paid: Cash/Online/Split, Credit).

use crate::commands::cart::recalc_total;
use crate::AppState;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use tauri::State;

/// Payload sent by the frontend at checkout.
#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CheckoutInput {
    pub transaction_id: i64,
    pub status: String,
    pub payment_method: Option<String>,
    pub cash_amount: Option<f64>,
    pub online_amount: Option<f64>,
    pub customer_name: Option<String>,
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CheckoutResult {
    pub transaction_id: i64,
    pub status: String,
    pub total_amount: f64,
    pub cash_amount: f64,
    pub online_amount: f64,
}

/// Round to 2 decimal places (paisa).
fn r2(x: f64) -> f64 {
    (x * 100.0).round() / 100.0
}

pub(crate) fn checkout_core(conn: &Connection, input: &CheckoutInput) -> Result<CheckoutResult, String> {
    // Tab must exist and be open.
    let status_now: Option<String> = conn
        .query_row(
            "SELECT status FROM Transactions WHERE id = ?1",
            [input.transaction_id],
            |r| r.get(0),
        )
        .optional()
        .map_err(|e| format!("Database error: {e}"))?;
    match status_now.as_deref() {
        Some("Open") => {}
        Some(_) => return Err("This tab has already been checked out".to_string()),
        None => return Err("Tab not found".to_string()),
    }

    // Server-side total from line items — never trust the client (REQ-4.3/5.4).
    let total = r2(recalc_total(conn, input.transaction_id)?);
    if total <= 0.0 {
        return Err("Cannot check out an empty tab".to_string());
    }

    let updated = match input.status.as_str() {
        "Paid" => {
            let method = input
                .payment_method
                .as_deref()
                .unwrap_or("")
                .trim()
                .to_string();
            let (cash, online) = match method.as_str() {
                "Cash" => (total, 0.0),
                "Online" => (0.0, total),
                "Split" => {
                    let cash = r2(input.cash_amount.unwrap_or(-1.0));
                    let online = r2(input.online_amount.unwrap_or(-1.0));
                    if cash < 0.0 || online < 0.0 {
                        return Err("Enter the cash and online amounts".to_string());
                    }
                    if (cash + online - total).abs() > 0.01 {
                        return Err(format!(
                            "Split amounts ({} + {}) must add up to the bill total ({})",
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
                     online_amount = ?3, total_amount = ?4, customer_name = NULL,
                     closed_timestamp = CURRENT_TIMESTAMP
                 WHERE id = ?5 AND status = 'Open'",
                params![method, cash, online, total, input.transaction_id],
            )
            .map_err(|e| format!("Failed to save transaction: {e}"))?;

            CheckoutResult {
                transaction_id: input.transaction_id,
                status: "Paid".to_string(),
                total_amount: total,
                cash_amount: cash,
                online_amount: online,
            }
        }
        "Credit" => {
            let name = input
                .customer_name
                .as_deref()
                .map(str::trim)
                .unwrap_or("")
                .to_string();
            if name.is_empty() {
                return Err("Customer name or phone number is required for credit".to_string());
            }
            if name.chars().count() > 80 {
                return Err("Customer name is too long (max 80 characters)".to_string());
            }

            conn.execute(
                "UPDATE Transactions
                 SET status = 'Credit', payment_method = 'None', customer_name = ?1,
                     cash_amount = 0, online_amount = 0, total_amount = ?2,
                     closed_timestamp = CURRENT_TIMESTAMP
                 WHERE id = ?3 AND status = 'Open'",
                params![name, total, input.transaction_id],
            )
            .map_err(|e| format!("Failed to save transaction: {e}"))?;

            CheckoutResult {
                transaction_id: input.transaction_id,
                status: "Credit".to_string(),
                total_amount: total,
                cash_amount: 0.0,
                online_amount: 0.0,
            }
        }
        _ => return Err("Invalid transaction status".to_string()),
    };

    Ok(updated)
}

#[tauri::command]
pub fn checkout(
    state: State<'_, AppState>,
    input: CheckoutInput,
) -> Result<CheckoutResult, String> {
    let conn = state
        .conn
        .lock()
        .map_err(|_| "Database unavailable".to_string())?;
    checkout_core(&conn, &input)
}
