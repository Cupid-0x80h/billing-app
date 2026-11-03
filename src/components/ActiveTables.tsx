import { localTime, npr } from "../lib/format";
import type { Tab } from "../types";

/** REQ-3.1 — Active Tables / Open Tabs dashboard. */
export default function ActiveTables({
  tabs,
  selectedId,
  onSelect,
  onNew,
  onDelete,
}: {
  tabs: Tab[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  onNew: () => void;
  onDelete: (tab: Tab) => void;
}) {
  return (
    <aside className="flex w-64 flex-col border-r border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2.5">
        <h2 className="text-sm font-semibold text-slate-700">
          Open Tabs
          <span className="ml-1.5 rounded-full bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-500">
            {tabs.length}
          </span>
        </h2>
        <button
          onClick={onNew}
          title="Open new tab"
          className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-600 text-lg font-bold leading-none text-white transition hover:bg-indigo-500"
        >
          +
        </button>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto p-2">
        {tabs.length === 0 && (
          <div className="mt-8 px-2 text-center text-sm text-slate-400">
            No open tabs.
            <br />
            Press <span className="font-semibold text-slate-500">+</span> to open one.
          </div>
        )}

        {tabs.map((tab) => {
          const selected = tab.id === selectedId;
          return (
            <div
              key={tab.id}
              role="button"
              tabIndex={0}
              onClick={() => onSelect(tab.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelect(tab.id);
                }
              }}
              className={`w-full cursor-pointer rounded-xl border px-3 py-2.5 text-left transition focus:outline-none focus:ring-2 focus:ring-indigo-300 ${
                selected
                  ? "border-indigo-500 bg-indigo-50 ring-2 ring-indigo-200"
                  : "border-slate-200 bg-white hover:border-indigo-300 hover:bg-slate-50"
              }`}
            >
              <div className="flex items-center justify-between gap-1">
                <span
                  className={`truncate text-sm font-semibold ${
                    selected ? "text-indigo-700" : "text-slate-800"
                  }`}
                >
                  {tab.tableIdentifier}
                </span>
                <span className="flex shrink-0 items-center gap-1">
                  {tab.itemCount > 0 && (
                    <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-500">
                      {tab.itemCount}
                    </span>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(tab);
                    }}
                    title={`Delete “${tab.tableIdentifier}”`}
                    aria-label={`Delete tab ${tab.tableIdentifier}`}
                    className="rounded-md p-0.5 text-slate-300 transition hover:bg-red-50 hover:text-red-500"
                  >
                    <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
                      <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
                    </svg>
                  </button>
                </span>
              </div>
              <div className="mt-1 flex items-center justify-between text-xs">
                <span className="text-slate-400">opened {localTime(tab.createdTimestamp)}</span>
                <span className="font-semibold text-slate-700">{npr(tab.total)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </aside>
  );
}
