import { useEffect, useState } from "react";
import {
  createFileRoute,
  type SearchSchemaInput,
} from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { History } from "lucide-react";
import {
  PageHeader,
  SectionCard,
  SearchInput,
  ListSkeleton,
  EmptyState,
} from "@/components/kit";
import { RecordPager, WorkflowFeedback } from "@/components/WorkflowFeedback";
import { TicketDetailsDialog } from "@/components/TicketDetailsDialog";
import { workflowRequest, workflowParams } from "@/lib/workflow-client";
import type { WorkflowEvent } from "@/types";

export const Route = createFileRoute("/admin/audit")({
  validateSearch: (raw: Record<string, unknown> & SearchSchemaInput) => ({
    query: typeof raw["query"] === "string" ? raw["query"] : "",
    from: typeof raw["from"] === "string" ? raw["from"] : "",
    to: typeof raw["to"] === "string" ? raw["to"] : "",
    page: Math.max(1, Math.floor(Number(raw["page"]) || 1)),
  }),
  component: AdminAudit,
});

function AdminAudit() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const [draft, setDraft] = useState(search);
  const [selected, setSelected] = useState<string | null>(null);
  useEffect(() => setDraft(search), [search]);
  const result = useQuery({
    queryKey: ["workflow", "audit", search],
    queryFn: ({ signal }) =>
      workflowRequest<{ events: WorkflowEvent[]; total: number }>(
        `/api/workflow/audit?${workflowParams({ ...search, pageSize: 25 })}`,
        { signal },
      ),
    staleTime: 15_000,
  });
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        eyebrow="Accountability"
        title="Activity history"
        description="Review recorded staff actions, citation updates, and collection events. Times are shown in Philippine time."
        icon={History}
      />
      <SectionCard bodyClassName="p-5">
        <form
          className="grid items-end gap-3 sm:grid-cols-2 xl:grid-cols-[2fr_1fr_1fr_auto]"
          onSubmit={(event) => {
            event.preventDefault();
            void navigate({
              search: { ...draft, page: 1 },
              resetScroll: false,
            });
          }}
        >
          <SearchInput
            value={draft.query}
            onChange={(query) => setDraft({ ...draft, query })}
            placeholder="Citation, staff, action or reason"
            hotkey
          />
          <label className="space-y-1.5 text-xs font-semibold text-muted-foreground">
            From
            <input
              type="date"
              value={draft.from}
              max={draft.to || undefined}
              onChange={(event) =>
                setDraft({ ...draft, from: event.target.value })
              }
              className="min-h-11 w-full rounded-xl border border-input bg-card px-3 text-sm"
            />
          </label>
          <label className="space-y-1.5 text-xs font-semibold text-muted-foreground">
            Through
            <input
              type="date"
              value={draft.to}
              min={draft.from || undefined}
              onChange={(event) =>
                setDraft({ ...draft, to: event.target.value })
              }
              className="min-h-11 w-full rounded-xl border border-input bg-card px-3 text-sm"
            />
          </label>
          <button className="min-h-11 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground">
            Search history
          </button>
        </form>
      </SectionCard>
      <WorkflowFeedback
        error={result.error}
        loading={result.isFetching}
        updatedAt={result.dataUpdatedAt}
        onRetry={() => void result.refetch()}
      />
      <SectionCard
        title="Recorded activity"
        description="Existing records may predate the activity log. Missing history is not evidence that no action occurred."
      >
        {result.isPending ? (
          <ListSkeleton rows={6} />
        ) : result.data ? (
          <>
            <div className="divide-y divide-border">
              {result.data.events.map((event) => (
                <article key={event.id} className="space-y-2 p-5 text-sm">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h2 className="font-semibold capitalize">
                        {event.action.replace(/[_.]/g, " ")}
                      </h2>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {event.actorName || "System"}
                      </p>
                    </div>
                    <time
                      dateTime={event.createdAt}
                      className="text-xs text-muted-foreground"
                    >
                      {new Date(event.createdAt).toLocaleString("en-PH", {
                        timeZone: "Asia/Manila",
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </time>
                  </div>
                  {event.ticketId && (
                    <button
                      type="button"
                      onClick={() => setSelected(event.ticketId!)}
                      className="min-h-9 font-mono text-xs font-semibold text-primary hover:underline"
                    >
                      {event.ticketId}
                    </button>
                  )}
                  {event.reason && (
                    <p className="whitespace-pre-wrap break-words text-muted-foreground">
                      {event.reason}
                    </p>
                  )}
                  {(event.before != null || event.after != null) && (
                    <details className="rounded-lg bg-muted/40 p-3">
                      <summary className="cursor-pointer text-xs font-semibold">
                        View recorded changes
                      </summary>
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        <div>
                          <p className="mb-1 text-xs font-semibold">Before</p>
                          <pre className="max-h-52 overflow-auto whitespace-pre-wrap break-all text-xs">
                            {JSON.stringify(event.before ?? null, null, 2)}
                          </pre>
                        </div>
                        <div>
                          <p className="mb-1 text-xs font-semibold">After</p>
                          <pre className="max-h-52 overflow-auto whitespace-pre-wrap break-all text-xs">
                            {JSON.stringify(event.after ?? null, null, 2)}
                          </pre>
                        </div>
                      </div>
                    </details>
                  )}
                </article>
              ))}
            </div>
            {!result.data.events.length && (
              <EmptyState
                icon={History}
                title="No matching activity"
                description="Try a different search or date range."
              />
            )}
            <RecordPager
              page={search.page}
              pageSize={25}
              total={result.data.total}
              loading={result.isFetching}
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
            icon={History}
            title="Activity unavailable"
            description="Retry above to load the recorded history."
          />
        )}
      </SectionCard>
      <TicketDetailsDialog
        ticketId={selected}
        onClose={() => setSelected(null)}
      />
    </div>
  );
}
