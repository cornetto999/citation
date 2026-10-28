import { useEffect, useState } from "react";
import {
  createFileRoute,
  type SearchSchemaInput,
} from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { FileSearch, ShieldAlert, SlidersHorizontal } from "lucide-react";
import {
  PageHeader,
  SectionCard,
  SearchInput,
  FilterChips,
  EmptyState,
  ListSkeleton,
} from "@/components/kit";
import { StatusBadge } from "@/components/StatusBadge";
import { TicketDetailsDialog } from "@/components/TicketDetailsDialog";
import { RecordPager, WorkflowFeedback } from "@/components/WorkflowFeedback";
import { workflowParams, workflowRequest } from "@/lib/workflow-client";
import { peso, shortDate } from "@/lib/format";
import type { Ticket, TicketStatus } from "@/types";

const statuses = ["All", "Unpaid", "Overdue", "Paid", "Contested"] as const;
type Search = {
  query: string;
  status: "All" | TicketStatus;
  flagged: "all" | "yes" | "no";
  from: string;
  to: string;
  issuedBy: string;
  page: number;
  citation: string;
};
const input =
  "min-h-11 w-full rounded-xl border border-input bg-card px-3 text-sm outline-none focus:ring-2 focus:ring-ring/30";

export const Route = createFileRoute("/admin/citations")({
  validateSearch: (
    raw: Record<string, unknown> & SearchSchemaInput,
  ): Search => ({
    query: typeof raw["query"] === "string" ? raw["query"] : "",
    status: statuses.includes(raw["status"] as Search["status"])
      ? (raw["status"] as Search["status"])
      : "All",
    flagged:
      raw["flagged"] === "yes" || raw["flagged"] === "no"
        ? raw["flagged"]
        : "all",
    from:
      typeof raw["from"] === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw["from"])
        ? raw["from"]
        : "",
    to:
      typeof raw["to"] === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw["to"])
        ? raw["to"]
        : "",
    issuedBy: typeof raw["issuedBy"] === "string" ? raw["issuedBy"] : "",
    page: Math.max(1, Math.floor(Number(raw["page"]) || 1)),
    citation: typeof raw["citation"] === "string" ? raw["citation"] : "",
  }),
  component: CitationRegister,
});

