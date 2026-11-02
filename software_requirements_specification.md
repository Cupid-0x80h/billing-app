# Software Requirements Specification (SRS)
## Project: Offline Local POS & Billing System

---

## 1. Introduction

### 1.1 Purpose
The purpose of this document is to define the software requirements for a lightweight, strictly offline Point-of-Sale (POS) and billing system. This document will serve as a guide for developers, stakeholders, and testers to understand the system's architecture, functionality, and constraints.

### 1.2 Scope
The software is a desktop application designed to manage restaurant or retail billing operations without relying on an internet connection. Core capabilities include user authentication, menu management, concurrent table/tab management, flexible payment processing (Cash, Online, Split, Credit), and local reporting. The application will be built using a modern web-to-desktop framework to ensure cross-platform compatibility across Linux and Windows.

### 1.3 Definitions and Acronyms
*   **POS:** Point of Sale
*   **SRS:** Software Requirements Specification
*   **Tauri:** A framework for building tiny, fast binaries for all major desktop platforms.
*   **SQLite:** A C-language library that implements a small, fast, self-contained, high-reliability, full-featured, SQL database engine.
*   **Split Payment:** A single transaction settled using a combination of two payment methods (e.g., Cash and Online).
*   **Credit (Udharo):** A transaction where the customer owes the business money to be paid at a later date.

---

## 2. Overall Description

### 2.1 Product Perspective
The system operates as a standalone desktop application. It does not follow a traditional client-server architecture over a network. Instead, the frontend (User Interface) and backend (Application Logic and Database) are bundled together into a single executable file. All data is persisted to a local SQLite file stored on the host machine's hard drive.

### 2.2 Tech Stack Recommendation
*   **Frontend:** React.js (or similar modern UI library) with HTML/CSS.
*   **Backend/Bundler:** Tauri (Rust-based).
*   **Database:** SQLite.

### 2.3 User Classes and Characteristics
*   **Admin/Manager:** Has full access to the system. Can manage menu items, view all historical ledgers, and manage user accounts.
*   **Staff/Cashier:** Handles day-to-day operations. Can open tabs, add items to orders, process payments, and view current active tables.

### 2.4 Operating Environment
*   **Operating Systems:** Windows 10/11, Linux (Arch Linux, Ubuntu, etc.).
*   **Hardware constraints:** Must run efficiently on low-end hardware typical of retail environments.
*   **Network:** 100% Offline (Air-gapped capable).

---

## 3. System Features

### 3.1 Authentication & User Management
*   **REQ-1.1:** The system shall present a local login screen upon startup requiring a username and password/PIN.
*   **REQ-1.2:** The system shall authenticate credentials against the local database before granting access to the dashboard.
*   **REQ-1.3:** The system shall enforce role-based access control (Admin vs. Staff).

### 3.2 Menu & Inventory Management
*   **REQ-2.1:** The system shall display available menu items categorized by type (e.g., Starters, Mains, Drinks).
*   **REQ-2.2:** Each item shall display its name and current price.
*   **REQ-2.3:** (Admin Only) The system shall include a management interface to Create, Read, Update, and Delete (CRUD) menu items and categories.

### 3.3 Concurrent Table & Tab Management
*   **REQ-3.1:** The system shall display an "Active Tables" or "Open Tabs" dashboard, showing all currently occupied tables.
*   **REQ-3.2:** Staff shall be able to open a new tab and assign it a custom identifier (e.g., "Table 4", "Takeaway - Ram").
*   **REQ-3.3:** The system shall support multiple concurrent open tabs.
*   **REQ-3.4:** Staff shall be able to click on any active tab, modify its cart, and save the state without finalizing the bill.

### 3.4 Order & Cart Management
*   **REQ-4.1:** The system shall allow staff to add items to a selected tab's cart with a single click.
*   **REQ-4.2:** The system shall allow quantity adjustments and item removals within the cart.
*   **REQ-4.3:** The system shall instantly and dynamically calculate the subtotal and total cost of the cart.

