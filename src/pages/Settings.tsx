import { useEffect, useState } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { api } from "../lib/api";
import { fileStamp } from "../lib/format";
import Modal from "../components/Modal";
import type { DatabaseInfo, SessionUser } from "../types";

type Kind = "error" | "success";

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

/** Your added feature — one-click backup / restore (admin only). */
export default function Settings({
  user,
  notify,
  onRestored,
}: {
  user: SessionUser;
  notify: (kind: Kind, msg: string) => void;
  onRestored: () => void;
}) {
  const [info, setInfo] = useState<DatabaseInfo | null>(null);
  const [busy, setBusy] = useState<null | "backup" | "restore">(null);
  const [confirmPath, setConfirmPath] = useState<string | null>(null);

  async function loadInfo() {
    try {
      setInfo(await api.databaseInfo(user.id));
    } catch (e) {
      notify("error", typeof e === "string" ? e : "Failed to read database info");
    }
  }

  useEffect(() => {
    void loadInfo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function doBackup() {
    if (busy) return;
    try {
      const dest = await save({
        title: "Backup database",
        defaultPath: `billing-backup-${fileStamp()}.db`,
        filters: [{ name: "SQLite Database", extensions: ["db"] }],
      });
      if (!dest) return; // user cancelled
      setBusy("backup");
      await api.backupDatabase(user.id, dest);
      notify("success", `Backup saved to ${dest}`);
      await loadInfo();
    } catch (e) {
      notify("error", typeof e === "string" ? e : "Backup failed");
    } finally {
      setBusy(null);
    }
  }

  async function pickRestore() {
    if (busy) return;
    try {
      const picked = await open({
        title: "Restore database from backup",
        multiple: false,
        filters: [{ name: "SQLite Database", extensions: ["db"] }],
      });
      if (!picked || typeof picked !== "string") return;
      setConfirmPath(picked);
    } catch (e) {
      notify("error", typeof e === "string" ? e : "Could not open file picker");
    }
  }

  async function doRestore() {
    if (!confirmPath || busy) return;
    setBusy("restore");
    try {
      await api.restoreDatabase(user.id, confirmPath);
      notify("success", "Database restored — please sign in again");
      setConfirmPath(null);
      onRestored(); // force logout: session may not exist in restored data
    } catch (e) {
      notify("error", typeof e === "string" ? e : "Restore failed");
      setConfirmPath(null);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="min-h-0 flex-1 overflow-auto bg-slate-100 p-6">
      <div className="mx-auto max-w-2xl space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Settings & Data</h2>
          <p className="text-sm text-slate-500">
            Everything is stored locally. No data ever leaves this machine.
          </p>
        </div>

        {/* Database info */}
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-400">
            Database
          </div>
          <div className="mt-1.5 break-all font-mono text-sm text-slate-700">
            {info?.path ?? "…"}
          </div>
          <div className="mt-1 text-sm text-slate-500">
            {info ? fmtBytes(info.sizeBytes) : ""}
          </div>
        </div>

        {/* Backup */}
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="font-semibold text-slate-800">Backup</div>
              <p className="mt-0.5 text-sm text-slate-500">
                Saves a consistent snapshot of the whole database to a location of
                your choice (USB drive, network share, …).
              </p>
            </div>
            <button
              onClick={() => void doBackup()}
              disabled={busy !== null}
              className="shrink-0 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-50"
            >
              {busy === "backup" ? "Backing up…" : "Backup now…"}
            </button>
          </div>
        </div>

        {/* Restore */}
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="font-semibold text-amber-800">Restore</div>
              <p className="mt-0.5 text-sm text-amber-700">
                Replaces <b>all current data</b> with the contents of a backup
                file. You will be signed out afterwards. This cannot be undone.
              </p>
            </div>
            <button
              onClick={() => void pickRestore()}
              disabled={busy !== null}
              className="shrink-0 rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-amber-500 disabled:opacity-50"
            >
              {busy === "restore" ? "Restoring…" : "Restore from file…"}
            </button>
          </div>
        </div>
      </div>

      {confirmPath && (
        <Modal
          title="Replace all data?"
          subtitle="This cannot be undone"
          onClose={() => setConfirmPath(null)}
        >
          <p className="mb-1 text-sm text-slate-600">
            The current database will be replaced with:
          </p>
          <p className="mb-4 break-all rounded-lg bg-slate-100 p-2.5 font-mono text-xs text-slate-700">
            {confirmPath}
          </p>
          <p className="mb-4 text-sm text-red-600">
            Any transactions made after this backup was taken will be lost.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setConfirmPath(null)}
              className="flex-1 rounded-lg border border-slate-300 py-2.5 font-medium text-slate-600 transition hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void doRestore()}
              disabled={busy !== null}
              className="flex-1 rounded-lg bg-red-600 py-2.5 font-semibold text-white transition hover:bg-red-500 disabled:opacity-50"
            >
              {busy === "restore" ? "Restoring…" : "Yes, restore"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
