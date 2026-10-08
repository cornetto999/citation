export const peso = (amount: number) =>
  new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 2,
  }).format(amount);

export const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

export const dateTime = (iso: string) =>
  new Date(iso).toLocaleString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

export const timeOnly = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-PH", {
    hour: "numeric",
    minute: "2-digit",
  });

export const daysUntil = (iso: string) =>
  Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000);

/** YYYY-MM-DD in the user's local timezone (not UTC). */
export const localDateKey = (d: Date | string) => {
  const date = typeof d === "string" ? new Date(d) : d;
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

export const isToday = (iso: string) =>
  localDateKey(iso) === localDateKey(new Date());

/** "just now", "5 min ago", "3 h ago", "2 d ago" */
export const relativeTime = (iso: string) => {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.round(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d} d ago`;
  return shortDate(iso);
};

/** Human-friendly due-date hint for unpaid tickets. */
export const dueHint = (iso: string) => {
  const d = daysUntil(iso);
  if (d < 0)
    return {
      text: `${Math.abs(d)} day${d === -1 ? "" : "s"} overdue`,
      late: true,
    };
  if (d === 0) return { text: "Due today", late: false };
  return { text: `${d} day${d === 1 ? "" : "s"} left`, late: false };
};

/** Build and download a CSV file with proper escaping. */
export const downloadCsv = (
  filename: string,
  headers: string[],
  rows: (string | number | null | undefined)[][],
) => {
  const escape = (v: string | number | null | undefined) => {
    const s = v == null ? "" : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [headers, ...rows]
    .map((r) => r.map(escape).join(","))
    .join("\r\n");
  // BOM so Excel opens ₱ and accented names correctly
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};
