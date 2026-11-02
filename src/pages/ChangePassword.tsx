import { useState, type FormEvent } from "react";
import { api } from "../lib/api";
import type { SessionUser } from "../types";

export default function ChangePassword({
  user,
  onChanged,
  onLogout,
}: {
  user: SessionUser;
  onChanged: () => void;
  onLogout: () => void;
}) {
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(null);
    if (newPassword.length < 4) {
      setError("New password must be at least 4 characters");
      return;
    }
    if (newPassword !== confirm) {
      setError("New passwords do not match");
      return;
    }
    setBusy(true);
    try {
      await api.changePassword(user.id, oldPassword, newPassword);
      onChanged();
    } catch (err) {
      setError(typeof err === "string" ? err : "Failed to change password");
    } finally {
      setBusy(false);
    }
  }

  const inputCls =
    "mb-4 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200";

  return (
    <div className="flex min-h-full items-center justify-center bg-slate-900 p-4">
      <form onSubmit={submit} className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-2xl">
        <div className="mb-6 text-center">
          <h1 className="text-xl font-semibold text-slate-900">
            Change your password
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Welcome, {user.username}. You must set a new password before
            continuing.
          </p>
        </div>

        <label className="mb-1 block text-sm font-medium text-slate-700">
          Current password
        </label>
        <input
          type="password"
          autoFocus
          value={oldPassword}
          onChange={(e) => setOldPassword(e.target.value)}
          className={inputCls}
          placeholder="Current password"
          autoComplete="current-password"
        />

        <label className="mb-1 block text-sm font-medium text-slate-700">
          New password
        </label>
        <input
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          className={inputCls}
          placeholder="At least 4 characters"
          autoComplete="new-password"
        />

        <label className="mb-1 block text-sm font-medium text-slate-700">
          Confirm new password
        </label>
        <input
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className={inputCls}
          placeholder="Repeat new password"
          autoComplete="new-password"
        />

        {error && (
          <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={busy || !oldPassword || !newPassword || !confirm}
          className="w-full rounded-lg bg-indigo-600 py-2.5 font-medium text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? "Saving…" : "Set new password"}
        </button>

        <button
          type="button"
          onClick={onLogout}
          className="mt-3 w-full text-center text-sm text-slate-400 hover:text-slate-600"
        >
          Sign out instead
        </button>
      </form>
    </div>
  );
}
