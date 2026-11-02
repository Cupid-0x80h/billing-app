# Billing POS — Offline Local POS & Billing System

A lightweight, **100% offline** Point-of-Sale and billing desktop application for
restaurants and retail, built exactly to the
[Software Requirements Specification](./software_requirements_specification.md).

## Features

- **Authentication** — local login, Argon2-hashed credentials, role-based access
  (Admin vs Staff), forced password change for the seeded admin
- **Menu management** — categorized items, single-click add to cart, admin CRUD
  (soft delete keeps historical bills intact)
- **Concurrent tabs** — open many tabs ("Table 4", "Takeaway - Ram"), live carts,
  auto-restore of open tabs after restart
- **Checkout** — Paid via **Cash / Online / Split** (with exact-sum validation) or
  **Credit (Udharo)** with customer name/phone
- **Reports & ledger** — filterable transaction history, daily/range summaries
  (total cash, online, credit outstanding), admin one-click credit settlement
- **User management** — create staff/admin accounts, reset passwords, last-admin
  protection
- **Backup / restore** — one-click consistent snapshot (`VACUUM INTO`) and validated
  restore from the Data page

## Tech stack

| Layer | Technology |
|---|---|
| Shell / backend | Tauri 2 (Rust) |
| Database | SQLite (WAL, ACID) via `rusqlite` (bundled) |
| Password hashing | Argon2id |
| Frontend | React 19 + TypeScript + Tailwind CSS v4 (Vite) |

All data lives in a single local file: `~/.local/share/com.cupid.billing-system/billing.db`
(%APPDATA% on Windows). No network access, ever.

## Development

Prerequisites: Node.js, Rust (rustup), and the
[Tauri 2 Linux system dependencies](https://tauri.app/start/prerequisites/).

```bash
npm install
npm run tauri dev      # run the app
npm run tauri build    # build installers
```

### Tests

```bash
cd src-tauri && cargo test   # 14 integration/unit tests
```

## First run

1. Start the app and log in with **admin / admin**
2. You are forced to set a new password immediately
3. A 13-item sample menu is seeded — manage it from the **Menu** page

## Building installers

```bash
npm run tauri build
```

Produces (in `src-tauri/target/release/bundle/`):

- `deb/billing-system_0.1.0_amd64.deb` — Debian/Ubuntu
- `appimage/billing-system_0.1.0_amd64.AppImage` — portable Linux

Windows builds (`.msi`/`.exe`) require running `tauri build` on Windows with the
Rust `x86_64-pc-windows-msvc` target — no code changes needed.

## Requirement traceability

| SRS section | Where |
|---|---|
| 3.1 Authentication | `src-tauri/src/commands/auth.rs`, `src/pages/Login.tsx` |
| 3.2 Menu & inventory | `src-tauri/src/commands/menu.rs`, `src/pages/MenuAdmin.tsx` |
| 3.3 Tables & tabs | `src-tauri/src/commands/tabs.rs`, `src/components/ActiveTables.tsx` |
| 3.4 Order & cart | `src-tauri/src/commands/cart.rs`, `src/components/CartPanel.tsx` |
| 3.5 Checkout | `src-tauri/src/commands/checkout.rs`, `src/components/CheckoutModal.tsx` |
| 3.6 Reporting & ledger | `src-tauri/src/commands/reports.rs`, `src/pages/Reports.tsx` |
| 4 NFRs (ACID, hashing, offline) | `src-tauri/src/db.rs`, `src-tauri/src/auth.rs` |
| 5 Database schema | `src-tauri/src/db.rs` (SCHEMA const) |
