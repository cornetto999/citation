import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Check, ClipboardList, LoaderCircle, Plus } from "lucide-react";
import { toast } from "sonner";
import { useAuthStore } from "@/store/useAuthStore";
import { receiptDate } from "@/lib/receipt";
import { treasuryRequest } from "@/lib/treasury-client";
import { RecordPager, WorkflowFeedback } from "@/components/WorkflowFeedback";

interface FollowUpTask {
  id: string;
  ticketId: string;
  note: string;
  dueAt: string;
  status: "open" | "done";
  createdAt: string;
}

export function FollowUpQueue() {
  const user = useAuthStore((state) => state.user);
  const queryClient = useQueryClient();
  const [ticketId, setTicketId] = useState("");
  const [note, setNote] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [view, setView] = useState<"open" | "done">("open");
  const [page, setPage] = useState(1);
  const [saving, setSaving] = useState(false);
  const [completing, setCompleting] = useState<string | null>(null);
  const [error, setError] = useState("");
  const tasks = useQuery({
    queryKey: ["workflow", "followups", view, page],
    queryFn: ({ signal }) =>
      treasuryRequest<{
        tasks: FollowUpTask[];
        total: number;
        page: number;
        pageSize: number;
        openCount: number;
        doneCount: number;
      }>(`followups?state=${view}&page=${page}&pageSize=25`, { signal }),
  });
  const canSave = Boolean(
    ticketId.trim() &&
    note.trim().length >= 3 &&
    dueAt &&
    Number.isFinite(new Date(`${dueAt}:00+08:00`).getTime()),
  );
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ["workflow", "followups"] });
  const create = async () => {
    if (!canSave || saving) return;
    setSaving(true);
    setError("");
    try {
      await treasuryRequest("followups", {
        method: "POST",
        body: JSON.stringify({
          ticketId: ticketId.trim(),
          note: note.trim(),
          dueAt: new Date(`${dueAt}:00+08:00`).toISOString(),
        }),
      });
      setTicketId("");
      setNote("");
      setDueAt("");
      setView("open");
      setPage(1);
      await refresh();
      toast.success("Follow-up added to the staff queue.");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to add this follow-up.",
      );
    } finally {
      setSaving(false);
    }
  };
  const complete = async (task: FollowUpTask) => {
    if (completing) return;
    setCompleting(task.id);
    try {
      await treasuryRequest(`followups/${encodeURIComponent(task.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "done" }),
      });
      await refresh();
      if (tasks.data?.tasks.length === 1 && page > 1) setPage(page - 1);
      toast.success("Follow-up marked complete.");
    } catch (cause) {
      toast.error(
        cause instanceof Error
          ? cause.message
          : "Unable to update this follow-up.",
      );
    } finally {
      setCompleting(null);
    }
  };
  const rows = tasks.data?.tasks ?? [];
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold">Follow-up queue</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Assign a date and next step to a citation. Staff record contact
          outcomes here; no messages are sent automatically.
        </p>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void create();
        }}
        className="rounded-2xl border border-border bg-card p-5 shadow-panel"
      >
        <h2 className="mb-4 flex items-center gap-2 text-sm font-bold">
          <Plus className="size-4 text-primary-text" />
          Schedule a follow-up
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="followup-ticket" className="text-xs font-semibold">
              Citation number
            </label>
            <input
              id="followup-ticket"
              required
              maxLength={100}
              value={ticketId}
              onChange={(e) => setTicketId(e.target.value)}
              placeholder="CTN-2026-0001"
              disabled={saving}
              className="mt-2 h-11 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div>
            <label htmlFor="followup-due" className="text-xs font-semibold">
              Follow up at (Philippine time)
            </label>
            <input
              id="followup-due"
              type="datetime-local"
              required
              value={dueAt}
              onChange={(e) => setDueAt(e.target.value)}
              disabled={saving}
              className="mt-2 h-11 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="followup-note" className="text-xs font-semibold">
              Next step / staff note
            </label>
            <textarea
              id="followup-note"
              required
              minLength={3}
              maxLength={2000}
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Describe the next step and any contact outcome to record."
              disabled={saving}
              className="mt-2 w-full rounded-xl border border-input bg-background p-3 text-sm outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
        </div>
        {error && (
          <p role="alert" className="mt-3 text-sm text-destructive">
            {error}
          </p>
        )}
        <button
          disabled={!canSave || saving}
          className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground disabled:opacity-40"
        >
          {saving && <LoaderCircle className="size-4 animate-spin" />}Add
          follow-up
        </button>
      </form>
      <div className="flex gap-2">
        {(["open", "done"] as const).map((status) => (
          <button
            key={status}
            onClick={() => {
              setView(status);
              setPage(1);
            }}
            aria-pressed={view === status}
            className={`min-h-10 rounded-full px-4 text-sm font-semibold ${view === status ? "bg-primary text-primary-foreground" : "border border-border bg-card"}`}
          >
            {status === "open" ? "Open" : "Completed"} ·{" "}
            {status === "open"
              ? (tasks.data?.openCount ?? "—")
              : (tasks.data?.doneCount ?? "—")}
          </button>
        ))}
      </div>
      <WorkflowFeedback
        loading={tasks.isFetching}
        updatedAt={tasks.dataUpdatedAt}
        error={tasks.error}
        onRetry={() => void tasks.refetch()}
      />
      <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-panel">
        {tasks.isLoading ? (
          <p
            role="status"
            className="p-12 text-center text-sm text-muted-foreground"
          >
            Loading follow-ups…
          </p>
        ) : tasks.isError ? (
          <div role="alert" className="p-5 text-sm">
            <p>{tasks.error.message}</p>
            <button
              onClick={() => void tasks.refetch()}
              className="mt-2 font-bold text-primary-text"
            >
              Retry
            </button>
          </div>
        ) : (
          <>
            <div className="divide-y divide-border">
              {rows.map((task) => (
                <div
                  key={task.id}
                  className="flex flex-wrap items-start justify-between gap-4 p-5"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-mono text-sm font-bold">
                        {task.ticketId}
                      </p>
                      {task.status === "open" &&
                        new Date(task.dueAt).getTime() < Date.now() && (
                          <span className="rounded-full bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700">
                            Due for follow-up
                          </span>
                        )}
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-sm">
                      {task.note}
                    </p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      Due {receiptDate(task.dueAt)} · Philippine time
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {user?.role === "admin" ? (
                      <Link
                        to="/admin/citations"
                        search={{ citation: task.ticketId }}
                        className="inline-flex min-h-10 items-center rounded-xl border border-border px-3 text-xs font-semibold text-primary-text"
                      >
                        Review citation
                      </Link>
                    ) : (
                      <Link
                        to="/treasury/cashier"
                        search={{ ticket: task.ticketId }}
                        className="inline-flex min-h-10 items-center rounded-xl border border-border px-3 text-xs font-semibold text-primary-text"
                      >
                        Review citation
                      </Link>
                    )}
                    {task.status === "open" && (
                      <button
                        disabled={Boolean(completing)}
                        onClick={() => void complete(task)}
                        className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-primary/5 px-3 text-xs font-bold text-primary-text disabled:opacity-40"
                      >
                        {completing === task.id ? (
                          <LoaderCircle className="size-3.5 animate-spin" />
                        ) : (
                          <Check className="size-3.5" />
                        )}
                        Mark complete
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {rows.length === 0 && (
                <div className="p-12 text-center">
                  <ClipboardList className="mx-auto mb-3 size-8 text-primary-text/70" />
                  <p className="font-semibold">
                    No {view === "open" ? "open" : "completed"} follow-ups
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {view === "open"
                      ? "Add the next action for a citation above."
                      : "Completed follow-ups remain here for reference."}
                  </p>
                </div>
              )}
            </div>
            <RecordPager
              page={page}
              pageSize={25}
              total={tasks.data?.total ?? 0}
              loading={tasks.isFetching}
              onPage={setPage}
            />
          </>
        )}
      </section>
    </div>
  );
}
