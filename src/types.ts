export type Role = "admin" | "staff";

export interface SessionUser {
  id: number;
  username: string;
  role: Role;
  mustChangePassword: boolean;
}

/** An open tab = a transaction with status 'Open'. */
export interface Tab {
  id: number;
  tableIdentifier: string;
  cashierId: number;
  total: number;
  itemCount: number;
  createdTimestamp: string;
}

export interface MenuItem {
  id: number;
  name: string;
  category: string;
  price: number;
  isActive: boolean;
}

export interface CartLine {
  lineId: number;
  itemId: number;
  name: string;
  category: string;
  price: number;
  quantity: number;
  lineTotal: number;
}

export type PayStatus = "Paid" | "Credit";
export type PayMethod = "Cash" | "Online" | "Split";

export interface CheckoutPayload {
  transactionId: number;
  status: PayStatus;
  paymentMethod?: PayMethod;
  cashAmount?: number;
  onlineAmount?: number;
  customerName?: string;
}

export interface CheckoutResult {
  transactionId: number;
  status: string;
  totalAmount: number;
  cashAmount: number;
  onlineAmount: number;
}

/** A closed transaction in the history (REQ-6.1). */
export interface TransactionRecord {
  id: number;
  tableIdentifier: string;
  customerName: string | null;
  status: "Paid" | "Credit";
  paymentMethod: string | null;
  cashAmount: number;
  onlineAmount: number;
  totalAmount: number;
  createdTimestamp: string;
  closedTimestamp: string | null;
  cashierUsername: string;
}

/** REQ-6.3 — summary for the selected date range. */
export interface RangeSummary {
  cashTotal: number;
  onlineTotal: number;
  creditTotal: number;
  paidBills: number;
  creditBills: number;
}

export interface UserRecord {
  id: number;
  username: string;
  role: Role;
  mustChangePassword: boolean;
}

export interface DatabaseInfo {
  path: string;
  sizeBytes: number;
}
