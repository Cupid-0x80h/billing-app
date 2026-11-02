import { localTime, npr } from "../lib/format";
import type { Tab } from "../types";

/** REQ-3.1 — Active Tables / Open Tabs dashboard. */
export default function ActiveTables({
  tabs,
  selectedId,
  onSelect,
  onNew,
}: {
  tabs: Tab[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  onNew: () => void;
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
            <button
              key={tab.id}
              onClick={() => onSelect(tab.id)}
              className={`w-full rounded-xl border px-3 py-2.5 text-left transition ${
                selected
                  ? "border-indigo-500 bg-indigo-50 ring-2 ring-indigo-200"
                  : "border-slate-200 bg-white hover:border-indigo-300 hover:bg-slate-50"
              }`}
            >
              <div className="flex items-center justify-between">
                <span
                  className={`truncate text-sm font-semibold ${
                    selected ? "text-indigo-700" : "text-slate-800"
                  }`}
                >
                  {tab.tableIdentifier}
                </span>
                {tab.itemCount > 0 && (
                  <span className="ml-1 rounded-full bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-500">
                    {tab.itemCount} item{tab.itemCount === 1 ? "" : "s"}
                  </span>
                )}
              </div>
              <div className="mt-1 flex items-center justify-between text-xs">
                <span className="text-slate-400">opened {localTime(tab.createdTimestamp)}</span>
                <span className="font-semibold text-slate-700">{npr(tab.total)}</span>
              </div>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
