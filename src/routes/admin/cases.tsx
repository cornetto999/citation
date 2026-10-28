import { useState } from "react";
import {
  createFileRoute,
  type SearchSchemaInput,
} from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ClipboardList, Plus, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import {
  PageHeader,
  SectionCard,
  EmptyState,
  ListSkeleton,
} from "@/components/kit";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { RecordPager, WorkflowFeedback } from "@/components/WorkflowFeedback";
import { TicketDetailsDialog } from "@/components/TicketDetailsDialog";
import { workflowParams, workflowRequest } from "@/lib/workflow-client";
import { shortDate, peso } from "@/lib/format";
import type { CitationCase, Ticket, User, PaymentException } from "@/types";

const states = ["all", "open", "in_review", "resolved"] as const;
const input =
  "min-h-11 w-full rounded-xl border border-input bg-card px-3 text-sm outline-none focus:ring-2 focus:ring-ring/30";
export const Route = createFileRoute("/admin/cases")({
  validateSearch: (raw: Record<string, unknown> & SearchSchemaInput) => ({
    view:
      raw["view"] === "exceptions" || raw["view"] === "contested"
        ? raw["view"]
        : ("cases" as "cases" | "exceptions" | "contested"),
    state: states.includes(raw["state"] as (typeof states)[number])
      ? (raw["state"] as (typeof states)[number])
      : "all",
    page: Math.max(1, Math.floor(Number(raw["page"]) || 1)),
  }),
  component: AdminCases,
});

