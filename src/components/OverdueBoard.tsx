import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useDashboardMetrics } from "@/hooks/useDashboardMetrics";
import { workflowParams, workflowRequest } from "@/lib/workflow-client";
import { loadAllCitationPages } from "@/lib/workflow-export";
import { RecordPager, WorkflowFeedback } from "@/components/WorkflowFeedback";
import {
  AlarmClock,
  AlertTriangle,
  Banknote,
  Download,
  Eye,
  Hourglass,
  Info,
  Printer,
  ShieldCheck,
  ShieldOff,
  Siren,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { useAuthStore } from "@/store/useAuthStore";
import { useTicketStore } from "@/store/useTicketStore";
import {
  EmptyState,
  FilterChips,
  ListSkeleton,
  PageHeader,
  SearchInput,
  SectionCard,
  StatCard,
} from "@/components/kit";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  dateTime,
  downloadCsv,
  localDateKey,
  peso,
  shortDate,
} from "@/lib/format";
import {
  agingBuckets,
  baseFine,
  daysOverdue,
  isOverdue,
  isFlaggedToPnp,
  surchargeOf,
  type AgingBucket,
} from "@/lib/overdue";
import { cn } from "@/lib/utils";
import { printCheckpointHotlist } from "@/lib/checkpoint-hotlist";
import { Textarea } from "@/components/ui/textarea";
import type { Ticket } from "@/types";
import {
  reconcileEndorsementResults,
  type BatchEndorsementResult,
} from "@/lib/batch-endorsement";

export type OverdueBoardRole = "admin" | "treasury" | "pnp";

const endorsementFilters = [
  "All Overdue",
  "Flagged to PNP",
  "Not Flagged",
] as const;
type EndorsementFilter = (typeof endorsementFilters)[number];

const roleCopy: Record<
  OverdueBoardRole,
  { eyebrow: string; description: string; note: string }
> = {
  admin: {
    eyebrow: "Admin · Collections",
    description:
      "Citations past their due date. Endorse persistent cases to the PNP for enforcement.",
    note: "Endorsed citations appear flagged in the PNP portal's Overdue page. Withdraw an endorsement if the violator settles or the case is resolved.",
  },
  treasury: {
    eyebrow: "Treasury · Collections",
    description:
      "Unsettled citations past their due date. Collect at the cashier or endorse to the PNP.",
    note: "Endorsed citations appear flagged in the PNP portal. Payments posted at the cashier automatically remove a citation from this list.",
  },
  pnp: {
    eyebrow: "PNP · Enforcement",
    description:
      "Overdue citations, with cases endorsed by the LGU / Treasury for police enforcement listed first.",
    note: "Read-only view. Endorsed citations are flagged by the Municipal Treasury or LGU Admin. Payment is handled by the Municipal Treasury.",
  },
};

/* ─── Small presentational pieces ────────────────────────────────── */

function DaysLateBadge({ days }: { days: number }) {
  if (days <= 0) {
    return (
      <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
        Not past due
      </span>
    );
  }
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold tabular",
        days >= 31
          ? "bg-destructive text-destructive-foreground"
          : days >= 8
            ? "bg-overdue text-overdue-foreground"
            : "bg-unpaid text-unpaid-foreground",
      )}
    >
      <Hourglass className="size-3" />
      {days}d late
    </span>
  );
}

function EndorsementBadge({ t, compact }: { t: Ticket; compact?: boolean }) {
  if (!isFlaggedToPnp(t)) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
        <ShieldOff className="size-3" />
        Not Flagged
      </span>
    );
  }
  return (
    <div className="flex flex-col gap-0.5">
      <span className="inline-flex w-fit items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-bold text-rose-700 dark:bg-rose-500/15 dark:text-rose-300">
        <Siren className="size-3" />
        Flagged to PNP
      </span>
      {!compact && (
        <span className="text-[11px] text-muted-foreground">
          {t.endorsedBy ? `${t.endorsedBy} · ` : ""}
          {shortDate(t.endorsedAt!)}
        </span>
      )}
    </div>
  );
}

const iconBtn =
  "inline-flex h-8 items-center justify-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold transition-all active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";

/* ─── Main board ─────────────────────────────────────────────────── */

