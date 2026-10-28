import { useEffect, useRef, useState } from "react";
import {
  createFileRoute,
  type SearchSchemaInput,
} from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, Download, FileSearch } from "lucide-react";
import { toast } from "sonner";
import {
  PageHeader,
  SectionCard,
  StatCard,
  ListSkeleton,
  EmptyState,
} from "@/components/kit";
import { RecordPager, WorkflowFeedback } from "@/components/WorkflowFeedback";
import { TicketDetailsDialog } from "@/components/TicketDetailsDialog";
import { StatusBadge } from "@/components/StatusBadge";
import { workflowParams, workflowRequest } from "@/lib/workflow-client";
import { downloadCsv, peso, shortDate } from "@/lib/format";
import type { Ticket } from "@/types";

type ReportResult = {
  tickets: Ticket[];
  total: number;
  page: number;
  pageSize: number;
  totalFine: number;
  collectionTotal: number;
  totalAmount: number;
  cashAmount: number;
  onlineAmount: number;
  cashiers: string[];
};
const input =
  "min-h-11 w-full rounded-xl border border-input bg-card px-3 text-sm outline-none focus:ring-2 focus:ring-ring/30";
export const Route = createFileRoute("/admin/reports")({
  validateSearch: (raw: Record<string, unknown> & SearchSchemaInput) => ({
    basis: raw["basis"] === "paid" ? "paid" : ("issued" as "paid" | "issued"),
    from: typeof raw["from"] === "string" ? raw["from"] : "",
    to: typeof raw["to"] === "string" ? raw["to"] : "",
    channel: typeof raw["channel"] === "string" ? raw["channel"] : "",
    issuedBy: typeof raw["issuedBy"] === "string" ? raw["issuedBy"] : "",
    receivedBy: typeof raw["receivedBy"] === "string" ? raw["receivedBy"] : "",
    page: Math.max(1, Math.floor(Number(raw["page"]) || 1)),
  }),
  component: AdminReports,
});

