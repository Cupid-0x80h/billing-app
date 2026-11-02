import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { npr } from "../lib/format";
import Modal from "../components/Modal";
import type { MenuItem, SessionUser } from "../types";

type Kind = "error" | "success";

interface FormState {
  id: number | null; // null = creating
  name: string;
  category: string;
  price: string;
  isActive: boolean;
}

/** REQ-2.3 — Admin-only CRUD for menu items and categories (free text). */
export default function MenuAdmin({
  user,
  notify,
}: {
  user: SessionUser;
  notify: (kind: Kind, msg: string) => void;
}) {
  const [items, setItems] = useState<MenuItem[]>([]);
  const [form, setForm] = useState<FormState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const categories = useMemo(
    () => Array.from(new Set(items.map((i) => i.category))).sort(),
    [items],
  );

  async function load() {
    try {
      setItems(await api.listMenuItems(true));
    } catch (e) {
      notify("error", typeof e === "string" ? e : "Failed to load menu");
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openCreate() {
    setError(null);
    setForm({ id: null, name: "", category: categories[0] ?? "", price: "", isActive: true });
  }

  function openEdit(item: MenuItem) {
    setError(null);
    setForm({
      id: item.id,
      name: item.name,
      category: item.category,
      price: String(item.price),
      isActive: item.isActive,
    });
  }

  async function save() {
    if (!form || busy) return;
    const price = Number(form.price);
    if (!form.name.trim() || !form.category.trim()) {
      setError("Name and category are required");
      return;
    }
    if (Number.isNaN(price) || price < 0) {
      setError("Enter a valid price");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (form.id == null) {
        await api.createMenuItem(user.id, form.name, form.category, price);
        notify("success", `“${form.name.trim()}” added to the menu`);
      } else {
        await api.updateMenuItem(user.id, form.id, form.name, form.category, price, form.isActive);
        notify("success", `“${form.name.trim()}” updated`);
      }
      setForm(null);
      await load();
    } catch (e) {
      setError(typeof e === "string" ? e : "Failed to save item");
    } finally {
      setBusy(false);
    }
  }

  async function remove(item: MenuItem) {
    try {
      await api.deleteMenuItem(user.id, item.id);
      notify("success", `“${item.name}” removed from the menu`);
      await load();
    } catch (e) {
      notify("error", typeof e === "string" ? e : "Failed to delete item");
    }
  }

  async function restore(item: MenuItem) {
    try {
      await api.updateMenuItem(user.id, item.id, item.name, item.category, item.price, true);
      notify("success", `“${item.name}” restored`);
      await load();
    } catch (e) {
      notify("error", typeof e === "string" ? e : "Failed to restore item");
    }
  }

  const inputCls =
    "w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200";

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-slate-100">
      <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-2.5">
        <div>
          <h2 className="text-sm font-semibold text-slate-700">Menu Management</h2>
          <p className="text-xs text-slate-400">
            {items.length} items · {categories.length} categories
          </p>
        </div>
        <button
          onClick={openCreate}
          className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-indigo-500"
        >
          + Add item
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-4">
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2.5 font-medium">Name</th>
                <th className="px-3 py-2.5 font-medium">Category</th>
                <th className="px-3 py-2.5 text-right font-medium">Price</th>
                <th className="px-3 py-2.5 font-medium">Status</th>
                <th className="px-3 py-2.5 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((item) => (
                <tr key={item.id} className={item.isActive ? "hover:bg-slate-50" : "bg-slate-50/60 opacity-70"}>
                  <td className="px-3 py-2 font-medium text-slate-800">{item.name}</td>
                  <td className="px-3 py-2">
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                      {item.category}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right font-semibold text-slate-800">
                    {npr(item.price)}
                  </td>
                  <td className="px-3 py-2">
                    {item.isActive ? (
                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                        Active
                      </span>
                    ) : (
                      <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-600">
                        Hidden
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex justify-end gap-1.5">
                      <button
                        onClick={() => openEdit(item)}
                        className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-100"
                      >
                        Edit
                      </button>
                      {item.isActive ? (
                        <button
                          onClick={() => void remove(item)}
                          className="rounded-lg border border-red-200 px-2.5 py-1 text-xs font-medium text-red-600 transition hover:bg-red-50"
                        >
                          Delete
                        </button>
                      ) : (
                        <button
                          onClick={() => void restore(item)}
                          className="rounded-lg border border-emerald-200 px-2.5 py-1 text-xs font-medium text-emerald-600 transition hover:bg-emerald-50"
                        >
                          Restore
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-slate-400">
          Delete hides the item from the POS but keeps past bills intact. Restore
          it anytime from this screen.
        </p>
      </div>

      {form && (
        <Modal
          title={form.id == null ? "Add menu item" : "Edit menu item"}
          onClose={() => setForm(null)}
        >
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Name</label>
              <input
                autoFocus
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Chicken Momo"
                maxLength={60}
                className={inputCls}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Category <span className="text-xs font-normal text-slate-400">(free text)</span>
              </label>
              <input
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                placeholder="e.g. Starters"
                list="menu-categories"
                maxLength={40}
                className={inputCls}
              />
              <datalist id="menu-categories">
                {categories.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Price (रु)
              </label>
              <input
                inputMode="decimal"
                value={form.price}
                onChange={(e) => setForm({ ...form, price: e.target.value })}
                placeholder="0"
                className={inputCls}
              />
            </div>
            {form.id != null && (
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                  className="h-4 w-4 accent-indigo-600"
                />
                Visible on the POS
              </label>
            )}

            {error && (
              <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>
            )}

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => setForm(null)}
                className="flex-1 rounded-lg border border-slate-300 py-2.5 font-medium text-slate-600 transition hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void save()}
                disabled={busy}
                className="flex-1 rounded-lg bg-indigo-600 py-2.5 font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-50"
              >
                {busy ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
