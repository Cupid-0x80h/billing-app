import { npr } from "../lib/format";
import type { MenuItem } from "../types";

/** REQ-2.1/2.2 + REQ-4.1 — categorized menu, single-click add. */
export default function MenuGrid({
  menu,
  category,
  onCategory,
  onAdd,
  canAdd,
}: {
  menu: MenuItem[];
  category: string;
  onCategory: (c: string) => void;
  onAdd: (item: MenuItem) => void;
  canAdd: boolean;
}) {
  // Categories in their natural (alphabetical) order from the backend.
  const categories = Array.from(new Set(menu.map((m) => m.category)));
  const items =
    category === "All" ? menu : menu.filter((m) => m.category === category);

  return (
    <main className="flex min-w-0 flex-1 flex-col bg-slate-100">
      {/* Category chips */}
      <div className="flex gap-2 border-b border-slate-200 bg-white px-3 py-2 overflow-x-auto">
        {["All", ...categories].map((c) => (
          <button
            key={c}
            onClick={() => onCategory(c)}
            className={`whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium transition ${
              category === c
                ? "bg-indigo-600 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      {!canAdd && (
        <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-sm text-amber-700">
          Select an open tab (or press <span className="font-semibold">+</span>) to
          start adding items
        </div>
      )}

      {/* Item cards */}
      <div className="flex-1 overflow-y-auto p-3">
        <div className="grid grid-cols-2 gap-2.5 xl:grid-cols-3">
          {items.map((item) => (
            <button
              key={item.id}
              disabled={!canAdd}
              onClick={() => onAdd(item)}
              className="group rounded-xl border border-slate-200 bg-white p-3 text-left transition hover:border-indigo-400 hover:shadow-sm active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-slate-200 disabled:hover:shadow-none"
            >
              <div className="text-sm font-medium leading-snug text-slate-800">
                {item.name}
              </div>
              <div className="mt-1.5 flex items-center justify-between">
                <span className="text-xs text-slate-400">{item.category}</span>
                <span className="text-sm font-semibold text-indigo-600">
                  {npr(item.price)}
                </span>
              </div>
            </button>
          ))}
          {items.length === 0 && (
            <div className="col-span-full py-10 text-center text-sm text-slate-400">
              No items yet. Admins can add items from Menu Management.
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