function AdminReports() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const [draft, setDraft] = useState(search);
  const [selected, setSelected] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const exportAbort = useRef<AbortController | null>(null);
  useEffect(() => setDraft(search), [search]);
  useEffect(() => () => exportAbort.current?.abort(), []);
  const result = useQuery({
    queryKey: ["workflow", "reports", search],
    queryFn: ({ signal }) =>
      workflowRequest<ReportResult>(
        `/api/workflow/reports?${workflowParams({ ...search, pageSize: 25 })}`,
        { signal },
      ),
    staleTime: 15_000,
  });
  const exportReport = async () => {
    if (exportAbort.current || !result.data) return;
    const controller = new AbortController();
    exportAbort.current = controller;
    setExporting(true);
    setExportProgress(0);
    try {
      const all: Ticket[] = [];
      const seen = new Set<string>();
      let expected: ReportResult | undefined;
      for (let page = 1; ; page++) {
        const batch = await workflowRequest<ReportResult>(
          `/api/workflow/reports?${workflowParams({ ...search, page, pageSize: 100 })}`,
          { signal: controller.signal },
        );
        expected ??= batch;
        if (
          batch.total !== expected.total ||
          batch.totalFine !== expected.totalFine ||
          batch.collectionTotal !== expected.collectionTotal
        )
          throw new Error(
            "The report changed while exporting. Refresh the records and export again.",
          );
        for (const ticket of batch.tickets) {
          if (seen.has(ticket.id))
            throw new Error(
              "Records changed while exporting. Refresh and export again.",
            );
          seen.add(ticket.id);
          all.push(ticket);
        }
        setExportProgress(all.length);
        if (all.length >= expected.total) break;
        if (!batch.tickets.length)
          throw new Error(
            "Some report records were not returned. Please retry.",
          );
      }
      if (all.length !== expected?.total)
        throw new Error("Could not verify the complete export. Please retry.");
      downloadCsv(
        `citation_report_${search.basis}_${search.from || "all"}_${search.to || "dates"}.csv`,
        [
          "Date basis",
          "Citation",
          "Plate",
          "Violator",
          "Vehicle",
          "Issued at",
          "Issued by",
          "Status",
          "Fine PHP",
          "Paid at",
          "Channel",
          "Collected PHP",
          "Received by",
          "Receipt",
        ],
        all.map((ticket) => [
          search.basis === "paid" ? "Payment date" : "Issue date",
          ticket.id,
          ticket.plateNo,
          ticket.violatorName,
          ticket.vehicleType,
          ticket.issuedAt,
          ticket.issuedBy,
          ticket.status,
          ticket.totalFine,
          ticket.payment?.paidAt,
          ticket.payment?.channel,
          ticket.payment?.amount ?? 0,
          ticket.payment?.receivedBy,
          ticket.payment?.orNumber,
        ]),
      );
      toast.success(
        `Exported ${all.length.toLocaleString()} matching records.`,
      );
    } catch (error) {
      if (!controller.signal.aborted)
        toast.error(
          error instanceof Error
            ? error.message
            : "Unable to export the report.",
        );
    } finally {
      exportAbort.current = null;
      if (!controller.signal.aborted) {
        setExporting(false);
        setExportProgress(0);
      }
    }
  };
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        eyebrow="Municipal oversight"
        title="Operational reports"
        description="Use issue dates for enforcement activity and payment dates for collection reporting."
        icon={BarChart3}
        actions={
          <button
            onClick={() => void exportReport()}
            disabled={
              exporting || !result.data || result.isFetching || !!result.error
            }
            className="flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            <Download className="size-4" />
            {exporting
              ? `Exporting ${exportProgress.toLocaleString()}…`
              : "Export all matching records"}
          </button>
        }
      />
      <SectionCard title="Report filters" bodyClassName="p-5">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void navigate({
              search: { ...draft, page: 1 },
              resetScroll: false,
            });
          }}
        >
          <fieldset
            disabled={exporting}
            className="grid items-end gap-4 sm:grid-cols-2 xl:grid-cols-3"
          >
            <label className="space-y-1.5 text-xs font-semibold text-muted-foreground">
              Date basis
              <select
                value={draft.basis}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    basis: event.target.value as "issued" | "paid",
                  })
                }
                className={input}
              >
                <option value="issued">Citation issue date</option>
                <option value="paid">Payment date</option>
              </select>
            </label>
            <label className="space-y-1.5 text-xs font-semibold text-muted-foreground">
              From
              <input
                type="date"
                value={draft.from}
                max={draft.to || undefined}
                onChange={(event) =>
                  setDraft({ ...draft, from: event.target.value })
                }
                className={input}
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
                className={input}
              />
            </label>
            <label className="space-y-1.5 text-xs font-semibold text-muted-foreground">
              Issuing officer
              <input
                value={draft.issuedBy}
                onChange={(event) =>
                  setDraft({ ...draft, issuedBy: event.target.value })
                }
                placeholder="All officers"
                className={input}
              />
            </label>
            <label className="space-y-1.5 text-xs font-semibold text-muted-foreground">
              Payment channel
              <select
                value={draft.channel}
                onChange={(event) =>
                  setDraft({ ...draft, channel: event.target.value })
                }
                className={input}
              >
                <option value="">All channels</option>
                {[
                  "Cash (Over-the-counter)",
                  "Online (PayMongo)",
                  "GCash",
                  "Maya",
                  "QRPh",
                ].map((channel) => (
                  <option key={channel} value={channel}>
                    {channel}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1.5 text-xs font-semibold text-muted-foreground">
              Receiving cashier
              <input
                list="report-cashiers"
                value={draft.receivedBy}
                onChange={(event) =>
                  setDraft({ ...draft, receivedBy: event.target.value })
                }
                placeholder="All cashiers"
                className={input}
              />
              <datalist id="report-cashiers">
                {result.data?.cashiers.map((cashier) => (
                  <option key={cashier} value={cashier} />
                ))}
              </datalist>
            </label>
            <div className="flex gap-3 sm:col-span-2 xl:col-span-3">
              <button className="min-h-11 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground">
                Apply filters
              </button>
              <button
                type="button"
                onClick={() =>
                  void navigate({
                    search: {
                      basis: "issued",
                      from: "",
                      to: "",
                      channel: "",
                      issuedBy: "",
                      receivedBy: "",
                      page: 1,
                    },
                    resetScroll: false,
                  })
                }
                className="min-h-11 rounded-xl border border-border px-4 text-sm font-semibold hover:bg-muted"
              >
                Clear filters
              </button>
            </div>
          </fieldset>
        </form>
      </SectionCard>
      <WorkflowFeedback
        error={result.error}
        loading={result.isFetching}
        updatedAt={result.dataUpdatedAt}
        onRetry={() => void result.refetch()}
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Matching citations"
          value={result.data?.total.toLocaleString() ?? "—"}
          hint={`${search.basis === "paid" ? "Payment" : "Issue"} date · ${search.from || "all dates"}${search.to ? ` through ${search.to}` : ""}`}
        />
        <StatCard
          label="Fines on these citations"
          value={result.data ? peso(result.data.totalFine) : "—"}
          hint="Original recorded fines"
          tone="warning"
        />
        <StatCard
          label="Recorded collections"
          value={result.data ? peso(result.data.collectionTotal) : "—"}
          hint={
            search.basis === "issued"
              ? "Payments on citations issued in this period"
              : "Payments recorded in this period"
          }
          tone="success"
        />
      </div>
      <SectionCard
        title="Filtered records"
        description={`${search.basis === "paid" ? "Payment dates" : "Issue dates"} determine inclusion. The export includes every matching record, across all pages.`}
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
                      "Issue date",
                      "Officer",
                      "Fine",
                      "Status",
                      "Payment date",
                      "Channel / receipt",
                      "Collected",
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
                      <td className="px-5 py-3">
                        <button
                          onClick={() => setSelected(ticket.id)}
                          className="min-h-11 text-left text-primary-text hover:underline"
                        >
                          <span className="block font-mono text-xs font-semibold">
                            {ticket.id}
                          </span>
                          <span className="mt-1 block text-foreground">
                            {ticket.plateNo}
                          </span>
                        </button>
                      </td>
                      <td className="whitespace-nowrap px-5 py-3 text-muted-foreground">
                        {shortDate(ticket.issuedAt)}
                      </td>
                      <td className="px-5 py-3 text-muted-foreground">
                        {ticket.issuedBy}
                      </td>
                      <td className="whitespace-nowrap px-5 py-3 tabular-nums">
                        {peso(ticket.totalFine)}
                      </td>
                      <td className="px-5 py-3">
                        <StatusBadge status={ticket.status} />
                      </td>
                      <td className="whitespace-nowrap px-5 py-3 text-muted-foreground">
                        {ticket.payment
                          ? shortDate(ticket.payment.paidAt)
                          : "—"}
                      </td>
                      <td className="px-5 py-3">
                        <p className="text-xs">
                          {ticket.payment?.channel || "Unpaid"}
                        </p>
                        <p className="mt-1 font-mono text-xs text-muted-foreground">
                          {ticket.payment?.orNumber}
                        </p>
                      </td>
                      <td className="whitespace-nowrap px-5 py-3 font-semibold tabular-nums">
                        {ticket.payment ? peso(ticket.payment.amount) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!result.data.tickets.length && (
              <EmptyState
                icon={FileSearch}
                title="No records match this report"
                description="Adjust the date range or payment filters."
              />
            )}
            <RecordPager
              page={search.page}
              pageSize={result.data.pageSize}
              total={result.data.total}
              loading={result.isFetching || exporting}
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
            icon={FileSearch}
            title="Report unavailable"
            description="Retry the request; your filters are preserved."
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
