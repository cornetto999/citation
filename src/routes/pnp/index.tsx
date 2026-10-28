import {
  createFileRoute,
  type SearchSchemaInput,
} from "@tanstack/react-router";
import { useEffect, useState, memo } from "react";
import { useQuery } from "@tanstack/react-query";
import { workflowParams, workflowRequest } from "@/lib/workflow-client";
import { TicketDetailsDialog } from "@/components/TicketDetailsDialog";
import { RecordPager, WorkflowFeedback } from "@/components/WorkflowFeedback";
import { ListSkeleton } from "@/components/kit";
import { useAuthStore } from "@/store/useAuthStore";
import { AlertTriangle, Eye, Search, Siren } from "lucide-react";
import { StatusBadge } from "@/components/StatusBadge";
import { daysUntil, peso, shortDate } from "@/lib/format";
import { daysOverdue, isFlaggedToPnp } from "@/lib/overdue";
import { cn } from "@/lib/utils";
import type { Ticket, TicketStatus } from "@/types";

type MonitoringSearch = {
  query: string;
  filter: "All" | "Flagged to PNP" | TicketStatus;
  page: number;
  citation: string;
};
export const Route = createFileRoute("/pnp/")({
  validateSearch: (
    raw: Record<string, unknown> & SearchSchemaInput,
  ): MonitoringSearch => ({
    query: typeof raw["query"] === "string" ? raw["query"] : "",
    filter: [
      "All",
      "Flagged to PNP",
      "Unpaid",
      "Paid",
      "Overdue",
      "Contested",
    ].includes(String(raw["filter"]))
      ? (raw["filter"] as MonitoringSearch["filter"])
      : "All",
    page: Math.max(1, Math.floor(Number(raw["page"]) || 1)),
    citation: typeof raw["citation"] === "string" ? raw["citation"] : "",
  }),
  head: () => ({
    meta: [
      { title: "Citation Monitoring | PNP Command View" },
      {
        name: "description",
        content:
          "Read-only police monitoring of all traffic citations with status filters, due-date tracking, and collection totals.",
      },
      {
        property: "og:title",
        content: "Citation Monitoring | PNP Command View",
      },
      {
        property: "og:description",
        content: "Monitor every issued citation, its status, and its due date.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PnpPage,
});

const filters = [
  "All",
  "Flagged to PNP",
  "Unpaid",
  "Paid",
  "Overdue",
  "Contested",
] as const;

function EnforcementBadge({ ticket }: { ticket: Ticket }) {
  const flagged = isFlaggedToPnp(ticket);
  const cleared = Boolean(ticket.endorsedAt) && ticket.status === "Paid";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-1 text-[11px] font-semibold",
        flagged
          ? "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300"
          : cleared
            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300"
            : "bg-muted text-muted-foreground",
      )}
      title={
        flagged
          ? `Endorsed by ${ticket.endorsedBy || "Treasury / Admin"} on ${shortDate(ticket.endorsedAt!)}`
          : cleared
            ? "Payment recorded; no longer on the active PNP hotlist."
            : "No active endorsement to PNP."
      }
    >
      {flagged && (
        <span className="motion-safe:animate-pulse" aria-hidden="true">
          <Siren className="size-3" />
        </span>
      )}
      {flagged ? "Flagged to PNP" : cleared ? "Cleared · Paid" : "Routine"}
    </span>
  );
}

const TicketRow = memo(
  ({ t, onView }: { t: Ticket; onView: (id: string) => void }) => {
    const left = daysUntil(t.dueDate);
    const late =
      t.status !== "Paid" && new Date(t.dueDate).getTime() < Date.now();
    const flagged = isFlaggedToPnp(t);
    return (
      <tr
        className={cn(
          "border-b border-border/60 last:border-0 transition-colors",
          flagged ? "bg-rose-500/10 hover:bg-rose-500/15" : "hover:bg-muted/30",
        )}
      >
        <td className="px-4 py-3">
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-xs font-semibold">{t.id}</span>
          </div>
        </td>
        <td className="px-4 py-3">
          <p className="font-semibold">{t.plateNo}</p>
          <p className="text-xs text-muted-foreground">{t.vehicleType}</p>
        </td>
        <td className="px-4 py-3">
          <p>{t.violatorName}</p>
          <p className="font-mono text-xs text-muted-foreground">
            {t.licenseNo}
          </p>
        </td>
        <td className="max-w-64 px-4 py-3 text-xs text-muted-foreground">
          {t.violations.map((v) => v.label).join(", ")}
        </td>
        <td className="px-4 py-3 text-xs">{shortDate(t.issuedAt)}</td>
        <td className="px-4 py-3 text-xs">
          <span className={cn(late && "font-semibold text-destructive")}>
            {shortDate(t.dueDate)}
          </span>
          {t.status !== "Paid" && (
            <span className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
              {late ? (
                <>
                  <AlertTriangle className="size-3 text-destructive" />
                  {daysOverdue(t)}d late
                </>
              ) : (
                `${left}d left`
              )}
            </span>
          )}
        </td>
        <td className="px-4 py-3 text-right font-semibold tabular">
          {peso(t.totalFine)}
        </td>
        <td className="px-4 py-3">
          <StatusBadge status={t.status} />
        </td>
        <td className="px-4 py-3">
          <EnforcementBadge ticket={t} />
        </td>
        <td className="px-4 py-3 text-center">
          <button
            type="button"
            onClick={() => onView(t.id)}
            aria-label={`View details and evidence for ${t.id}`}
            className="inline-flex min-h-11 items-center gap-1 rounded-lg border border-border px-3 text-xs font-semibold"
          >
            <Eye className="size-4" />
            View
          </button>
        </td>
      </tr>
    );
  },
);

/* Mobile card variant for small screens */
const TicketCard = memo(
  ({ t, onView }: { t: Ticket; onView: (id: string) => void }) => {
    const left = daysUntil(t.dueDate);
    const late =
      t.status !== "Paid" && new Date(t.dueDate).getTime() < Date.now();
    const flagged = isFlaggedToPnp(t);
    return (
      <div
        className={cn(
          "rounded-2xl border border-border bg-card p-4 shadow-panel transition-all hover:shadow-lift",
          flagged && "border-rose-400/40 bg-rose-500/10",
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <EnforcementBadge ticket={t} />
              <p className="font-mono text-xs font-semibold text-muted-foreground">
                {t.id}
              </p>
            </div>
            <p className="mt-1 text-base font-bold tracking-tight">
              {t.plateNo}
            </p>
            <p className="text-xs text-muted-foreground">{t.vehicleType}</p>
            <p className="text-sm text-muted-foreground">{t.violatorName}</p>
            <p className="font-mono text-xs text-muted-foreground">
              {t.licenseNo}
            </p>
          </div>
          <StatusBadge status={t.status} />
        </div>
        <div className="mt-3 text-xs text-muted-foreground">
          {t.violations.map((v) => v.label).join(", ")}
        </div>
        <div className="mt-3 flex items-center justify-between border-t border-border pt-3 text-sm">
          <div className="flex flex-col gap-0.5">
            <span className="text-xs text-muted-foreground">
              Issued: {shortDate(t.issuedAt)}
            </span>
            <span className="text-xs text-muted-foreground">
              Due: {shortDate(t.dueDate)}
            </span>
            {t.status !== "Paid" && (
              <span
                className={cn(
                  "text-[11px]",
                  late
                    ? "font-semibold text-destructive"
                    : "text-muted-foreground",
                )}
              >
                {late ? `${daysOverdue(t)}d overdue` : `${left}d left`}
              </span>
            )}
          </div>
          <span className="font-bold tabular">{peso(t.totalFine)}</span>
        </div>
        <button
          type="button"
          onClick={() => onView(t.id)}
          className="mt-3 flex min-h-11 items-center gap-2 rounded-lg border border-border px-3 text-xs font-semibold"
        >
          <Eye className="size-4" />
          View details and evidence
        </button>
      </div>
    );
  },
);

function PnpPage() {
  const user = useAuthStore((s) => s.user);
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const [query, setQuery] = useState(search.query);
  useEffect(() => setQuery(search.query), [search.query]);
  const change = (next: Partial<MonitoringSearch>) =>
    void navigate({ search: { ...search, ...next }, resetScroll: false });
  const summary = useQuery({
    queryKey: ["workflow", "summary", user?.key],
    queryFn: ({ signal }) =>
      workflowRequest<{
        totalTickets: number;
        unpaidCount: number;
        overdueCount: number;
        totalRevenue: number;
        flaggedCount: number;
        flaggedAmount: number;
      }>("/api/workflow/summary", { signal }),
    enabled: user?.role === "pnp",
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
  const params = {
    query: search.query,
    status:
      search.filter === "All" || search.filter === "Flagged to PNP"
        ? "All"
        : search.filter,
    flag: search.filter === "Flagged to PNP" ? "flagged" : "all",
    page: search.page,
    pageSize: 25,
  };
  const result = useQuery({
    queryKey: ["workflow", "pnp-monitoring", user?.key, params],
    queryFn: ({ signal }) =>
      workflowRequest<{ tickets: Ticket[]; total: number; pageSize: number }>(
        `/api/workflow/tickets?${workflowParams(params)}`,
        { signal },
      ),
    enabled: user?.role === "pnp",
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
  const onView = (id: string) => change({ citation: id });
  const count = (value: number | undefined) =>
    value === undefined ? "—" : String(value);
  const stats: {
    label: string;
    value: string;
    filter: MonitoringSearch["filter"];
  }[] = [
    {
      label: "Total citations",
      value: count(summary.data?.totalTickets),
      filter: "All",
    },
    {
      label: "Flagged to PNP",
      value: count(summary.data?.flaggedCount),
      filter: "Flagged to PNP",
    },
    {
      label: "Unpaid",
      value: count(summary.data?.unpaidCount),
      filter: "Unpaid",
    },
    {
      label: "Overdue",
      value: count(summary.data?.overdueCount),
      filter: "Overdue",
    },
    {
      label: "Collected",
      value: summary.data ? peso(summary.data.totalRevenue) : "—",
      filter: "Paid",
    },
  ];
  if (!user || user.role !== "pnp") return null;
  return (
    <div className="space-y-6">
      <WorkflowFeedback
        error={summary.error}
        loading={summary.isFetching}
        updatedAt={summary.dataUpdatedAt}
        onRetry={() => void summary.refetch()}
      />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {stats.map((stat) => (
          <button
            key={stat.label}
            type="button"
            onClick={() => change({ filter: stat.filter, page: 1, query: "" })}
            className={cn(
              "rounded-2xl border bg-card p-4 text-left shadow-panel transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              stat.filter === "Flagged to PNP"
                ? "border-rose-400/40 bg-rose-500/10"
                : "border-border",
            )}
          >
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              {stat.label}
            </span>
            <span className="mt-1.5 block font-display text-2xl font-bold tabular">
              {stat.value}
            </span>
            {stat.filter === "Flagged to PNP" && (
              <span className="mt-1 block text-xs text-muted-foreground">
                {summary.data ? peso(summary.data.flaggedAmount) : "—"} in total
                fines
              </span>
            )}
          </button>
        ))}
      </div>
      {!!summary.data?.flaggedCount && (
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-rose-300/40 bg-rose-500/10 p-4">
          <div>
            <p className="flex items-center gap-2 text-sm font-bold">
              <Siren className="size-4" />
              Priority: {summary.data.flaggedCount} citations flagged to PNP
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Review official endorsements for follow-up. Direct payments to the
              Municipal Treasury.
            </p>
          </div>
          <button
            type="button"
            onClick={() =>
              change({ filter: "Flagged to PNP", page: 1, query: "" })
            }
            className="min-h-11 rounded-xl bg-rose-600 px-3 text-sm font-semibold text-white"
          >
            Show flagged citations
          </button>
        </section>
      )}
      <section className="rounded-2xl border border-border bg-card shadow-panel">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            change({ query, page: 1 });
          }}
          className="flex flex-wrap gap-3 border-b border-border p-4"
        >
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              aria-label="Search citations by ticket, plate, driver, or license"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Ticket, plate, name, or license"
              className="h-12 w-full rounded-xl border border-input bg-background pl-10 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring/30"
            />
          </div>
          <button
            type="submit"
            className="min-h-12 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground"
          >
            Search
          </button>
        </form>
        <div
          className="flex flex-wrap gap-2 px-4 pt-4"
          role="group"
          aria-label="Citation filters"
        >
          {filters.map((filter) => (
            <button
              key={filter}
              type="button"
              aria-pressed={search.filter === filter}
              onClick={() => change({ filter, page: 1 })}
              className={cn(
                "min-h-11 rounded-xl px-3 text-sm font-semibold",
                search.filter === filter
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground",
              )}
            >
              {filter === "Flagged to PNP" && (
                <Siren className="mr-1 inline size-3.5" />
              )}
              {filter}
            </button>
          ))}
        </div>
        <div className="p-4">
          <WorkflowFeedback
            error={result.error}
            loading={result.isFetching}
            updatedAt={result.dataUpdatedAt}
            onRetry={() => void result.refetch()}
          />
        </div>
        {result.isPending ? (
          <ListSkeleton rows={5} />
        ) : result.data ? (
          <>
            <p className="px-4 pb-3 text-xs text-muted-foreground">
              {result.data.total.toLocaleString()} matching citations · All
              municipal records searched
            </p>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <caption className="sr-only">
                  Municipal citations and PNP endorsement status
                </caption>
                <thead>
                  <tr className="border-b border-border text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                    {[
                      "Ticket no.",
                      "Plate / Vehicle",
                      "Violator",
                      "Violations",
                      "Issued",
                      "Due",
                      "Fine",
                      "Status",
                      "Enforcement",
                      "Details",
                    ].map((label) => (
                      <th key={label} className="px-4 py-3 font-bold">
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.data.tickets.map((ticket) => (
                    <TicketRow key={ticket.id} t={ticket} onView={onView} />
                  ))}
                </tbody>
              </table>
            </div>
            <div className="space-y-3 p-3 md:hidden">
              {result.data.tickets.map((ticket) => (
                <TicketCard key={ticket.id} t={ticket} onView={onView} />
              ))}
            </div>
            {!result.data.tickets.length && (
              <p className="px-4 py-12 text-center text-sm text-muted-foreground">
                No citations match this view.
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
          <p className="p-8 text-center text-sm text-muted-foreground">
            Records are unavailable. Retry above.
          </p>
        )}
        <p className="border-t border-border px-4 py-3 text-xs text-muted-foreground">
          Monitoring access is read-only. Payment posting is handled by the
          Municipal Treasury.
        </p>
      </section>
      <TicketDetailsDialog
        ticketId={search.citation || null}
        onClose={() => change({ citation: "" })}
      />
    </div>
  );
}
