import { useState, type FormEvent } from "react";
import { parseAmount, r2, npr } from "../lib/format";
import type { CartLine, CheckoutPayload, PayMethod, PayStatus, Tab } from "../types";
import Modal from "./Modal";

/** REQ-5.x — Paid (Cash / Online / Split) or Credit checkout flow. */
export default function CheckoutModal({
  tab,
  lines,
  onClose,
  onConfirm,
}: {
  tab: Tab;
  lines: CartLine[];
  onClose: () => void;
  onConfirm: (payload: CheckoutPayload) => Promise<void>;
}) {
  const total = r2(lines.reduce((s, l) => s + l.lineTotal, 0));

  const [status, setStatus] = useState<PayStatus>("Paid");
  const [method, setMethod] = useState<PayMethod>("Cash");
  const [cashStr, setCashStr] = useState("");
  const [onlineStr, setOnlineStr] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const cash = parseAmount(cashStr);
  const online = parseAmount(onlineStr);
  const splitSumOk =
    Number.isFinite(cash) &&
    Number.isFinite(online) &&
    cash >= 0 &&
    online >= 0 &&
    Math.abs(cash + online - total) <= 0.01;
  const splitRemaining = r2(total - (Number.isFinite(cash) ? cash : 0));

  const canSubmit =
    !busy &&
    (status === "Credit"
      ? customerName.trim().length > 0
      : method !== "Split" || splitSumOk);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError(null);

    const payload: CheckoutPayload = { transactionId: tab.id, status };
    if (status === "Paid") {
      payload.paymentMethod = method;
      if (method === "Split") {
        payload.cashAmount = r2(cash);
        payload.onlineAmount = r2(online);
      }
    } else {
      payload.customerName = customerName.trim();
    }

    try {
      await onConfirm(payload);
    } catch (err) {
      setError(typeof err === "string" ? err : "Checkout failed");
      setBusy(false);
    }
  }

  const inputCls =
    "w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200";

  return (
    <Modal
      title={`Checkout — ${tab.tableIdentifier}`}
      subtitle={`${lines.reduce((s, l) => s + l.quantity, 0)} item(s) · Bill total ${npr(total)}`}
      onClose={onClose}
    >
      <form onSubmit={submit}>
        {/* Status toggle (REQ-5.1) */}
        <div className="mb-4 grid grid-cols-2 gap-2">
          {(["Paid", "Credit"] as PayStatus[]).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatus(s)}
              className={`rounded-xl border-2 px-3 py-2.5 text-sm font-semibold transition ${
                status === s
                  ? s === "Paid"
                    ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                    : "border-amber-500 bg-amber-50 text-amber-700"
                  : "border-slate-200 text-slate-500 hover:bg-slate-50"
              }`}
            >
              {s === "Paid" ? "✓ Paid" : "⏳ Credit (Udharo)"}
            </button>
          ))}
        </div>

        {status === "Paid" && (
          <>
            {/* Method (REQ-5.2) */}
            <div className="mb-3 grid grid-cols-3 gap-2">
              {(
                [
                  ["Cash", "💵"],
                  ["Online", "📱"],
                  ["Split", "↔️"],
                ] as [PayMethod, string][]
              ).map(([m, icon]) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMethod(m)}
                  className={`rounded-xl border-2 px-2 py-2 text-sm font-medium transition ${
                    method === m
                      ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                      : "border-slate-200 text-slate-500 hover:bg-slate-50"
                  }`}
                >
                  <div className="text-lg">{icon}</div>
                  {m === "Split" ? "Both" : m}
                </button>
              ))}
            </div>

            {method === "Cash" && (
              <div className="mb-3 rounded-xl bg-slate-50 px-3 py-2.5 text-sm text-slate-600">
                Full amount in cash: <b>{npr(total)}</b>
              </div>
            )}
            {method === "Online" && (
              <div className="mb-3 rounded-xl bg-slate-50 px-3 py-2.5 text-sm text-slate-600">
                Full amount via QR / wallet: <b>{npr(total)}</b>
              </div>
            )}

            {/* Split inputs (REQ-5.2 Both) */}
            {method === "Split" && (
              <div className="mb-3 rounded-xl border border-slate-200 p-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-500">
                      Cash amount
                    </label>
                    <input
                      inputMode="decimal"
                      value={cashStr}
                      onChange={(e) => setCashStr(e.target.value)}
                      placeholder="0"
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-500">
                      Online amount
                    </label>
                    <input
                      inputMode="decimal"
                      value={onlineStr}
                      onChange={(e) => setOnlineStr(e.target.value)}
                      placeholder="0"
                      className={inputCls}
                    />
                  </div>
                </div>
                <div className="mt-2 flex items-center justify-between text-xs">
                  {splitSumOk ? (
                    <span className="font-medium text-emerald-600">
                      ✓ Adds up to {npr(total)}
                    </span>
                  ) : (
                    <span className="font-medium text-red-600">
                      Remaining: {npr(Math.max(splitRemaining, 0))}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      const balance = r2(total - (Number.isFinite(cash) ? cash : 0));
                      if (balance >= 0) setOnlineStr(String(balance));
                    }}
                    className="rounded-md bg-slate-100 px-2 py-1 font-medium text-slate-600 transition hover:bg-slate-200"
                  >
                    Fill online with balance
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {status === "Credit" && (
          <div className="mb-3">
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Customer name or phone <span className="text-red-500">*</span>
            </label>
            <input
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="e.g. Ram / 9800000000"
              maxLength={80}
              className={inputCls}
            />
            <p className="mt-1.5 text-xs text-slate-400">
              The customer owes {npr(total)} — settle it later from Reports
              (Admin).
            </p>
          </div>
        )}

        {error && (
          <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
            {error}
          </div>
        )}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg border border-slate-300 py-2.5 font-medium text-slate-600 transition hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!canSubmit}
            className={`flex-[2] rounded-lg py-2.5 font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-40 ${
              status === "Paid"
                ? "bg-emerald-600 hover:bg-emerald-500"
                : "bg-amber-500 hover:bg-amber-400"
            }`}
          >
            {busy
              ? "Saving…"
              : status === "Paid"
                ? `Charge ${npr(total)}`
                : `Record credit ${npr(total)}`}
          </button>
        </div>
      </form>
    </Modal>
  );
}
