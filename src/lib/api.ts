import { invoke } from "@tauri-apps/api/core";
import type {
  CartLine,
  CheckoutPayload,
  CheckoutResult,
  DatabaseInfo,
  MenuItem,
  PayMethod,
  RangeSummary,
  Role,
  SessionUser,
  Tab,
  TransactionRecord,
  UserRecord,
} from "../types";

/** Typed wrappers around Tauri backend commands. */
export const api = {
  // auth
  login: (username: string, password: string) =>
    invoke<SessionUser>("login", { username, password }),
  changePassword: (userId: number, oldPassword: string, newPassword: string) =>
    invoke<void>("change_password", { userId, oldPassword, newPassword }),

  // tabs (REQ-3.x)
  listOpenTabs: () => invoke<Tab[]>("list_open_tabs"),
  createTab: (cashierId: number, tableIdentifier: string) =>
    invoke<Tab>("create_tab", { cashierId, tableIdentifier }),
  deleteTab: (transactionId: number) =>
    invoke<void>("delete_tab", { transactionId }),

  // menu (REQ-2.x)
  listMenuItems: (includeInactive: boolean) =>
    invoke<MenuItem[]>("list_menu_items", { includeInactive }),

  // cart (REQ-4.x)
  listCartLines: (transactionId: number) =>
    invoke<CartLine[]>("list_cart_lines", { transactionId }),
  addCartItem: (transactionId: number, itemId: number) =>
    invoke<void>("add_cart_item", { transactionId, itemId }),
  updateCartQuantity: (lineId: number, quantity: number) =>
    invoke<void>("update_cart_quantity", { lineId, quantity }),
  removeCartItem: (lineId: number) => invoke<void>("remove_cart_item", { lineId }),

  // checkout (REQ-5.x)
  checkout: (input: CheckoutPayload) =>
    invoke<CheckoutResult>("checkout", { input }),

  // reports & ledger (REQ-6.x)
  listTransactions: (
    fromDate: string | null,
    toDate: string | null,
    status: string | null,
    method: string | null,
  ) =>
    invoke<TransactionRecord[]>("list_transactions", {
      fromDate,
      toDate,
      status,
      method,
    }),
  rangeSummary: (fromDate: string | null, toDate: string | null) =>
    invoke<RangeSummary>("range_summary", { fromDate, toDate }),
  settleCredit: (
    actorId: number,
    transactionId: number,
    paymentMethod: PayMethod,
    cashAmount?: number,
    onlineAmount?: number,
  ) =>
    invoke<CheckoutResult>("settle_credit", {
      actorId,
      transactionId,
      paymentMethod,
      cashAmount,
      onlineAmount,
    }),

  // menu CRUD (admin, REQ-2.3)
  createMenuItem: (actorId: number, name: string, category: string, price: number) =>
    invoke<MenuItem>("create_menu_item", { actorId, name, category, price }),
  updateMenuItem: (
    actorId: number,
    itemId: number,
    name: string,
    category: string,
    price: number,
    isActive: boolean,
  ) =>
    invoke<MenuItem>("update_menu_item", {
      actorId,
      itemId,
      name,
      category,
      price,
      isActive,
    }),
  deleteMenuItem: (actorId: number, itemId: number) =>
    invoke<void>("delete_menu_item", { actorId, itemId }),

  // user management (admin, section 2.3)
  listUsers: (actorId: number) => invoke<UserRecord[]>("list_users", { actorId }),
  createUser: (actorId: number, username: string, password: string, role: Role) =>
    invoke<UserRecord>("create_user", { actorId, username, password, role }),
  setUserRole: (actorId: number, userId: number, role: Role) =>
    invoke<UserRecord>("set_user_role", { actorId, userId, role }),
  resetUserPassword: (actorId: number, userId: number, newPassword: string) =>
    invoke<void>("reset_user_password", { actorId, userId, newPassword }),
  deleteUser: (actorId: number, userId: number) =>
    invoke<void>("delete_user", { actorId, userId }),

  // backup & restore (admin)
  databaseInfo: (actorId: number) =>
    invoke<DatabaseInfo>("database_info", { actorId }),
  backupDatabase: (actorId: number, destPath: string) =>
    invoke<string>("backup_database", { actorId, destPath }),
  restoreDatabase: (actorId: number, srcPath: string) =>
    invoke<void>("restore_database", { actorId, srcPath }),
};
