import { useState } from "react";
import { npr } from "../lib/format";
import type { MenuItem } from "../types";

/** REQ-2.1/2.2 + REQ-4.1 — categorized menu, single-click add, dish search. */
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
  const [query, setQuery] = useState("");

  // Categories in their natural (alphabetical) order from the backend.
  const categories = Array.from(new Set(menu.map((m) => m.category)));
  const q = query.trim().toLowerCase();
  const items = menu.filter(
    (m) =>
      (category === "All" || m.category === category) &&
      (q === "" ||
        m.name.toLowerCase().includes(q) ||
        m.category.toLowerCase().includes(q)),
  );

  return (
    <main className="flex min-w-0 flex-1 flex-col bg-slate-100">
      {/* Search + category chips */}
      <div className="flex items-center gap-2 border-b border-slate-200 bg-white px-3 py-2">
        <div className="relative shrink-0">
          <svg
            className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M9 3.5a5.5 5.5 0 1 0 3.4 9.84l3.08 3.08a.75.75 0 1 0 1.06-1.06l-3.08-3.08A5.5 5.5 0 0 0 9 3.5Zm-3.5 5.5a3.5 3.5 0 1 1 7 0 3.5 3.5 0 0 1-7 0Z"
              clipRule="evenodd"
            />
          </svg>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search dish…"
            aria-label="Search menu dishes"
            className="w-36 rounded-lg border border-slate-200 bg-slate-50 py-1.5 pl-8 pr-2 text-sm outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100 sm:w-48"
          />
        </div>

        <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto">
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
              {q !== "" ? (
                <>
                  No dishes match{" "}
                  <span className="font-semibold text-slate-500">“{query.trim()}”</span>
                  {category !== "All" && (
                    <>
                      {" "}
                      in <span className="font-semibold text-slate-500">{category}</span>
                    </>
                  )}
                  .
                  <button
                    onClick={() => {
                      setQuery("");
                      onCategory("All");
                    }}
                    className="mt-2 block w-full text-indigo-600 underline hover:text-indigo-500"
                  >
                    Clear search
                  </button>
                </>
              ) : menu.length === 0 ? (
                "No items yet. Admins can add items from Menu Management."
              ) : (
                "No items in this category."
              )}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
