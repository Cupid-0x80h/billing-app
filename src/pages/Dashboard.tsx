import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { npr } from "../lib/format";
import ActiveTables from "../components/ActiveTables";
import MenuGrid from "../components/MenuGrid";
import CartPanel from "../components/CartPanel";
import CheckoutModal from "../components/CheckoutModal";
import NewTabModal from "../components/NewTabModal";
import Reports from "./Reports";
import MenuAdmin from "./MenuAdmin";
import UsersAdmin from "./UsersAdmin";
import Settings from "./Settings";
import type {
  CartLine,
  CheckoutPayload,
  MenuItem,
  SessionUser,
  Tab,
} from "../types";

type Flash = { id: number; kind: "error" | "success"; msg: string };
type Page = "pos" | "reports" | "menu" | "users" | "settings";

function errMsg(e: unknown): string {
  return typeof e === "string" ? e : "Something went wrong";
}

/** Main POS screen: Active Tables + Menu grid + Cart + Checkout (REQ 3–5). */
export default function Dashboard({
  user,
  onLogout,
}: {
  user: SessionUser;
  onLogout: () => void;
}) {
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [category, setCategory] = useState("All");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [lines, setLines] = useState<CartLine[]>([]);
  const [newTabOpen, setNewTabOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [flash, setFlash] = useState<Flash | null>(null);
  const [page, setPage] = useState<Page>("pos");
  const flashSeq = useRef(0);
  const isAdmin = user.role === "admin";

  // Staff can never land on admin-only pages.
  const safePage: Page =
    !isAdmin && page !== "pos" && page !== "reports" ? "pos" : page;

  function showFlash(kind: Flash["kind"], msg: string) {
    const id = ++flashSeq.current;
    setFlash({ id, kind, msg });
    window.setTimeout(() => {
      setFlash((f) => (f && f.id === id ? null : f));
    }, 3000);
  }

  // Initial load (tabs restore automatically — REQ-4.1 data integrity)
  useEffect(() => {
    (async () => {
      try {
        const [t, m] = await Promise.all([
          api.listOpenTabs(),
          api.listMenuItems(false),
        ]);
        setTabs(t);
        setMenu(m);
      } catch (e) {
        showFlash("error", errMsg(e));
      }
    })();
  }, []);

  async function refreshTabs() {
    const t = await api.listOpenTabs();
    setTabs(t);
    // If the selected tab got closed elsewhere, deselect it.
    if (selectedId != null && !t.some((x) => x.id === selectedId)) {
      setSelectedId(null);
      setLines([]);
    }
  }

  async function reloadLines(txId: number) {
    setLines(await api.listCartLines(txId));
  }

  async function refreshCart(txId: number) {
    await Promise.all([reloadLines(txId), refreshTabs()]);
  }

  const selectedTab = tabs.find((t) => t.id === selectedId) ?? null;

  async function handleSelect(id: number) {
    try {
      if (id === selectedId) return;
      setSelectedId(id);
      setLines(await api.listCartLines(id));
    } catch (e) {
      showFlash("error", errMsg(e));
    }
  }

  async function handleAdd(item: MenuItem) {
    if (selectedId == null) {
      showFlash("error", "Open or select a tab first");
      return;
    }
    try {
      await api.addCartItem(selectedId, item.id);
      await refreshCart(selectedId);
    } catch (e) {
      showFlash("error", errMsg(e));
    }
  }

  async function handleQuantity(line: CartLine, quantity: number) {
    try {
      if (quantity < 1) {
        await api.removeCartItem(line.lineId); // minus at qty 1 removes the line
      } else {
        await api.updateCartQuantity(line.lineId, quantity);
      }
      if (selectedId != null) await refreshCart(selectedId);
    } catch (e) {
      showFlash("error", errMsg(e));
    }
  }

  async function handleRemove(line: CartLine) {
    try {
      await api.removeCartItem(line.lineId);
      if (selectedId != null) await refreshCart(selectedId);
    } catch (e) {
      showFlash("error", errMsg(e));
    }
  }

  async function handleCreateTab(name: string) {
    const tab = await api.createTab(user.id, name);
    await refreshTabs();
    setSelectedId(tab.id);
    setLines(await api.listCartLines(tab.id));
    setNewTabOpen(false);
    showFlash("success", `Opened “${tab.tableIdentifier}”`);
  }

  async function handleCheckoutConfirm(payload: CheckoutPayload) {
    const res = await api.checkout(payload);
    setCheckoutOpen(false);
    setSelectedId(null);
    setLines([]);
    await refreshTabs();
    showFlash(
      "success",
      res.status === "Paid"
        ? `Payment recorded — ${npr(res.totalAmount)} settled`
        : `Credit recorded — ${npr(res.totalAmount)} owed`,
    );
  }

  return (
    <div className="flex h-full flex-col bg-slate-100">
      {/* Top bar */}
      <header className="flex items-center justify-between bg-slate-900 px-4 py-2.5 text-white">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-indigo-600 text-sm font-bold">
            रु
          </span>
          <span className="font-semibold">Billing POS</span>
          <span className="ml-2 hidden text-xs text-slate-400 sm:inline">
            {tabs.length} open tab{tabs.length === 1 ? "" : "s"}
          </span>
        </div>

        {/* Nav */}
        <nav className="flex items-center gap-1">
          {(
            [
              ["pos", "POS"],
              ["reports", "Reports"],
              ["menu", "Menu"],
              ["users", "Users"],
              ["settings", "Data"],
            ] as [Page, string][]
          )
            .filter(([id]) => isAdmin || id === "pos" || id === "reports")
            .map(([id, label]) => (
              <button
                key={id}
                onClick={() => setPage(id)}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                  safePage === id
                    ? "bg-slate-700 text-white"
                    : "text-slate-300 hover:bg-slate-800 hover:text-white"
                }`}
              >
                {label}
              </button>
            ))}
        </nav>

        <div className="flex items-center gap-3 text-sm">
          <span className="font-medium">{user.username}</span>
          <span
            className={
              user.role === "admin"
                ? "rounded-full bg-amber-500/20 px-2 py-0.5 text-xs font-medium text-amber-300"
                : "rounded-full bg-sky-500/20 px-2 py-0.5 text-xs font-medium text-sky-300"
            }
          >
            {user.role.toUpperCase()}
          </span>
          <button
            onClick={onLogout}
            className="rounded-md px-2 py-1 text-slate-300 transition hover:bg-slate-700 hover:text-white"
          >
            Sign out
          </button>
        </div>
      </header>

      {/* POS body */}
      {safePage === "pos" && (
        <>
          <div className="flex min-h-0 flex-1">
            <ActiveTables
              tabs={tabs}
              selectedId={selectedId}
              onSelect={(id) => void handleSelect(id)}
              onNew={() => setNewTabOpen(true)}
            />

            <MenuGrid
              menu={menu}
              category={category}
              onCategory={setCategory}
              onAdd={(item) => void handleAdd(item)}
              canAdd={selectedId != null}
            />

            <CartPanel
              tab={selectedTab}
              lines={lines}
              onQuantity={(line, qty) => void handleQuantity(line, qty)}
              onRemove={(line) => void handleRemove(line)}
              onCheckout={() => setCheckoutOpen(true)}
            />
          </div>

          {/* Modals */}
          {newTabOpen && (
            <NewTabModal
              onClose={() => setNewTabOpen(false)}
              onSubmit={handleCreateTab}
            />
          )}
          {checkoutOpen && selectedTab && (
            <CheckoutModal
              tab={selectedTab}
              lines={lines}
              onClose={() => setCheckoutOpen(false)}
              onConfirm={handleCheckoutConfirm}
            />
          )}
        </>
      )}

      {safePage === "reports" && <Reports user={user} notify={showFlash} />}
      {safePage === "menu" && <MenuAdmin user={user} notify={showFlash} />}
      {safePage === "users" && <UsersAdmin user={user} notify={showFlash} />}
      {safePage === "settings" && (
        <Settings user={user} notify={showFlash} onRestored={onLogout} />
      )}

      {/* Flash toast */}
      {flash && (
        <div
          className={`fixed right-4 top-4 z-[60] max-w-sm rounded-xl px-4 py-2.5 text-sm font-medium text-white shadow-xl ${
            flash.kind === "error" ? "bg-red-600" : "bg-emerald-600"
          }`}
        >
          {flash.msg}
        </div>
      )}
    </div>
  );
}
