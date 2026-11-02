import { npr } from "../lib/format";
import type { CartLine, Tab } from "../types";

/** REQ-4.2/4.3 — cart with quantity controls, removal, live totals. */
export default function CartPanel({
  tab,
  lines,
  onQuantity,
  onRemove,
  onCheckout,
}: {
  tab: Tab | null;
  lines: CartLine[];
  onQuantity: (line: CartLine, quantity: number) => void;
  onRemove: (line: CartLine) => void;
  onCheckout: () => void;
}) {
  const total = lines.reduce((s, l) => s + l.lineTotal, 0);
  const units = lines.reduce((s, l) => s + l.quantity, 0);

  if (!tab) {
    return (
      <aside className="flex w-80 flex-col items-center justify-center border-l border-slate-200 bg-white p-6 text-center">
        <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-2xl">
          🧾
        </div>
        <p className="text-sm font-medium text-slate-600">No tab selected</p>
        <p className="mt-1 text-xs text-slate-400">
          Pick a tab on the left, or open a new one.
        </p>
      </aside>
    );
  }

  return (
    <aside className="flex w-80 flex-col border-l border-slate-200 bg-white">
      {/* Header */}
      <div className="border-b border-slate-200 px-4 py-3">
        <div className="flex items-center justify-between">
          <h2 className="truncate text-base font-semibold text-slate-900">
            {tab.tableIdentifier}
          </h2>
          <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-600">
            Open
          </span>
        </div>
        <p className="mt-0.5 text-xs text-slate-400">
          {units} item{units === 1 ? "" : "s"} in cart
        </p>
      </div>

      {/* Lines */}
      <div className="flex-1 overflow-y-auto px-3 py-2">
        {lines.length === 0 && (
          <div className="mt-8 text-center text-sm text-slate-400">
            Cart is empty.
            <br />
            Tap items in the menu to add them.
          </div>
        )}

        <div className="space-y-2">
          {lines.map((line) => (
            <div
              key={line.lineId}
              className="rounded-xl border border-slate-200 p-2.5"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-slate-800">
                    {line.name}
                  </div>
                  <div className="text-xs text-slate-400">
                    {npr(line.price)} each
                  </div>
                </div>
                <button
                  onClick={() => onRemove(line)}
                  title="Remove item"
                  className="rounded-md p-1 text-slate-300 transition hover:bg-red-50 hover:text-red-500"
                >
                  <svg width="15" height="15" viewBox="0 0 20 20" fill="currentColor">
                    <path
                      fillRule="evenodd"
                      d="M8.75 1A2.75 2.75 0 0 0 6 3.75V4H3.75a.75.75 0 0 0 0 1.5h.548l.72 10.09A2.75 2.75 0 0 0 7.763 18h4.474a2.75 2.75 0 0 0 2.745-2.41l.72-10.09h.548a.75.75 0 0 0 0-1.5H14v-.25A2.75 2.75 0 0 0 11.25 1h-2.5ZM7.5 4v-.25c0-.69.56-1.25 1.25-1.25h2.5c.69 0 1.25.56 1.25 1.25V4h-5Z"
                      clipRule="evenodd"
                    />
                  </svg>
                </button>
              </div>

              <div className="mt-2 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => onQuantity(line, line.quantity - 1)}
                    className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition hover:bg-slate-100"
                  >
                    −
                  </button>
                  <span className="w-8 text-center text-sm font-semibold text-slate-800">
                    {line.quantity}
                  </span>
                  <button
                    onClick={() => onQuantity(line, line.quantity + 1)}
                    className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition hover:bg-slate-100"
                  >
                    +
                  </button>
                </div>
                <span className="text-sm font-semibold text-slate-800">
                  {npr(line.lineTotal)}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Footer / totals */}
      <div className="border-t border-slate-200 p-4">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-sm text-slate-500">Total</span>
          <span className="text-xl font-bold text-slate-900">{npr(total)}</span>
        </div>
        <button
          onClick={onCheckout}
          disabled={lines.length === 0}
          className="w-full rounded-xl bg-emerald-600 py-3 font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Checkout · {npr(total)}
        </button>
      </div>
    </aside>
  );
}