function CitationRegister() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const [draft, setDraft] = useState(search);
  useEffect(() => setDraft(search), [search]);
  const { citation, ...filters } = search;
  const result = useQuery({
    queryKey: ["workflow", "tickets", filters],
    queryFn: ({ signal }) =>
      workflowRequest<{
        tickets: Ticket[];
        total: number;
        page: number;
        pageSize: number;
      }>(
        `/api/workflow/tickets?${workflowParams({ ...filters, flagged: undefined, flag: filters.flagged === "yes" ? "flagged" : filters.flagged === "no" ? "unflagged" : "all", pageSize: 25 })}`,
        { signal },
      ),
    staleTime: 15_000,
  });
  const change = (next: Partial<Search>) =>
    void navigate({ search: { ...search, ...next }, resetScroll: false });
  const hasFilters =
    search.query ||
    search.from ||
    search.to ||
    search.issuedBy ||
    search.status !== "All" ||
    search.flagged !== "all";

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        title="Citation register"
        eyebrow="Municipal records"
        description="Find a citation, review its history, and direct collection to Treasury."
        icon={FileSearch}
      />
      <SectionCard
        title="Find a citation"
        icon={SlidersHorizontal}
        bodyClassName="space-y-4 p-5"
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            change({ ...draft, page: 1, citation: "" });
          }}
          className="space-y-4"
        >
          <div className="flex flex-col gap-3 sm:flex-row">
            <SearchInput
              value={draft.query}
              onChange={(query) => setDraft({ ...draft, query })}
              className="flex-1"
              placeholder="Ticket, plate, name, license or receipt number"
              hotkey
            />
            <button
              type="submit"
              className="min-h-11 rounded-xl bg-primary px-6 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
            >
              Search records
            </button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <label className="space-y-1.5 text-xs font-semibold text-muted-foreground">
              Issued from
              <input
                type="date"
                value={draft.from}
                max={draft.to || undefined}
                onChange={(e) => setDraft({ ...draft, from: e.target.value })}
                className={input}
              />
            </label>
            <label className="space-y-1.5 text-xs font-semibold text-muted-foreground">
              Issued through
              <input
                type="date"
                value={draft.to}
                min={draft.from || undefined}
                onChange={(e) => setDraft({ ...draft, to: e.target.value })}
                className={input}
              />
            </label>
            <label className="space-y-1.5 text-xs font-semibold text-muted-foreground">
              Issuing officer
              <input
                value={draft.issuedBy}
                onChange={(e) =>
                  setDraft({ ...draft, issuedBy: e.target.value })
                }
                placeholder="Officer name"
                className={input}
              />
            </label>
            <label className="space-y-1.5 text-xs font-semibold text-muted-foreground">
              Police endorsement
              <select
                value={draft.flagged}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    flagged: e.target.value as Search["flagged"],
                  })
                }
                className={input}
              >
                <option value="all">All citations</option>
                <option value="yes">Flagged to PNP</option>
                <option value="no">Not flagged</option>
              </select>
            </label>
          </div>
        </form>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <FilterChips
            options={statuses}
            value={search.status}
            onChange={(status) => change({ status, page: 1 })}
          />
          {hasFilters && (
            <button
              type="button"
              onClick={() =>
                change({
                  query: "",
                  status: "All",
                  flagged: "all",
                  from: "",
                  to: "",
                  issuedBy: "",
                  page: 1,
                })
              }
              className="min-h-10 px-3 text-sm font-medium text-primary hover:underline"
            >
              Clear filters
            </button>
          )}
        </div>
      </SectionCard>
      <WorkflowFeedback
        error={result.error}
        loading={result.isFetching}
        updatedAt={result.dataUpdatedAt}
        onRetry={() => void result.refetch()}
      />
      <SectionCard
        title="Matching citations"
        description="Dates use Philippine time. Select a ticket for details and activity."
      >
        {result.isPending ? (
          <ListSkeleton rows={6} />
        ) : result.data ? (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
                  <tr>
                    {[
                      "Citation / plate",
                      "Violator",
                      "Issued / due",
                      "Officer",
                      "Fine",
                      "Status",
                    ].map((label) => (
                      <th
                        key={label}
                        className="whitespace-nowrap px-5 py-3 font-semibold"
                      >
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {result.data.tickets.map((ticket) => (
                    <tr key={ticket.id} className="hover:bg-muted/40">
                      <td className="px-5 py-4">
                        <button
                          type="button"
                          onClick={() => change({ citation: ticket.id })}
                          className="min-h-11 text-left font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <span className="block font-mono text-xs">
                            {ticket.id}
                          </span>
                          <span className="mt-1 block text-foreground">
                            {ticket.plateNo}
                          </span>
                        </button>
                        {ticket.endorsedAt && ticket.status !== "Paid" ? (
                          <span className="mt-1 flex items-center gap-1 text-xs font-semibold text-rose-600">
                            <ShieldAlert className="size-3" /> Flagged to PNP
                          </span>
                        ) : null}
                      </td>
                      <td className="px-5 py-4">
                        <p className="font-medium">{ticket.violatorName}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {ticket.licenseNo}
                        </p>
                      </td>
                      <td className="whitespace-nowrap px-5 py-4">
                        <p>{shortDate(ticket.issuedAt)}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Due {shortDate(ticket.dueDate)}
                        </p>
                      </td>
                      <td className="px-5 py-4 text-muted-foreground">
                        {ticket.issuedBy}
                      </td>
                      <td className="whitespace-nowrap px-5 py-4 font-semibold tabular-nums">
                        {peso(ticket.totalFine)}
                      </td>
                      <td className="px-5 py-4">
                        <StatusBadge status={ticket.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {result.data.tickets.length === 0 && (
              <EmptyState
                icon={FileSearch}
                title="No matching citations"
                description="Try a shorter search or clear the date and status filters."
              />
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
          <EmptyState
            icon={FileSearch}
            title="Records are unavailable"
            description="Retry the request above. Your search filters are saved."
          />
        )}
      </SectionCard>
      <TicketDetailsDialog
        ticketId={citation || null}
        onClose={() => change({ citation: "" })}
      />
    </div>
  );
}
