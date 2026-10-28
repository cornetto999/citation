import {
  Link,
  createFileRoute,
  type SearchSchemaInput,
} from "@tanstack/react-router";
import { CalendarDays, ClipboardList, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { EnforcerSidebar } from "@/components/EnforcerSidebar";
import { StatusBadge } from "@/components/StatusBadge";
import { CitationSlipButton } from "@/components/CitationSlipButton";
import { TicketDetailsDialog } from "@/components/TicketDetailsDialog";
import { RecordPager, WorkflowFeedback } from "@/components/WorkflowFeedback";
import { FilterChips, ListSkeleton } from "@/components/kit";
import { dateTime, peso, localDateKey } from "@/lib/format";
import { workflowParams, workflowRequest } from "@/lib/workflow-client";
import { readCitationDraft } from "@/lib/citation-drafts";
import { useAuthStore } from "@/store/useAuthStore";
import type { Ticket, TicketStatus } from "@/types";

const statuses = ["All", "Unpaid", "Overdue", "Paid", "Contested"] as const;
type SearchState = {
  query: string;
  status: "All" | TicketStatus;
  range: "all" | "today" | "7-days" | "1-month";
  page: number;
  citation: string;
};
export const Route = createFileRoute("/enforcer/citations")({
  head: () => ({ meta: [{ title: "My Citations | Traffic Enforcer" }] }),
  validateSearch: (
    raw: Record<string, unknown> & SearchSchemaInput,
  ): SearchState => ({
    query: typeof raw["query"] === "string" ? raw["query"] : "",
    status: statuses.includes(raw["status"] as SearchState["status"])
      ? (raw["status"] as SearchState["status"])
      : "All",
    range:
      raw["range"] === "today" ||
      raw["range"] === "7-days" ||
      raw["range"] === "1-month"
        ? raw["range"]
        : "all",
    page: Math.max(1, Math.floor(Number(raw["page"]) || 1)),
    citation: typeof raw["citation"] === "string" ? raw["citation"] : "",
  }),
  component: EnforcerCitationsPage,
});

function EnforcerCitationsPage() {
  const user = useAuthStore((s) => s.user);
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const [query, setQuery] = useState(search.query);
  const [hasDraft, setHasDraft] = useState(false);
  useEffect(() => setQuery(search.query), [search.query]);
  useEffect(() => {
    if (user) setHasDraft(Boolean(readCitationDraft(user.key)));
  }, [user]);
  const change = (next: Partial<SearchState>) =>
    void navigate({ search: { ...search, ...next }, resetScroll: false });
  const today = localDateKey(new Date());
  const date = new Date(`${today}T12:00:00+08:00`);
  if (search.range === "7-days") date.setUTCDate(date.getUTCDate() - 6);
  if (search.range === "1-month") date.setUTCMonth(date.getUTCMonth() - 1);
  const filters = {
    query: search.query,
    status: search.status,
    page: search.page,
    pageSize: 20,
    from: search.range === "all" ? "" : localDateKey(date),
    to: search.range === "all" ? "" : today,
  };
  const result = useQuery({
    queryKey: ["workflow", "my-citations", user?.key, filters],
    queryFn: ({ signal }) =>
      workflowRequest<{ tickets: Ticket[]; total: number; pageSize: number }>(
        `/api/workflow/tickets?${workflowParams(filters)}`,
        { signal },
      ),
    enabled: user?.role === "enforcer",
    staleTime: 15_000,
  });
  if (!user || user.role !== "enforcer") return null;

  return (
    <AppShell
      title="My Citations"
      subtitle="Issued citation history"
      operator={user.name}
      unit={`Badge ${user.credential}`}
      accessLabel="Enforcer"
      sidebar={<EnforcerSidebar />}
      className="max-w-3xl pb-10"
    >
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-xl font-bold">
              My citation register
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Newest first · dates use Philippine time
            </p>
          </div>
          <Link
            to="/enforcer/new"
            className="inline-flex min-h-11 items-center rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground"
          >
            New citation
          </Link>
        </div>
        {hasDraft && (
          <Link
            to="/enforcer/new"
            className="block rounded-xl border border-amber-400/40 bg-amber-500/10 p-4 text-sm"
          >
            <strong>Saved draft — not issued</strong>
            <span className="mt-1 block">
              Resume or discard your private-device draft.
            </span>
          </Link>
        )}
        <form
          onSubmit={(event) => {
            event.preventDefault();
            change({ query, page: 1 });
          }}
          className="flex flex-col gap-3 sm:flex-row"
        >
          <label className="relative flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Ticket, plate, driver or license…"
              aria-label="Search my citations"
              className="h-12 w-full rounded-xl border border-input bg-card pl-10 pr-4 text-sm outline-none focus:ring-2 focus:ring-ring/30"
            />
          </label>
          <button
            type="submit"
            className="min-h-12 rounded-xl border border-border bg-card px-4 text-sm font-semibold"
          >
            Search
          </button>
          <label className="relative">
            <CalendarDays className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <select
              value={search.range}
              onChange={(event) =>
                change({
                  range: event.target.value as SearchState["range"],
                  page: 1,
                })
              }
              aria-label="Issued date range"
              className="h-12 w-full rounded-xl border border-input bg-card pl-9 pr-8 text-sm"
            >
              <option value="all">All time</option>
              <option value="today">Today</option>
              <option value="7-days">Last 7 days</option>
              <option value="1-month">Last month</option>
            </select>
          </label>
        </form>
        <FilterChips
          options={statuses}
          value={search.status}
          onChange={(status) => change({ status, page: 1 })}
        />
        <WorkflowFeedback
          error={result.error}
          loading={result.isFetching}
          updatedAt={result.dataUpdatedAt}
          onRetry={() => void result.refetch()}
        />
        {result.isPending ? (
          <ListSkeleton rows={4} />
        ) : result.data ? (
          <>
            <p className="text-xs text-muted-foreground">
              {result.data.total.toLocaleString()} matching citation
              {result.data.total === 1 ? "" : "s"}
            </p>
            <div className="space-y-3">
              {result.data.tickets.map((ticket) => (
                <article
                  key={ticket.id}
                  className="rounded-2xl border border-border bg-card p-4 shadow-panel"
                >
                  <div className="flex items-start justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => change({ citation: ticket.id })}
                      className="min-h-11 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <p className="font-mono text-xs text-primary">
                        {ticket.id}
                      </p>
                      <h3 className="mt-1 text-lg font-bold">
                        {ticket.plateNo}
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        {ticket.vehicleType} · {ticket.violatorName}
                      </p>
                    </button>
                    <StatusBadge status={ticket.status} />
                  </div>
                  <p className="mt-4 border-t border-border pt-3 text-sm">
                    {ticket.violations
                      .map((violation) => violation.label)
                      .join(", ")}
                  </p>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm">
                    <time
                      dateTime={ticket.issuedAt}
                      className="text-muted-foreground"
                    >
                      {dateTime(ticket.issuedAt)}
                    </time>
                    <span className="font-bold tabular">
                      {peso(ticket.totalFine)}
                    </span>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => change({ citation: ticket.id })}
                      className="flex min-h-11 items-center gap-2 rounded-xl border border-border px-4 text-sm font-semibold hover:bg-muted"
                    >
                      <ClipboardList className="size-4" />
                      View details
                    </button>
                    <CitationSlipButton ticket={ticket} reload />
                  </div>
                </article>
              ))}
            </div>
            {!result.data.tickets.length && (
              <p className="rounded-2xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
                No citations match these filters. Try another date or status.
              </p>
            )}
            <RecordPager
              page={search.page}
              pageSize={result.data.pageSize}
              total={result.data.total}
              loading={result.isFetching}
              onPage={(page) => change({ page })}
            />
          </>
        ) : (
          <p className="rounded-xl border border-border p-5 text-sm text-muted-foreground">
            Records are unavailable. Retry above; your filters are preserved.
          </p>
        )}
      </div>
      <TicketDetailsDialog
        ticketId={search.citation || null}
        onClose={() => change({ citation: "" })}
      />
    </AppShell>
  );
}