function AdminCases() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const client = useQueryClient();
  const [selectedTicket, setSelectedTicket] = useState<string | null>(null);
  const [editor, setEditor] = useState<CitationCase | "new" | null>(null);
  const [ticketId, setTicketId] = useState("");
  const [reason, setReason] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [state, setState] = useState<CitationCase["state"]>("open");
  const [decision, setDecision] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const cases = useQuery({
    queryKey: ["workflow", "cases", search.state, search.page],
    queryFn: ({ signal }) =>
      workflowRequest<{ cases: CitationCase[]; total: number }>(
        `/api/workflow/cases?${workflowParams({ state: search.state, page: search.page, pageSize: 25 })}`,
        { signal },
      ),
    enabled: search.view === "cases",
  });
  const contested = useQuery({
    queryKey: ["workflow", "contested", search.page],
    queryFn: ({ signal }) =>
      workflowRequest<{ tickets: Ticket[]; total: number }>(
        `/api/workflow/tickets?status=Contested&page=${search.page}&pageSize=25`,
        { signal },
      ),
    enabled: search.view === "contested",
  });
  const exceptions = useQuery({
    queryKey: ["workflow", "exceptions", search.page],
    queryFn: ({ signal }) =>
      workflowRequest<{ exceptions: PaymentException[]; total: number }>(
        `/api/workflow/exceptions?page=${search.page}&pageSize=25`,
        { signal },
      ),
    enabled: search.view === "exceptions",
  });
  const staff = useQuery({
    queryKey: ["admin", "users"],
    queryFn: ({ signal }) =>
      workflowRequest<{ users: User[] }>("/api/admin/users", { signal }),
    enabled: !!editor,
    staleTime: 60_000,
  });
  const current =
    search.view === "cases"
      ? cases
      : search.view === "contested"
        ? contested
        : exceptions;
  const openEditor = (item: CitationCase | "new", citation = "") => {
    setEditor(item);
    setTicketId(item === "new" ? citation : item.ticketId);
    setReason(item === "new" ? "" : item.reason);
    setAssignedTo(item === "new" ? "" : item.assignedTo || "");
    setState(item === "new" ? "open" : item.state);
    setDecision(item === "new" ? "" : item.decision || "");
    setSaveError("");
  };
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editor || saving) return;
    setSaving(true);
    setSaveError("");
    try {
      await workflowRequest(
        editor === "new"
          ? "/api/workflow/cases"
          : `/api/workflow/cases/${encodeURIComponent(editor.id)}`,
        {
          method: editor === "new" ? "POST" : "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            editor === "new"
              ? {
                  ticketId: ticketId.trim(),
                  reason: reason.trim(),
                  assignedTo: assignedTo || undefined,
                }
              : {
                  state,
                  assignedTo: assignedTo || null,
                  decision: decision.trim(),
                },
          ),
        },
      );
      setEditor(null);
      toast.success("Review record saved.");
      await client.invalidateQueries({ queryKey: ["workflow"] });
    } catch (error) {
      setSaveError(
        error instanceof Error
          ? error.message
          : "Unable to save the review record.",
      );
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        eyebrow="Administrative follow-up"
        title="Case review"
        description="Assign follow-up, document submitted reasons, and track the next step."
        icon={ClipboardList}
        actions={
          <button
            onClick={() => openEditor("new")}
            className="flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground"
          >
            <Plus className="size-4" />
            Add review case
          </button>
        }
      />
      <div className="flex flex-wrap gap-2" aria-label="Case queues">
        {(
          [
            { view: "cases", label: "Review cases" },
            { view: "contested", label: "Contested citations" },
            { view: "exceptions", label: "Payment exceptions" },
          ] as const
        ).map((tab) => (
          <button
            key={tab.view}
            onClick={() =>
              void navigate({
                search: { ...search, view: tab.view, page: 1 },
                resetScroll: false,
              })
            }
            aria-pressed={search.view === tab.view}
            className={`min-h-11 rounded-xl px-4 text-sm font-semibold ${search.view === tab.view ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-secondary"}`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <WorkflowFeedback
        error={current.error}
        loading={current.isFetching}
        updatedAt={current.dataUpdatedAt}
        onRetry={() => void current.refetch()}
      />
      {search.view === "cases" && (
        <SectionCard
          title="Review work queue"
          description="Review completion records the administrative follow-up. It does not cancel fines or settle citations."
          actions={
            <label className="text-xs text-muted-foreground">
              Case state
              <select
                value={search.state}
                onChange={(event) =>
                  void navigate({
                    search: {
                      ...search,
                      state: event.target.value as typeof search.state,
                      page: 1,
                    },
                    resetScroll: false,
                  })
                }
                className="ml-2 min-h-10 rounded-lg border border-input bg-card px-3 text-sm"
              >
                {states.map((item) => (
                  <option key={item} value={item}>
                    {item === "all" ? "All states" : item.replace("_", " ")}
                  </option>
                ))}
              </select>
            </label>
          }
        >
          {cases.isPending ? (
            <ListSkeleton />
          ) : cases.data ? (
            <>
              <div className="divide-y divide-border">
                {cases.data.cases.map((item) => (
                  <article key={item.id} className="space-y-3 p-5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <button
                        onClick={() => setSelectedTicket(item.ticketId)}
                        className="min-h-9 font-mono text-sm font-semibold text-primary hover:underline"
                      >
                        {item.ticketId}
                      </button>
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${item.state === "resolved" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-800"}`}
                      >
                        {item.state.replace("_", " ")}
                      </span>
                    </div>
                    <p className="whitespace-pre-wrap break-words text-sm">
                      {item.reason}
                    </p>
                    {item.decision && (
                      <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
                        <strong>Review note: </strong>
                        {item.decision}
                      </p>
                    )}
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="text-xs text-muted-foreground">
                        Updated {shortDate(item.updatedAt)} ·{" "}
                        {item.assignedTo ? "Assigned" : "Unassigned"}
                      </p>
                      <button
                        onClick={() => openEditor(item)}
                        className="min-h-11 rounded-xl border border-border px-4 text-sm font-semibold hover:bg-muted"
                      >
                        Update review
                      </button>
                    </div>
                  </article>
                ))}
              </div>
              {!cases.data.cases.length && (
                <EmptyState
                  icon={ClipboardList}
                  title="No review cases in this queue"
                  description="Add a case or open a contested citation to document follow-up."
                />
              )}
              <RecordPager
                page={search.page}
                pageSize={25}
                total={cases.data.total}
                loading={cases.isFetching}
                onPage={(page) =>
                  void navigate({
                    search: { ...search, page },
                    resetScroll: false,
                  })
                }
              />
            </>
          ) : (
            <EmptyState
              icon={ClipboardList}
              title="Review queue unavailable"
              description="Retry above to load cases."
            />
          )}
        </SectionCard>
      )}
      {search.view === "contested" && (
        <SectionCard
          title="Contested citations"
          description="Open the citation and record the submitted reason before assigning a reviewer."
        >
          {contested.isPending ? (
            <ListSkeleton />
          ) : contested.data ? (
            <>
              <div className="divide-y divide-border">
                {contested.data.tickets.map((ticket) => (
                  <article
                    key={ticket.id}
                    className="flex flex-wrap items-center justify-between gap-4 p-5"
                  >
                    <div>
                      <button
                        onClick={() => setSelectedTicket(ticket.id)}
                        className="min-h-9 font-mono text-sm font-semibold text-primary hover:underline"
                      >
                        {ticket.id}
                      </button>
                      <p className="text-sm font-medium">
                        {ticket.plateNo} · {ticket.violatorName}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {peso(ticket.totalFine)} · Issued{" "}
                        {shortDate(ticket.issuedAt)}
                      </p>
                    </div>
                    <button
                      onClick={() => openEditor("new", ticket.id)}
                      className="min-h-11 rounded-xl border border-border px-4 text-sm font-semibold hover:bg-muted"
                    >
                      Record review
                    </button>
                  </article>
                ))}
              </div>
              {!contested.data.tickets.length && (
                <EmptyState
                  icon={ClipboardList}
                  title="No contested citations"
                />
              )}
              <RecordPager
                page={search.page}
                pageSize={25}
                total={contested.data.total}
                loading={contested.isFetching}
                onPage={(page) =>
                  void navigate({
                    search: { ...search, page },
                    resetScroll: false,
                  })
                }
              />
            </>
          ) : (
            <EmptyState
              icon={ClipboardList}
              title="Contested citations unavailable"
            />
          )}
        </SectionCard>
      )}
      {search.view === "exceptions" && (
        <SectionCard
          title="Payment exceptions"
          description="Treasury investigates and reconciles these records. Review the original citation before following up."
        >
          {exceptions.isPending ? (
            <ListSkeleton />
          ) : exceptions.data ? (
            <>
              <div className="divide-y divide-border">
                {exceptions.data.exceptions.map((item) => (
                  <article key={item.id} className="space-y-2 p-5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <button
                        onClick={() => setSelectedTicket(item.ticketId)}
                        className="min-h-9 font-mono text-sm font-semibold text-primary hover:underline"
                      >
                        {item.ticketId}
                      </button>
                      <span className="text-xs font-semibold capitalize text-muted-foreground">
                        {item.status}
                      </span>
                    </div>
                    <p className="text-sm">{item.reason}</p>
                    <p className="text-xs text-muted-foreground">
                      {shortDate(item.createdAt)}
                      {item.providerReference
                        ? ` · Reference ${item.providerReference}`
                        : ""}
                    </p>
                  </article>
                ))}
              </div>
              {!exceptions.data.exceptions.length && (
                <EmptyState
                  icon={ShieldAlert}
                  title="No payment exceptions"
                  description="No unresolved collection records were returned by the server."
                />
              )}
              <RecordPager
                page={search.page}
                pageSize={25}
                total={exceptions.data.total}
                loading={exceptions.isFetching}
                onPage={(page) =>
                  void navigate({
                    search: { ...search, page },
                    resetScroll: false,
                  })
                }
              />
            </>
          ) : (
            <EmptyState
              icon={ShieldAlert}
              title="Payment exceptions unavailable"
              description="Retry above; an unavailable queue does not mean there are no exceptions."
            />
          )}
        </SectionCard>
      )}
      <TicketDetailsDialog
        ticketId={selectedTicket}
        onClose={() => setSelectedTicket(null)}
      />
      <Dialog
        open={!!editor}
        onOpenChange={(open) => {
          if (!open && !saving) setEditor(null);
        }}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editor === "new" ? "Add review case" : "Update review"}
            </DialogTitle>
            <DialogDescription>
              Keep the submitted reason and review notes in the activity record.
              Review status does not change the citation fine or payment status.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={save} className="space-y-4">
            <fieldset disabled={saving} className="space-y-4">
              <label className="block space-y-1.5 text-xs font-semibold text-muted-foreground">
                Citation number
                <input
                  required
                  readOnly={editor !== "new"}
                  value={ticketId}
                  onChange={(event) => setTicketId(event.target.value)}
                  className={input}
                />
              </label>
              <label className="block space-y-1.5 text-xs font-semibold text-muted-foreground">
                Submitted reason
                <textarea
                  required
                  minLength={3}
                  readOnly={editor !== "new"}
                  rows={3}
                  maxLength={2000}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  className={`${input} py-3`}
                />
              </label>
              <label className="block space-y-1.5 text-xs font-semibold text-muted-foreground">
                Assigned reviewer
                <select
                  value={assignedTo}
                  onChange={(event) => setAssignedTo(event.target.value)}
                  className={input}
                >
                  <option value="">Unassigned</option>
                  {assignedTo &&
                    !staff.data?.users.some(
                      (user) =>
                        user.id === assignedTo &&
                        user.active !== false &&
                        user.role !== "violator",
                    ) && (
                      <option value={assignedTo}>
                        Current reviewer (inactive or unavailable)
                      </option>
                    )}
                  {staff.data?.users
                    .filter(
                      (user) =>
                        user.active !== false && user.role !== "violator",
                    )
                    .map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.name} · {user.role}
                      </option>
                    ))}
                </select>
              </label>
              {staff.error && (
                <p role="alert" className="text-xs text-destructive">
                  Staff list unavailable. You can save this case without
                  changing its assignment.
                </p>
              )}
              {editor !== "new" && (
                <>
                  <label className="block space-y-1.5 text-xs font-semibold text-muted-foreground">
                    Review state
                    <select
                      value={state}
                      onChange={(event) =>
                        setState(event.target.value as CitationCase["state"])
                      }
                      className={input}
                    >
                      <option value="open">Open</option>
                      <option value="in_review">In review</option>
                      <option value="resolved">Review complete</option>
                    </select>
                  </label>
                  <label className="block space-y-1.5 text-xs font-semibold text-muted-foreground">
                    Review note and next step
                    <textarea
                      required={state === "resolved"}
                      rows={4}
                      maxLength={2000}
                      value={decision}
                      onChange={(event) => setDecision(event.target.value)}
                      className={`${input} py-3`}
                      placeholder="Document what was reviewed and the next authorized step."
                    />
                  </label>
                </>
              )}
            </fieldset>
            {saveError && (
              <p
                role="alert"
                className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive"
              >
                {saveError}
              </p>
            )}
            <div className="flex justify-end gap-3">
              <button
                type="button"
                disabled={saving}
                onClick={() => setEditor(null)}
                className="min-h-11 rounded-xl border border-border px-4 text-sm font-semibold disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                disabled={
                  saving ||
                  !ticketId.trim() ||
                  !reason.trim() ||
                  (editor !== "new" && state === "resolved" && !decision.trim())
                }
                className="min-h-11 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save review"}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
