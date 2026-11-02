import { useState } from "react";
import { parseAmount, r2, npr } from "../lib/format";
import type { PayMethod, TransactionRecord } from "../types";
import Modal from "./Modal";

/** REQ-6.4 — Admin settles an outstanding credit to Paid. */
export default function SettleCreditModal({
  record,
  onClose,
  onConfirm,
}: {
  record: TransactionRecord;
  onClose: () => void;
  onConfirm: (method: PayMethod, cash?: number, online?: number) => Promise<void>;
}) {
  const total = r2(record.totalAmount);
  const [method, setMethod] = useState<PayMethod>("Cash");
  const [cashStr, setCashStr] = useState("");
  const [onlineStr, setOnlineStr] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const cash = parseAmount(cashStr);
  const online = parseAmount(onlineStr);
  const splitOk =
    method !== "Split" ||
    (Number.isFinite(cash) &&
      Number.isFinite(online) &&
      cash >= 0 &&
      online >= 0 &&
      Math.abs(cash + online - total) <= 0.01);

  async function submit() {
    if (busy || !splitOk) return;
    setBusy(true);
    setError(null);
    try {
      if (method === "Split") {
        await onConfirm(method, r2(cash), r2(online));
      } else {
        await onConfirm(method);
      }
    } catch (err) {
      setError(typeof err === "string" ? err : "Settlement failed");
      setBusy(false);
    }
  }

  const inputCls =
    "w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200";

  return (
    <Modal
      title="Settle credit"
      subtitle={`${record.tableIdentifier} · ${npr(total)} owed${
        record.customerName ? ` by ${record.customerName}` : ""
      }`}
      onClose={onClose}
    >
      <div className="mb-3 grid grid-cols-3 gap-2">
        {(["Cash", "Online", "Split"] as PayMethod[]).map((m) => (
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
            {m === "Split" ? "Both" : m}
          </button>
        ))}
      </div>

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
            {splitOk ? (
              <span className="font-medium text-emerald-600">✓ Adds up to {npr(total)}</span>
            ) : (
              <span className="font-medium text-red-600">
                Remaining: {npr(Math.max(r2(total - (Number.isFinite(cash) ? cash : 0)), 0))}
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
          type="button"
          onClick={() => void submit()}
          disabled={!splitOk || busy}
          className="flex-[2] rounded-lg bg-emerald-600 py-2.5 font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? "Settling…" : `Mark Paid · ${npr(total)}`}
        </button>
      </div>
    </Modal>
  );
}