export function OverdueBoard({ role }: { role: OverdueBoardRole }) {
  const user = useAuthStore((s) => s.user);
  const metrics = useDashboardMetrics();
  const queryClient = useQueryClient();
  const endorseToPnp = useTicketStore((s) => s.endorseToPnp);
  const withdrawEndorsement = useTicketStore((s) => s.withdrawEndorsement);

  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedQuery(query);
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [query]);
  const [endorsement, setEndorsement] =
    useState<EndorsementFilter>("All Overdue");
  const [aging, setAging] = useState<AgingBucket>("Any age");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{
    id: string;
    action: "endorse" | "withdraw";
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [endorsementNote, setEndorsementNote] = useState("");
  const [selectedTickets, setSelectedTickets] = useState<Ticket[]>([]);
  const [batchOpen, setBatchOpen] = useState(false);
  const [batchBusy, setBatchBusy] = useState(false);
  const [batchReason, setBatchReason] = useState("");
  const [batchResults, setBatchResults] = useState<BatchEndorsementResult[]>(
    [],
  );
  const [batchError, setBatchError] = useState("");
  useEffect(() => {
    setSelectedTickets([]);
    setBatchResults([]);
  }, [query, endorsement, aging]);

  const canEndorse = role !== "pnp";
  const canCollect = role === "treasury";
  const copy = roleCopy[role];

  const filters = {
    query: debouncedQuery,
    status: endorsement === "Flagged to PNP" ? "All" : "Overdue",
    flag:
      endorsement === "Flagged to PNP"
        ? "flagged"
        : endorsement === "Not Flagged"
          ? "unflagged"
          : "all",
    priority: "flagged",
    aging: {
      "Any age": "all",
      "1–7 days": "1-7",
      "8–30 days": "8-30",
      "31+ days": "31+",
    }[aging],
  };
  const result = useQuery({
    queryKey: ["workflow", "overdue", user?.key, filters, page],
    queryFn: ({ signal }) =>
      workflowRequest<{ tickets: Ticket[]; total: number; pageSize: number }>(
        `/api/workflow/tickets?${workflowParams({ ...filters, page, pageSize: 25 })}`,
        { signal },
      ),
    enabled: !!user && user.role === role,
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
  const rows = (result.data?.tickets ?? []).map((t) => ({
    t,
    days: daysOverdue(t),
  }));
  const loaded = !result.isPending;
  const stats = {
    count: metrics.overdueCount,
    owed: metrics.overdueAmount,
    oldest: metrics.oldestOverdueDays,
  };
  const summaryReady = !!metrics.updatedAt;
  const listSourceCount = result.data?.total ?? 0;
  const endorsementCounts = summaryReady
    ? {
        "All Overdue": metrics.overdueCount,
        "Not Flagged": metrics.unflaggedOverdueCount,
        "Flagged to PNP": metrics.flaggedCount,
      }
    : {};
  const dossier = useQuery({
    queryKey: ["workflow", "overdue-detail", user?.key, detailId],
    queryFn: ({ signal }) =>
      workflowRequest<{
        ticket: Ticket;
        history: Ticket[];
        historyTotal: number;
      }>(`/api/workflow/tickets/${encodeURIComponent(detailId!)}`, { signal }),
    enabled: !!detailId && !!user && user.role === role,
    staleTime: 0,
  });
  const detail = dossier.data
    ? { t: dossier.data.ticket, days: daysOverdue(dossier.data.ticket) }
    : null;
  const confirmTicket = confirm
    ? ([...(result.data?.tickets ?? []), ...(detail ? [detail.t] : [])].find(
        (t) =>
          t.id === confirm.id &&
          (confirm.action === "withdraw" ? isFlaggedToPnp(t) : isOverdue(t)),
      ) ?? null)
    : null;
  const license = detail?.t.licenseNo.replace(/[^a-z0-9]/gi, "").toUpperCase();
  const hasLicense = Boolean(
    license &&
    license.length >= 6 &&
    !["UNKNOWN", "NOLICENSE", "NOTAPPLICABLE", "UNLICENSED"].includes(license),
  );
  const offenseHistory =
    dossier.data?.history.filter((ticket) => ticket.id !== detailId) ?? [];
  const historyTotal = hasLicense
    ? Math.max(0, (dossier.data?.historyTotal ?? 0) - 1)
    : 0;

  const eligibleTickets = rows
    .map(({ t }) => t)
    .filter((ticket) => isOverdue(ticket) && !ticket.endorsedAt);
  const toggleSelection = (ticket: Ticket) => {
    if (batchBusy || !canEndorse || !isOverdue(ticket) || ticket.endorsedAt)
      return;
    setSelectedTickets((selected) =>
      selected.some((item) => item.id === ticket.id)
        ? selected.filter((item) => item.id !== ticket.id)
        : selected.length < 50
          ? [...selected, ticket]
          : selected,
    );
  };
  const selectionControl = (ticket: Ticket) =>
    canEndorse && isOverdue(ticket) && !ticket.endorsedAt ? (
      <label className="inline-flex min-h-11 items-center gap-2 text-xs font-semibold">
        <input
          type="checkbox"
          checked={selectedTickets.some((item) => item.id === ticket.id)}
          disabled={
            batchBusy ||
            (selectedTickets.length >= 50 &&
              !selectedTickets.some((item) => item.id === ticket.id))
          }
          onChange={() => toggleSelection(ticket)}
          aria-label={`Select ${ticket.id} for batch endorsement`}
          className="size-4 accent-rose-600"
        />
        <span>Select</span>
      </label>
    ) : null;
  const runBatch = async () => {
    if (
      !canEndorse ||
      batchBusy ||
      !selectedTickets.length ||
      batchReason.trim().length < 3
    )
      return;
    const ticketIds = selectedTickets.map((ticket) => ticket.id);
    setBatchBusy(true);
    setBatchError("");
    setBatchResults([]);
    try {
      const response = await workflowRequest<{
        results: BatchEndorsementResult[];
      }>("/api/workflow/endorsements/batch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ticketIds, reason: batchReason.trim() }),
      });
      const results = reconcileEndorsementResults(
        ticketIds,
        response.results ?? [],
      );
      setBatchResults(results);
      const succeeded = new Set(
        results.filter((result) => result.ok).map((result) => result.ticketId),
      );
      setSelectedTickets((selected) =>
        selected.filter((ticket) => !succeeded.has(ticket.id)),
      );
      if (succeeded.size)
        toast.success(
          `${succeeded.size} citation${succeeded.size === 1 ? "" : "s"} endorsed to PNP.`,
        );
      await queryClient.invalidateQueries({ queryKey: ["workflow"] });
      void metrics.refresh();
    } catch (error) {
      setBatchError(
        error instanceof Error
          ? error.message
          : "Unable to confirm the batch results. Refresh citation status before retrying.",
      );
    } finally {
      setBatchBusy(false);
    }
  };

  const requestConfirmation = (id: string, action: "endorse" | "withdraw") => {
    setEndorsementNote("");
    setConfirm({ id, action });
  };

  const runConfirm = async () => {
    if (!confirm || !confirmTicket) return;
    if (!user) {
      toast.error("Please sign in again.");
      return;
    }
    setBusy(true);
    try {
      if (confirm.action === "endorse") {
        await endorseToPnp(
          confirmTicket.id,
          user.name,
          endorsementNote.trim() || undefined,
        );
        toast.success(`${confirmTicket.id} endorsed to PNP`, {
          description: "It is now flagged in the PNP portal.",
        });
      } else {
        await withdrawEndorsement(confirmTicket.id);
        toast.success(`Endorsement withdrawn for ${confirmTicket.id}`);
      }
      setConfirm(null);
      await queryClient.invalidateQueries({ queryKey: ["workflow"] });
      void metrics.refresh();
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Unable to update PNP endorsement.",
      );
    } finally {
      setBusy(false);
    }
  };

  const exportCsv = async () => {
    setExporting(true);
    try {
      const allRows = (await loadAllCitationPages(filters)).map((t) => ({
        t,
        days: daysOverdue(t),
      }));
      downloadCsv(
        `citations-current-list-${localDateKey(new Date())}.csv`,
        [
          "Ticket",
          "Violator",
          "License",
          "Plate",
          "Vehicle",
          "Issued",
          "Due",
          "Days overdue",
          "Base fine",
          "Surcharge",
          "Outstanding amount",
          "Status",
          "Endorsed to PNP",
          "Endorsed by",
          "Endorsed at",
          "Endorsement notes",
        ],
        allRows.map(({ t, days }) => [
          t.id,
          t.violatorName,
          t.licenseNo,
          t.plateNo,
          t.vehicleType,
          shortDate(t.issuedAt),
          shortDate(t.dueDate),
          days,
          baseFine(t),
          surchargeOf(t),
          t.totalFine,
          t.status,
          isFlaggedToPnp(t) ? "Yes" : "No",
          t.endorsedBy ?? "",
          t.endorsedAt ? dateTime(t.endorsedAt) : "",
          t.endorsementNote ?? "",
        ]),
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to export the complete list.",
      );
    } finally {
      setExporting(false);
    }
  };

  const exportCheckpointCsv = async () => {
    setExporting(true);
    try {
      const checkpointTickets = await loadAllCitationPages({
        flag: "flagged",
        priority: "flagged",
      });
      const generatedAt = new Date();
      downloadCsv(
        `pnp-checkpoint-hotlist-all-${localDateKey(generatedAt)}.csv`,
        [
          "Generated at",
          "Scope",
          "Ticket",
          "Plate",
          "Vehicle / color",
          "Violator",
          "License",
          "Recorded violations",
          "Due",
          "Days overdue",
          "Amount owed",
          "Status",
          "Endorsed by",
          "Endorsed at",
          "Endorsement notes",
        ],
        checkpointTickets.map((ticket) => [
          dateTime(generatedAt.toISOString()),
          "All active flagged citations",
          ticket.id,
          ticket.plateNo,
          ticket.vehicleType,
          ticket.violatorName,
          ticket.licenseNo,
          ticket.violations.map((violation) => violation.label).join("; "),
          shortDate(ticket.dueDate),
          daysOverdue(ticket),
          ticket.totalFine,
          ticket.status,
          ticket.endorsedBy ?? "",
          dateTime(ticket.endorsedAt!),
          ticket.endorsementNote ?? "",
        ]),
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to export the complete hotlist.",
      );
    } finally {
      setExporting(false);
    }
  };

  const printHotlist = async () => {
    const preview = window.open("", "_blank");
    if (!preview) {
      toast.error("Allow pop-ups to open the checkpoint print preview.");
      return;
    }
    preview.opener = null;
    preview.document.title = "Preparing checkpoint hotlist";
    preview.document.body.textContent =
      "Retrieving all active flagged citations…";
    setExporting(true);
    try {
      const tickets = await loadAllCitationPages({
        flag: "flagged",
        priority: "flagged",
      });
      printCheckpointHotlist(tickets, preview);
    } catch (error) {
      preview.close();
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to prepare the complete hotlist.",
      );
    } finally {
      setExporting(false);
    }
  };

  /* Row actions shared by table + cards */
  const renderActions = (t: Ticket) => (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      <button
        type="button"
        onClick={() => setDetailId(t.id)}
        className={cn(iconBtn, "bg-muted text-foreground hover:bg-secondary")}
        aria-label={`View ${t.id}`}
        id={`overdue-view-${t.id}`}
      >
        <Eye className="size-3.5" />
        <span className="hidden xl:inline">View</span>
      </button>
      {canCollect && (
        <Link
          to="/treasury/cashier"
          search={{ ticket: t.id }}
          className={cn(
            iconBtn,
            "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90",
          )}
          id={`overdue-collect-${t.id}`}
        >
          <Banknote className="size-3.5" />
          Collect
        </Link>
      )}
      {canEndorse &&
        (t.endorsedAt ? (
          <button
            type="button"
            onClick={() => requestConfirmation(t.id, "withdraw")}
            className={cn(
              iconBtn,
              "border border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
            id={`overdue-withdraw-${t.id}`}
          >
            <ShieldOff className="size-3.5" />
            Withdraw
          </button>
        ) : (
          <button
            type="button"
            onClick={() => requestConfirmation(t.id, "endorse")}
            className={cn(
              iconBtn,
              "bg-rose-600 text-white shadow-sm hover:bg-rose-700",
            )}
            id={`overdue-endorse-${t.id}`}
          >
            <Siren className="size-3.5" />
            Endorse to PNP
          </button>
        ))}
    </div>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={copy.eyebrow}
        title="Overdue Citations"
        description={copy.description}
        icon={AlarmClock}
        actions={
          <button
            type="button"
            onClick={() => void exportCsv()}
            disabled={!result.data?.total || exporting}
            id="overdue-export-csv"
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-card px-4 text-sm font-semibold shadow-sm transition-all hover:bg-muted hover:shadow-lift disabled:pointer-events-none disabled:opacity-50"
          >
            <Download className="size-4" />
            {exporting ? "Preparing export…" : "Export current list"}
          </button>
        }
      />

      <WorkflowFeedback
        error={metrics.error}
        loading={metrics.loading}
        updatedAt={metrics.updatedAt}
        onRetry={() => void metrics.refresh()}
      />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 stagger-children">
        <StatCard
          label="Overdue citations"
          value={summaryReady ? stats.count : "—"}
          hint="Past due date, still unpaid"
          icon={AlertTriangle}
          tone="danger"
        />
        <StatCard
          label="Amount owed"
          value={summaryReady ? peso(stats.owed) : "—"}
          hint="Recorded fines outstanding"
          icon={Wallet}
          tone="warning"
        />
        <StatCard
          label="Flagged to PNP"
          value={summaryReady ? metrics.flaggedCount : "—"}
          hint={
            summaryReady
              ? `${peso(metrics.flaggedAmount)} in the active hotlist`
              : "Loading hotlist totals"
          }
          icon={ShieldCheck}
          tone="info"
        />
        <StatCard
          label="Oldest overdue"
          value={summaryReady && stats.oldest ? `${stats.oldest} days` : "—"}
          hint="Longest time past due"
          icon={Hourglass}
          tone="primary"
        />
      </div>

      {role === "pnp" && (
        <section
          aria-labelledby="checkpoint-hotlist-title"
          className="rounded-2xl border border-rose-200 bg-rose-50 p-5 dark:border-rose-500/30 dark:bg-rose-500/10"
        >
          <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
            <div className="space-y-1">
              <h2
                id="checkpoint-hotlist-title"
                className="flex items-center gap-2 font-bold text-rose-800 dark:text-rose-200"
              >
                <Siren className="size-5" />
                Checkpoint hotlist · {summaryReady
                  ? metrics.flaggedCount
                  : "—"}{" "}
                flagged
              </h2>
              <p className="max-w-2xl text-sm text-rose-700 dark:text-rose-200">
                Print or download all active flagged citations for today's
                briefing. Includes every active endorsement, regardless of the
                search and filters below. Paid citations are excluded.
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <button
                type="button"
                id="checkpoint-print"
                disabled={!summaryReady || !metrics.flaggedCount || exporting}
                className={cn(
                  iconBtn,
                  "h-10 bg-rose-700 text-white hover:bg-rose-800 disabled:pointer-events-none",
                )}
                onClick={() => void printHotlist()}
              >
                <Printer className="size-4" />
                Print hotlist
              </button>
              <button
                type="button"
                id="checkpoint-export-csv"
                disabled={!summaryReady || !metrics.flaggedCount || exporting}
                onClick={() => void exportCheckpointCsv()}
                className={cn(
                  iconBtn,
                  "h-10 border border-rose-200 bg-white text-rose-800 hover:bg-rose-100 disabled:pointer-events-none dark:border-rose-500/30 dark:bg-card dark:text-rose-200 dark:hover:bg-muted",
                )}
              >
                <Download className="size-4" />
                Download hotlist CSV
              </button>
            </div>
          </div>
        </section>
      )}

      <SectionCard
        title={
          endorsement === "Flagged to PNP"
            ? "Active flagged citations"
            : "Overdue list"
        }
        description={`${listSourceCount} matching citation${listSourceCount === 1 ? "" : "s"} · Export includes all matching pages`}
        icon={AlarmClock}
      >
        <div className="flex flex-col gap-3 border-b border-border p-4">
          <SearchInput
            id="overdue-search"
            value={query}
            onChange={(value) => {
              setSelectedTickets([]);
              setQuery(value);
            }}
            placeholder="Search ticket no., plate, name, or license"
            hotkey
          />
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
            <FilterChips
              options={endorsementFilters}
              value={endorsement}
              onChange={(value) => {
                setEndorsement(value);
                setAging("Any age");
                setPage(1);
              }}
              counts={endorsementCounts}
            />
            <FilterChips
              options={agingBuckets}
              value={aging}
              onChange={(value) => {
                setAging(value);
                setPage(1);
              }}
            />
          </div>
          {endorsement === "Flagged to PNP" && (
            <p className="text-xs text-muted-foreground">
              All active endorsements are included, even if the citation is
              contested or its due date has changed. Check the current status
              before taking action.
            </p>
          )}
        </div>

        {canEndorse && endorsement !== "Flagged to PNP" && (
          <section
            aria-label="Batch endorsement selection"
            className="flex flex-wrap items-center gap-3 border-b border-border bg-muted/20 px-4 py-3"
          >
            <p className="mr-auto text-sm">
              <strong>{selectedTickets.length} of 50 selected</strong>
              <span className="block text-xs text-muted-foreground">
                Select unflagged overdue citations, then review the endorsement.
              </span>
            </p>
            <button
              type="button"
              disabled={
                batchBusy ||
                !eligibleTickets.length ||
                selectedTickets.length >= 50
              }
              onClick={() =>
                setSelectedTickets((selected) =>
                  [
                    ...selected,
                    ...eligibleTickets.filter(
                      (ticket) =>
                        !selected.some((item) => item.id === ticket.id),
                    ),
                  ].slice(0, 50),
                )
              }
              className="min-h-11 rounded-lg border border-border px-3 text-sm font-semibold disabled:opacity-50"
            >
              Select current page
            </button>
            <button
              type="button"
              disabled={batchBusy || !selectedTickets.length}
              onClick={() => setSelectedTickets([])}
              className="min-h-11 rounded-lg border border-border px-3 text-sm font-semibold disabled:opacity-50"
            >
              Clear selection
            </button>
            <button
              type="button"
              disabled={batchBusy || !selectedTickets.length}
              onClick={() => {
                setBatchResults([]);
                setBatchError("");
                setBatchReason("");
                setBatchOpen(true);
              }}
              className="min-h-11 rounded-lg bg-rose-600 px-3 text-sm font-semibold text-white disabled:opacity-50"
            >
              Review selected
            </button>
          </section>
        )}

        <div className="px-4 py-3">
          <WorkflowFeedback
            error={result.error}
            loading={result.isFetching}
            updatedAt={result.dataUpdatedAt}
            onRetry={() => void result.refetch()}
          />
        </div>
        {!loaded ? (
          <ListSkeleton rows={5} />
        ) : !result.data ? (
          <p className="px-4 py-8 text-sm text-muted-foreground">
            Records are unavailable. Retry above.
          </p>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={listSourceCount === 0 ? ShieldCheck : AlarmClock}
            title={
              listSourceCount === 0
                ? endorsement === "Flagged to PNP"
                  ? "No active flagged citations"
                  : "No overdue citations"
                : "No citations match these filters"
            }
            description={
              listSourceCount === 0
                ? endorsement === "Flagged to PNP"
                  ? "There are no unpaid citations with an active PNP endorsement."
                  : "There are no overdue citations in the current records."
                : "Try a different search term or clear the filters."
            }
          />
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                    <th className="px-4 py-3 font-bold">Ticket</th>
                    <th className="px-4 py-3 font-bold">Violator</th>
                    <th className="px-4 py-3 font-bold">Due</th>
                    <th className="px-4 py-3 text-right font-bold">Fine</th>
                    <th className="px-4 py-3 text-right font-bold">
                      Surcharge
                    </th>
                    <th className="px-4 py-3 text-right font-bold">Owed</th>
                    <th className="px-4 py-3 font-bold">PNP</th>
                    <th className="px-4 py-3 font-bold">Status</th>
                    <th className="px-4 py-3 text-right font-bold">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ t, days }) => (
                    <tr
                      key={t.id}
                      className={cn(
                        "border-b border-border/60 transition-colors last:border-0 hover:bg-muted/30",
                        isFlaggedToPnp(t) && "bg-rose-500/10",
                      )}
                    >
                      <td className="px-4 py-3">
                        {selectionControl(t)}
                        <p className="font-mono text-xs font-semibold">
                          {t.id}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {t.plateNo} · {t.vehicleType}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-semibold">{t.violatorName}</p>
                        <p className="font-mono text-xs text-muted-foreground">
                          {t.licenseNo}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-xs font-semibold text-destructive">
                          {shortDate(t.dueDate)}
                        </p>
                        <div className="mt-1">
                          <DaysLateBadge days={days} />
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right tabular">
                        {peso(baseFine(t))}
                      </td>
                      <td className="px-4 py-3 text-right tabular text-muted-foreground">
                        {peso(surchargeOf(t))}
                      </td>
                      <td className="px-4 py-3 text-right font-bold tabular text-destructive">
                        {peso(t.totalFine)}
                      </td>
                      <td className="px-4 py-3">
                        <EndorsementBadge t={t} />
                      </td>
                      <td className="px-4 py-3 text-xs font-semibold">
                        {t.status}
                      </td>
                      <td className="px-4 py-3">{renderActions(t)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="space-y-3 p-3 md:hidden">
              {rows.map(({ t, days }) => (
                <div
                  key={t.id}
                  className={cn(
                    "rounded-2xl border border-border bg-card p-4 shadow-panel",
                    isFlaggedToPnp(t) && "border-rose-300/40 bg-rose-500/10",
                  )}
                >
                  {selectionControl(t)}
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-mono text-xs font-semibold text-muted-foreground">
                        {t.id}
                      </p>
                      <p className="mt-1 truncate text-base font-bold tracking-tight">
                        {t.violatorName}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {t.plateNo} · {t.vehicleType}
                      </p>
                    </div>
                    <DaysLateBadge days={days} />
                  </div>
                  <div className="mt-3 flex items-end justify-between gap-3 border-t border-border pt-3">
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">
                        Due {shortDate(t.dueDate)}
                      </p>
                      <EndorsementBadge t={t} compact />
                      <p className="text-xs font-semibold">{t.status}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[11px] text-muted-foreground">Owed</p>
                      <p className="font-bold tabular text-destructive">
                        {peso(t.totalFine)}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3">{renderActions(t)}</div>
                </div>
              ))}
            </div>
          </>
        )}

        {result.data && (
          <RecordPager
            page={page}
            pageSize={result.data.pageSize}
            total={result.data.total}
            loading={result.isFetching}
            onPage={setPage}
          />
        )}
        <div className="flex items-start gap-2 border-t border-border px-4 py-3 text-xs text-muted-foreground">
          <Info className="mt-px size-3.5 shrink-0" />
          {copy.note}
        </div>
      </SectionCard>

      {/* Detail dialog */}
      <Dialog
        open={!!detailId}
        onOpenChange={(open) => !open && setDetailId(null)}
      >
        <DialogContent className="max-h-[90dvh] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-2xl">
          {!detail && (
            <DialogHeader>
              <DialogTitle>Citation dossier</DialogTitle>
              <DialogDescription>
                Loading the selected citation and its recorded history.
              </DialogDescription>
            </DialogHeader>
          )}
          <WorkflowFeedback
            error={dossier.error}
            loading={dossier.isFetching}
            updatedAt={dossier.dataUpdatedAt}
            onRetry={() => void dossier.refetch()}
          />
          {detail && (
            <>
              <DialogHeader className="text-left">
                <DialogTitle className="flex flex-wrap items-center gap-2">
                  <span className="font-mono">{detail.t.id}</span>
                  <DaysLateBadge days={detail.days} />
                </DialogTitle>
                <DialogDescription>
                  Issued {shortDate(detail.t.issuedAt)} by {detail.t.issuedBy} ·
                  Due {shortDate(detail.t.dueDate)}
                </DialogDescription>
              </DialogHeader>

              <dl className="grid grid-cols-2 gap-3 rounded-xl border border-border bg-muted/30 p-4 text-sm">
                {[
                  ["Violator", detail.t.violatorName],
                  ["License no.", detail.t.licenseNo],
                  ["Plate no.", detail.t.plateNo],
                  ["Vehicle / color", detail.t.vehicleType],
                  ["Current status", detail.t.status],
                  ["Location", detail.t.location],
                ].map(([k, v]) => (
                  <div key={k} className={k === "Location" ? "col-span-2" : ""}>
                    <dt className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                      {k}
                    </dt>
                    <dd className="mt-0.5 font-semibold">{v}</dd>
                  </div>
                ))}
              </dl>

              <div className="space-y-2 text-sm">
                {detail.t.violations.map((v) => (
                  <div key={v.code} className="flex justify-between gap-3">
                    <span>{v.label}</span>
                    <span className="tabular">{peso(v.fine)}</span>
                  </div>
                ))}
                <div className="flex justify-between gap-3 text-muted-foreground">
                  <span>Overdue surcharge</span>
                  <span className="tabular">{peso(surchargeOf(detail.t))}</span>
                </div>
                <div className="flex items-center justify-between gap-3 rounded-xl bg-overdue px-4 py-3 text-overdue-foreground">
                  <span className="font-bold">
                    {detail.t.status === "Contested"
                      ? "Recorded amount · contested"
                      : "Outstanding amount"}
                  </span>
                  <span className="font-display text-xl font-bold tabular">
                    {peso(detail.t.totalFine)}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 rounded-xl border border-border p-3">
                <EndorsementBadge t={detail.t} />
                {detail.t.endorsedAt && (
                  <span className="text-xs text-muted-foreground">
                    {dateTime(detail.t.endorsedAt)}
                  </span>
                )}
              </div>

              {detail.t.endorsedAt && (
                <section className="rounded-xl border border-rose-300/40 bg-rose-500/10 p-3">
                  <h3 className="text-sm font-bold">Endorsement notes</h3>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
                    {detail.t.endorsementNote ||
                      "No endorsement notes were recorded."}
                  </p>
                </section>
              )}

              {detail.t.remarks && (
                <section className="rounded-xl border border-border p-3">
                  <h3 className="text-sm font-bold">Citation notes</h3>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
                    {detail.t.remarks}
                  </p>
                </section>
              )}

              <section className="space-y-2 rounded-xl border border-border p-3">
                <h3 className="text-sm font-bold">Recorded citation history</h3>
                <p className="text-xs text-muted-foreground">
                  {hasLicense
                    ? `${historyTotal} other citation${historyTotal === 1 ? "" : "s"} with the same license number. Showing ${offenseHistory.length} recent records; names alone are not used to match people.`
                    : "A valid license number is needed to match citation history. Names alone are not used to match people."}
                </p>
                {offenseHistory.map((ticket) => (
                  <div
                    key={ticket.id}
                    className="space-y-1 border-t border-border pt-2 text-xs"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-mono font-semibold">
                        {ticket.id}
                      </span>
                      <span className="font-semibold">
                        {ticket.status}
                        {isFlaggedToPnp(ticket) ? " · Flagged to PNP" : ""}
                      </span>
                    </div>
                    <p className="text-muted-foreground">
                      {shortDate(ticket.issuedAt)} · {ticket.plateNo} ·{" "}
                      {peso(ticket.totalFine)}
                    </p>
                    <p>
                      {ticket.violations
                        .map((violation) => violation.label)
                        .join("; ")}
                    </p>
                  </div>
                ))}
              </section>

              {detail.t.photoData && (
                <img
                  src={detail.t.photoData}
                  alt={`Evidence photo for ${detail.t.id}`}
                  className="max-h-64 w-full rounded-xl object-contain bg-black/90"
                />
              )}

              {(canCollect || canEndorse) && (
                <div className="border-t border-border pt-3">
                  {renderActions(detail.t)}
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

      {canEndorse && (
        <Dialog
          open={batchOpen}
          onOpenChange={(open) => {
            if (!batchBusy) setBatchOpen(open);
          }}
        >
          <DialogContent className="max-h-[90dvh] max-w-2xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Review batch endorsement</DialogTitle>
              <DialogDescription>
                Each selected citation is checked again before endorsement. A
                citation that has been paid or is no longer eligible will remain
                unchanged.
              </DialogDescription>
            </DialogHeader>
            <p className="text-sm font-semibold">
              {selectedTickets.length} selected ·{" "}
              {peso(
                selectedTickets.reduce(
                  (total, ticket) => total + ticket.totalFine,
                  0,
                ),
              )}{" "}
              recorded amount
            </p>
            {!!selectedTickets.length && (
              <ul className="max-h-48 space-y-2 overflow-y-auto rounded-xl border border-border p-3 text-sm">
                {selectedTickets.map((ticket) => (
                  <li
                    key={ticket.id}
                    className="flex flex-wrap justify-between gap-2"
                  >
                    <span>
                      <strong className="font-mono">{ticket.id}</strong> ·{" "}
                      {ticket.plateNo}
                    </span>
                    <span>{peso(ticket.totalFine)}</span>
                  </li>
                ))}
              </ul>
            )}
            {!!selectedTickets.length && (
              <div className="space-y-2">
                <label
                  htmlFor="batch-endorsement-reason"
                  className="text-sm font-semibold"
                >
                  Common endorsement reason (required)
                </label>
                <Textarea
                  id="batch-endorsement-reason"
                  value={batchReason}
                  onChange={(event) => setBatchReason(event.target.value)}
                  minLength={3}
                  maxLength={2000}
                  disabled={batchBusy}
                  aria-describedby="batch-endorsement-help"
                />
                <p
                  id="batch-endorsement-help"
                  className="text-xs text-muted-foreground"
                >
                  Use 3–2,000 characters. This reason is recorded for every
                  selected citation and shown to PNP.
                </p>
              </div>
            )}
            {batchError && (
              <p
                role="alert"
                className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive"
              >
                {batchError}
              </p>
            )}
            {!!batchResults.length && (
              <section
                aria-label="Batch endorsement results"
                className="space-y-2 rounded-xl border border-border p-3 text-sm"
                aria-live="polite"
              >
                <h3 className="font-semibold">
                  {batchResults.filter((result) => result.ok).length} endorsed ·{" "}
                  {batchResults.filter((result) => !result.ok).length} require
                  review
                </h3>
                {batchResults.map((result) => (
                  <p
                    key={result.ticketId}
                    className={
                      result.ok
                        ? "text-emerald-700 dark:text-emerald-300"
                        : "text-destructive"
                    }
                  >
                    <strong className="font-mono">{result.ticketId}</strong> ·{" "}
                    {result.ok ? "Endorsed to PNP" : result.error}
                  </p>
                ))}
                {selectedTickets.length > 0 && (
                  <p className="text-muted-foreground">
                    Failed or unconfirmed citations remain selected. Review
                    their current status before retrying.
                  </p>
                )}
              </section>
            )}
            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                disabled={batchBusy}
                onClick={() => setBatchOpen(false)}
                className="min-h-11 rounded-lg border border-border px-4 text-sm font-semibold disabled:opacity-50"
              >
                Close
              </button>
              {!!selectedTickets.length && (
                <button
                  type="button"
                  disabled={batchBusy || batchReason.trim().length < 3}
                  onClick={() => void runBatch()}
                  className="min-h-11 rounded-lg bg-rose-600 px-4 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {batchBusy
                    ? "Endorsing…"
                    : `Endorse ${selectedTickets.length} selected citation${selectedTickets.length === 1 ? "" : "s"}`}
                </button>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Endorse / withdraw confirmation */}
      <AlertDialog
        open={!!confirm && !!confirmTicket}
        onOpenChange={(open) => !open && !busy && setConfirm(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm?.action === "endorse"
                ? "Endorse this citation to the PNP?"
                : "Withdraw PNP endorsement?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmTicket &&
                (confirm?.action === "endorse"
                  ? `${confirmTicket.id} (${confirmTicket.violatorName}, ${confirmTicket.plateNo}) owes ${peso(confirmTicket.totalFine)}. It will be flagged for enforcement in the PNP portal.`
                  : `${confirmTicket.id} will no longer be flagged for enforcement in the PNP portal.`)}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {confirm?.action === "endorse" && (
            <div className="space-y-2">
              <label
                htmlFor="endorsement-note"
                className="text-sm font-semibold"
              >
                Endorsement notes{" "}
                <span className="font-normal text-muted-foreground">
                  (optional)
                </span>
              </label>
              <Textarea
                id="endorsement-note"
                value={endorsementNote}
                onChange={(event) => setEndorsementNote(event.target.value)}
                maxLength={2000}
                disabled={busy}
                placeholder="Reason for endorsement or instructions for the reviewing officer"
                aria-describedby="endorsement-note-help"
              />
              <p
                id="endorsement-note-help"
                className="text-xs text-muted-foreground"
              >
                These notes appear in the PNP dossier and checkpoint hotlist. Up
                to 2,000 characters.
              </p>
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(e) => {
                e.preventDefault();
                void runConfirm();
              }}
              className={
                confirm?.action === "endorse"
                  ? "bg-rose-600 text-white hover:bg-rose-700"
                  : undefined
              }
            >
              {busy
                ? "Saving…"
                : confirm?.action === "endorse"
                  ? "Endorse to PNP"
                  : "Withdraw"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
