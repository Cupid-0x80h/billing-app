/** Format an amount in Nepali Rupees (रु). */
export function npr(amount: number): string {
  return (
    "रु " +
    amount.toLocaleString("en-IN", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    })
  );
}

/**
 * SQLite stores CURRENT_TIMESTAMP as UTC "YYYY-MM-DD HH:MM:SS".
 * Convert to a local time string like "14:05".
 */
export function localTime(utc: string | null | undefined): string {
  if (!utc) return "";
  try {
    const d = new Date(utc.replace(" ", "T") + "Z");
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

/** Parse a user-entered amount; returns NaN when invalid. */
export function parseAmount(s: string): number {
  const n = Number(s.trim());
  return s.trim() === "" || Number.isNaN(n) ? NaN : n;
}

/** Round to 2 decimal places (paisa). */
export function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Today's date in LOCAL time as "YYYY-MM-DD" (for date inputs & filters). */
export function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

/** Filesystem-safe timestamp for backup filenames, e.g. 20261102-1435. */
export function fileStamp(): string {
  const d = new Date();
  return `${localToday().replace(/-/g, "")}-${String(d.getHours()).padStart(2, "0")}${String(
    d.getMinutes(),
  ).padStart(2, "0")}`;
}
