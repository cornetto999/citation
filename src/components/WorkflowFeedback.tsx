import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
} from "lucide-react";

export function WorkflowFeedback({
  error,
  loading,
  updatedAt,
  onRetry,
}: {
  error?: Error | null;
  loading: boolean;
  updatedAt?: number;
  onRetry: () => void;
}) {
  return (
    <div
      className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground"
      aria-live="polite"
    >
      <span
        className={
          error
            ? "flex items-center gap-2 text-destructive"
            : "flex items-center gap-2"
        }
      >
        {error ? (
          <AlertCircle className="size-4 shrink-0" />
        ) : (
          <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
        )}
        {error
          ? error.message
          : loading
            ? "Refreshing records…"
            : updatedAt
              ? `Updated ${new Date(updatedAt).toLocaleTimeString("en-PH", { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit" })} · Philippine time`
              : "Loading records…"}
      </span>
      <button
        type="button"
        onClick={onRetry}
        disabled={loading}
        className="min-h-9 rounded-lg border border-border px-3 font-semibold hover:bg-muted disabled:opacity-50"
      >
        {error ? "Retry" : "Refresh"}
      </button>
    </div>
  );
}

export function RecordPager({
  page,
  pageSize,
  total,
  loading,
  onPage,
}: {
  page: number;
  pageSize: number;
  total: number;
  loading: boolean;
  onPage: (page: number) => void;
}) {
  const last = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-4 text-sm">
      <p className="text-muted-foreground">
        {total
          ? `${Math.min((page - 1) * pageSize + 1, total)}–${Math.min(page * pageSize, total)} of ${total.toLocaleString()} records`
          : "0 records"}
      </p>
      <div className="flex items-center gap-2">
        <button
          aria-label="Previous page"
          disabled={loading || page <= 1}
          onClick={() => onPage(page - 1)}
          className="flex min-h-11 items-center rounded-lg border border-border px-3 hover:bg-muted disabled:opacity-40"
        >
          <ChevronLeft className="size-4" />
        </button>
        <span className="px-2 tabular-nums">
          Page {page} of {last}
        </span>
        <button
          aria-label="Next page"
          disabled={loading || page >= last}
          onClick={() => onPage(page + 1)}
          className="flex min-h-11 items-center rounded-lg border border-border px-3 hover:bg-muted disabled:opacity-40"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>
    </div>
  );
}
