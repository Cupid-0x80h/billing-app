import { useEffect, useState } from "react";
import { api } from "../lib/api";
import Modal from "../components/Modal";
import type { Role, SessionUser, UserRecord } from "../types";

type Kind = "error" | "success";

/** Section 2.3 — Admin management of user accounts. */
export default function UsersAdmin({
  user,
  notify,
}: {
  user: SessionUser;
  notify: (kind: Kind, msg: string) => void;
}) {
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [adding, setAdding] = useState(false);
  const [resetting, setResetting] = useState<UserRecord | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  async function load() {
    try {
      setUsers(await api.listUsers(user.id));
    } catch (e) {
      notify("error", typeof e === "string" ? e : "Failed to load users");
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function toggleRole(target: UserRecord) {
    const next: Role = target.role === "admin" ? "staff" : "admin";
    try {
      await api.setUserRole(user.id, target.id, next);
      notify("success", `${target.username} is now ${next}`);
      await load();
    } catch (e) {
      notify("error", typeof e === "string" ? e : "Failed to change role");
    }
  }

  async function doDelete(target: UserRecord) {
    try {
      await api.deleteUser(user.id, target.id);
      notify("success", `User ${target.username} deleted`);
      setConfirmDeleteId(null);
      await load();
    } catch (e) {
      notify("error", typeof e === "string" ? e : "Failed to delete user");
      setConfirmDeleteId(null);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-slate-100">
      <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-2.5">
        <div>
          <h2 className="text-sm font-semibold text-slate-700">User Management</h2>
          <p className="text-xs text-slate-400">{users.length} accounts</p>
        </div>
        <button
          onClick={() => setAdding(true)}
          className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-indigo-500"
        >
          + Add user
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-4">
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2.5 font-medium">Username</th>
                <th className="px-3 py-2.5 font-medium">Role</th>
                <th className="px-3 py-2.5 font-medium">Password status</th>
                <th className="px-3 py-2.5 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map((u) => {
                const isSelf = u.id === user.id;
                return (
                  <tr key={u.id} className="hover:bg-slate-50">
                    <td className="px-3 py-2 font-medium text-slate-800">
                      {u.username}
                      {isSelf && <span className="ml-1.5 text-xs text-slate-400">(you)</span>}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          u.role === "admin"
                            ? "bg-amber-50 text-amber-700"
                            : "bg-sky-50 text-sky-700"
                        }`}
                      >
                        {u.role}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-slate-500">
                      {u.mustChangePassword ? (
                        <span className="text-amber-600">change required at next login</span>
                      ) : (
                        "set"
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex justify-end gap-1.5">
                        <button
                          onClick={() => void toggleRole(u)}
                          className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-100"
                        >
                          Make {u.role === "admin" ? "staff" : "admin"}
                        </button>
                        <button
                          onClick={() => setResetting(u)}
                          className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-100"
                        >
                          Reset password
                        </button>
                        {confirmDeleteId === u.id ? (
                          <span className="inline-flex items-center gap-1">
                            <button
                              onClick={() => void doDelete(u)}
                              className="rounded-lg bg-red-600 px-2 py-1 text-xs font-semibold text-white transition hover:bg-red-500"
                            >
                              Sure? Yes
                            </button>
                            <button
                              onClick={() => setConfirmDeleteId(null)}
                              className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100"
                            >
                              No
                            </button>
                          </span>
                        ) : (
                          <button
                            disabled={isSelf}
                            onClick={() => setConfirmDeleteId(u.id)}
                            title={isSelf ? "You cannot delete your own account" : undefined}
                            className="rounded-lg border border-red-200 px-2.5 py-1 text-xs font-medium text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-slate-400">
          Users with transaction history cannot be deleted — demote them to staff
          instead. The last admin can never be demoted.
        </p>
      </div>

      {adding && (
        <AddUserModal
          onClose={() => setAdding(false)}
          onCreated={async (username) => {
            notify("success", `User ${username} created`);
            setAdding(false);
            await load();
          }}
          actorId={user.id}
        />
      )}
      {resetting && (
        <ResetPasswordModal
          target={resetting}
          actorId={user.id}
          onClose={() => setResetting(null)}
          onDone={async () => {
            notify("success", `Password reset for ${resetting.username}`);
            setResetting(null);
            await load();
          }}
        />
      )}
    </div>
  );
}

function AddUserModal({
  actorId,
  onClose,
  onCreated,
}: {
  actorId: number;
  onClose: () => void;
  onCreated: (username: string) => Promise<void>;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("staff");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const inputCls =
    "w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200";

  async function submit() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.createUser(actorId, username.trim(), password, role);
      await onCreated(username.trim());
    } catch (e) {
      setError(typeof e === "string" ? e : "Failed to create user");
      setBusy(false);
    }
  }

  return (
    <Modal title="Add user" onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Username</label>
          <input
            autoFocus
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="min 3 characters"
            maxLength={30}
            className={inputCls}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="min 4 characters"
            className={inputCls}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Role</label>
          <div className="grid grid-cols-2 gap-2">
            {(["staff", "admin"] as Role[]).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRole(r)}
                className={`rounded-xl border-2 px-2 py-2 text-sm font-medium transition ${
                  role === r
                    ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                    : "border-slate-200 text-slate-500 hover:bg-slate-50"
                }`}
              >
                {r === "admin" ? "Admin — full access" : "Staff — POS only"}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>
        )}

        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg border border-slate-300 py-2.5 font-medium text-slate-600 transition hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={busy || !username.trim() || !password}
            className="flex-1 rounded-lg bg-indigo-600 py-2.5 font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-50"
          >
            {busy ? "Creating…" : "Create user"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function ResetPasswordModal({
  target,
  actorId,
  onClose,
  onDone,
}: {
  target: UserRecord;
  actorId: number;
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.resetUserPassword(actorId, target.id, password);
      await onDone();
    } catch (e) {
      setError(typeof e === "string" ? e : "Failed to reset password");
      setBusy(false);
    }
  }

  return (
    <Modal
      title={`Reset password — ${target.username}`}
      subtitle="They will be asked to set a new password at their next login."
      onClose={onClose}
    >
      <input
        type="password"
        autoFocus
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="New temporary password"
        className="mb-3 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
      />
      {error && (
        <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onClose}
          className="flex-1 rounded-lg border border-slate-300 py-2.5 font-medium text-slate-600 transition hover:bg-slate-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => void submit()}
          disabled={busy || password.length < 4}
          className="flex-1 rounded-lg bg-indigo-600 py-2.5 font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-50"
        >
          {busy ? "Saving…" : "Reset password"}
        </button>
      </div>
    </Modal>
  );
}