### 3.5 Checkout & Payment Processing
*   **REQ-5.1:** Upon checkout, the system shall prompt the user to select the transaction status: **Paid** or **Credit**.
*   **REQ-5.2:** For **Paid** transactions, the system shall require the selection of a payment method:
    *   **Cash:** Paid entirely in physical currency.
    *   **Online:** Paid entirely via digital wallet/QR.
    *   **Both (Split):** Paid partially in Cash and partially Online. The UI must provide input fields to specify the amount for each, ensuring the sum equals the total bill.
*   **REQ-5.3:** For **Credit** transactions, the system shall require the cashier to input a Customer Name or Phone Number.
*   **REQ-5.4:** Upon finalizing the transaction, the system shall save the record, clear the active tab, and return the table to a "free" status.

### 3.6 Reporting & Ledger
*   **REQ-6.1:** The system shall provide a "Transaction History" interface to view past transactions.
*   **REQ-6.2:** The system shall allow filtering by Date, Payment Method (Cash/Online), and Status (Paid/Credit).
*   **REQ-6.3:** The system shall display daily summaries (e.g., "Total Cash Today," "Total Online Today").
*   **REQ-6.4:** The system shall allow an Admin to update a "Credit" transaction to "Paid" once the customer settles their debt, recording the payment method used for the settlement.

---

## 4. Non-Functional Requirements

### 4.1 Performance & Reliability
*   **Speed:** UI interactions (adding items, switching tabs) must happen with less than 100ms latency.
*   **Data Integrity:** The system must utilize SQLite's ACID compliance to ensure no data is lost or corrupted during unexpected power losses. Active tabs must automatically restore upon application restart.

### 4.2 Security
*   **Local Storage:** All user credentials must be hashed (e.g., using bcrypt or Argon2) before being stored in the local SQLite database.
*   **No Network Exposure:** The application must not expose any internal APIs or databases to the local network or the internet.

### 4.3 Portability
*   The application must be compilable to standalone executables (`.exe`/`.msi` for Windows, `.AppImage`/native packages for Linux) requiring zero external dependencies (like Node.js or MySQL) to be installed by the end user.

---

## 5. Database Schema (SQLite)

### 5.1 `Users` Table
| Column | Type | Constraints |
| :--- | :--- | :--- |
| `id` | INTEGER | Primary Key, Auto-increment |
| `username` | TEXT | Unique, Not Null |
| `password_hash` | TEXT | Not Null |
| `role` | TEXT | Not Null (e.g., 'admin', 'staff') |

### 5.2 `MenuItems` Table
| Column | Type | Constraints |
| :--- | :--- | :--- |
| `id` | INTEGER | Primary Key, Auto-increment |
| `name` | TEXT | Not Null |
| `category` | TEXT | Not Null |
| `price` | REAL | Not Null |
| `is_active` | INTEGER | Boolean (1 or 0), Default 1 |

### 5.3 `Transactions` Table
| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | INTEGER | Primary Key | Auto-increment |
| `cashier_id` | INTEGER | Foreign Key | References `Users(id)` |
| `table_identifier` | TEXT | Not Null | E.g., 'Table 1', 'Takeaway' |
| `customer_name` | TEXT | Nullable | Required if status is 'Credit' |
| `status` | TEXT | Not Null | 'Open', 'Paid', 'Credit' |
| `payment_method` | TEXT | Nullable | 'Cash', 'Online', 'Split', 'None' |
| `cash_amount` | REAL | Default 0.0 | Amount paid in physical cash |
| `online_amount` | REAL | Default 0.0 | Amount paid via QR/Wallet |
| `total_amount` | REAL | Default 0.0 | Must equal cash + online if Paid |
| `created_timestamp`| DATETIME | Not Null | Default CURRENT_TIMESTAMP |
| `closed_timestamp` | DATETIME | Nullable | Time when bill is finalized |

### 5.4 `TransactionItems` Table
| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | INTEGER | Primary Key | Auto-increment |
| `transaction_id` | INTEGER | Foreign Key | References `Transactions(id)` |
| `item_id` | INTEGER | Foreign Key | References `MenuItems(id)` |
| `quantity` | INTEGER | Not Null | Number of units ordered |
| `price_at_time` | REAL | Not Null | Price locked at time of order |