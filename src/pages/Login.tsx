import { useState, type FormEvent } from "react";
import { api } from "../lib/api";
import type { SessionUser } from "../types";

export default function Login({ onLogin }: { onLogin: (u: SessionUser) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const user = await api.login(username.trim(), password);
      onLogin(user);
    } catch (err) {
      setError(typeof err === "string" ? err : "Login failed");
      setPassword("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-full items-center justify-center bg-white p-4">
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-md border border-slate-200 bg-white p-8"
      >
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-md bg-blue-700 text-xl font-bold text-white">
            रु
          </div>
          <h1 className="text-xl font-semibold text-slate-900">Billing POS</h1>
          <p className="mt-1 text-sm text-slate-500">Offline Point of Sale</p>
        </div>

        <label className="mb-1 block text-sm font-medium text-slate-700">
          Username
        </label>
        <input
          autoFocus
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="mb-4 w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
          placeholder="Enter username"
          autoComplete="username"
        />

        <label className="mb-1 block text-sm font-medium text-slate-700">
          Password
        </label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mb-4 w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
          placeholder="Enter password"
          autoComplete="current-password"
        />

        {error && (
          <div className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={busy || !username || !password}
          className="w-full rounded-md bg-blue-700 py-2 font-medium text-white transition hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? "Signing in…" : "Sign in"}
        </button>

        <p className="mt-4 text-center text-xs text-slate-400">
          100% offline · data stored locally
        </p>
      </form>
    </div>
  );
}
