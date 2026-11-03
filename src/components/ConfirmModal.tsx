import { useState, type ReactNode } from "react";
import Modal from "./Modal";

/** Shared destructive-action confirmation dialog. */
export default function ConfirmModal({
  title,
  message,
  confirmLabel = "Delete",
  danger = true,
  onClose,
  onConfirm,
}: {
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function confirm() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
    } catch (e) {
      setError(typeof e === "string" ? e : "Action failed");
      setBusy(false);
    }
  }

  return (
    <Modal title={title} onClose={onClose}>
      <div className="mb-4 text-sm text-slate-600">{message}</div>

      {error && (
        <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
          {error}
        </div>
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
          onClick={() => void confirm()}
          disabled={busy}
          className={`flex-1 rounded-lg py-2.5 font-semibold text-white transition disabled:opacity-50 ${
            danger
              ? "bg-red-600 hover:bg-red-500"
              : "bg-emerald-600 hover:bg-emerald-500"
          }`}
        >
          {busy ? "Working…" : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
