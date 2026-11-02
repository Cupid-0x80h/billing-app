import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { localTime, npr, localToday } from "../lib/format";
import SettleCreditModal from "../components/SettleCreditModal";
import type {
  PayMethod,
  RangeSummary,
  SessionUser,
  TransactionRecord,
} from "../types";

type Kind = "error" | "success";

/** REQ-6.1/6.2/6.3 — Transaction history, filters, daily summaries. */
export default function Reports({
  user,
  notify,
}: {
  user: SessionUser;
  notify: (kind: Kind, msg: string) => void;
}) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [status, setStatus] = useState("all");
  const [method, setMethod] = useState("all");
  const [records, setRecords] = useState<TransactionRecord[]>([]);
  const [summary, setSummary] = useState<RangeSummary | null>(null);
  const [settling, setSettling] = useState<TransactionRecord | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [recs, sum] = await Promise.all([
          api.listTransactions(from || null, to || null, status === "all" ? null : status, method === "all" ? null : method),
          api.rangeSummary(from || null, to || null),
        ]);
        if (!cancelled) {
          setRecords(recs);
          setSummary(sum);
        }
      } catch (e) {
        if (!cancelled) notify("error", typeof e === "string" ? e : "Failed to load report");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to, status, method]);

  const today = localToday();
  const rangeLabel =
    from || to
      ? `${from || "start"} → ${to || "today"}`
      : "All time";

  async function settle(payMethod: PayMethod, cash?: number, online?: number) {
    if (!settling) return;
    await api.settleCredit(user.id, settling.id, payMethod, cash, online);
    notify("success", `Credit of ${npr(settling.totalAmount)} settled`);
    setSettling(null);
    const [recs, sum] = await Promise.all([
      api.listTransactions(from || null, to || null, status === "all" ? null : status, method === "all" ? null : method),
      api.rangeSummary(from || null, to || null),
    ]);
    setRecords(recs);
    setSummary(sum);
  }

  const selectCls =
    "rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-700 outline-none focus:border-indigo-500";
  const dateCls = selectCls;

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-slate-100">
      {/* Filters (REQ-6.2) */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-4 py-2.5">
        <span className="text-sm font-semibold text-slate-700">History</span>

        <input
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          className={dateCls}
        />
        <span className="text-xs text-slate-400">to</span>
        <input
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          className={dateCls}
        />

        <button
          onClick={() => {
            setFrom(today);
            setTo(today);
          }}
          className={`rounded-lg px-2.5 py-1.5 text-sm font-medium transition ${
            from === today && to === today
              ? "bg-indigo-600 text-white"
              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          }`}
        >
          Today
        </button>
        <button
          onClick={() => {
            setFrom("");
            setTo("");
          }}
          className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-200"
        >
          Clear dates
        </button>

        <select value={status} onChange={(e) => setStatus(e.target.value)} className={selectCls}>
          <option value="all">All statuses</option>
          <option value="Paid">Paid</option>
          <option value="Credit">Credit</option>
        </select>
        <select value={method} onChange={(e) => setMethod(e.target.value)} className={selectCls}>
          <option value="all">All methods</option>
          <option value="Cash">Cash</option>
          <option value="Online">Online</option>
          <option value="Split">Split</option>
          <option value="None">None (credit)</option>
        </select>
      </div>

      {/* Summary cards (REQ-6.3) */}
      <div className="grid grid-cols-2 gap-3 p-4 xl:grid-cols-4">
        <SummaryCard title="Total Cash" value={npr(summary?.cashTotal ?? 0)} tone="emerald" sub={rangeLabel} />
        <SummaryCard title="Total Online" value={npr(summary?.onlineTotal ?? 0)} tone="sky" sub={rangeLabel} />
        <SummaryCard
          title="Credit outstanding"
          value={npr(summary?.creditTotal ?? 0)}
          tone="amber"
          sub={rangeLabel}
        />
        <SummaryCard
          title="Bills"
          value={String((summary?.paidBills ?? 0) + (summary?.creditBills ?? 0))}
          tone="slate"
          sub={`${summary?.paidBills ?? 0} paid · ${summary?.creditBills ?? 0} on credit`}
        />
      </div>

      {/* Table */}
      <div className="min-h-0 flex-1 overflow-auto px-4 pb-4">
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2.5 font-medium">When</th>
                <th className="px-3 py-2.5 font-medium">Tab</th>
                <th className="px-3 py-2.5 font-medium">Customer</th>
                <th className="px-3 py-2.5 font-medium">Status</th>
                <th className="px-3 py-2.5 font-medium">Method</th>
                <th className="px-3 py-2.5 text-right font-medium">Cash</th>
                <th className="px-3 py-2.5 text-right font-medium">Online</th>
                <th className="px-3 py-2.5 text-right font-medium">Total</th>
                <th className="px-3 py-2.5 font-medium">Cashier</th>
                <th className="px-3 py-2.5 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {records.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="whitespace-nowrap px-3 py-2 text-slate-500">
                    {localTime(r.closedTimestamp || r.createdTimestamp)}
                    <span className="ml-1 text-xs text-slate-400">
                      {(r.closedTimestamp || r.createdTimestamp).slice(0, 10)}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-medium text-slate-800">{r.tableIdentifier}</td>
                  <td className="px-3 py-2 text-slate-600">{r.customerName || "—"}</td>
                  <td className="px-3 py-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        r.status === "Paid"
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-amber-50 text-amber-700"
                      }`}
                    >
                      {r.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-slate-600">{r.paymentMethod === "None" ? "—" : r.paymentMethod || "—"}</td>
                  <td className="px-3 py-2 text-right text-slate-600">
                    {r.cashAmount > 0 ? npr(r.cashAmount) : "—"}
                  </td>
                  <td className="px-3 py-2 text-right text-slate-600">
                    {r.onlineAmount > 0 ? npr(r.onlineAmount) : "—"}
                  </td>
                  <td className="px-3 py-2 text-right font-semibold text-slate-900">
                    {npr(r.totalAmount)}
                  </td>
                  <td className="px-3 py-2 text-slate-500">{r.cashierUsername}</td>
                  <td className="px-3 py-2 text-right">
                    {r.status === "Credit" && user.role === "admin" && (
                      <button
                        onClick={() => setSettling(r)}
                        className="rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white transition hover:bg-emerald-500"
                      >
                        Settle
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {records.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-3 py-10 text-center text-slate-400">
                    {loading ? "Loading…" : "No transactions match these filters."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {settling && (
        <SettleCreditModal
          record={settling}
          onClose={() => setSettling(null)}
          onConfirm={(m, cash, online) => settle(m, cash, online)}
        />
      )}
    </div>
  );
}

function SummaryCard({
  title,
  value,
  sub,
  tone,
}: {
  title: string;
  value: string;
  sub: string;
  tone: "emerald" | "sky" | "amber" | "slate";
}) {
  const tones = {
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-700",
    sky: "border-sky-200 bg-sky-50 text-sky-700",
    amber: "border-amber-200 bg-amber-50 text-amber-700",
    slate: "border-slate-200 bg-white text-slate-700",
  } as const;
  return (
    <div className={`rounded-xl border p-3.5 ${tones[tone]}`}>
      <div className="text-xs font-medium uppercase tracking-wide opacity-70">{title}</div>
      <div className="mt-1 text-xl font-bold">{value}</div>
      <div className="mt-0.5 text-xs opacity-60">{sub}</div>
    </div>
  );
}
