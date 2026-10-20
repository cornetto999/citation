import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  AlarmClock,
  AlertTriangle,
  Banknote,
  Download,
  Eye,
  Hourglass,
  Info,
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
  inAgingBucket,
  isOverdue,
  surchargeOf,
  type AgingBucket,
} from "@/lib/overdue";
import { cn } from "@/lib/utils";
import type { Ticket } from "@/types";

export type OverdueBoardRole = "admin" | "treasury" | "pnp";

const endorsementFilters = ["All", "Not endorsed", "Endorsed to PNP"] as const;
type EndorsementFilter = (typeof endorsementFilters)[number];

interface Row {
  t: Ticket;
  days: number;
}

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
  if (!t.endorsedAt) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
        <ShieldOff className="size-3" />
        Not endorsed
      </span>
    );
  }
  return (
    <div className="flex flex-col gap-0.5">
      <span className="inline-flex w-fit items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-bold text-rose-700 dark:bg-rose-500/15 dark:text-rose-300">
        <Siren className="size-3" />
        Endorsed to PNP
      </span>
      {!compact && (
        <span className="text-[11px] text-muted-foreground">
          {t.endorsedBy ? `${t.endorsedBy} · ` : ""}
          {shortDate(t.endorsedAt)}
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
  const tickets = useTicketStore((s) => s.tickets);
  const loaded = useTicketStore((s) => s.loaded);
  const endorseToPnp = useTicketStore((s) => s.endorseToPnp);
  const withdrawEndorsement = useTicketStore((s) => s.withdrawEndorsement);

  const [query, setQuery] = useState("");
  const [endorsement, setEndorsement] = useState<EndorsementFilter>("All");
  const [aging, setAging] = useState<AgingBucket>("Any age");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{
    id: string;
    action: "endorse" | "withdraw";
  } | null>(null);
  const [busy, setBusy] = useState(false);

  const canEndorse = role !== "pnp";
  const canCollect = role === "treasury";
  const copy = roleCopy[role];

  const overdue = useMemo<Row[]>(
    () =>
      tickets
        .filter(isOverdue)
        .map((t) => ({ t, days: daysOverdue(t) }))
        .sort((a, b) => {
          if (role === "pnp") {
            const ea = a.t.endorsedAt ? 1 : 0;
            const eb = b.t.endorsedAt ? 1 : 0;
            if (ea !== eb) return eb - ea;
          }
          return b.days - a.days;
        }),
    [tickets, role],
  );

  const stats = useMemo(() => {
    const endorsed = overdue.filter((r) => r.t.endorsedAt);
    return {
      count: overdue.length,
      owed: overdue.reduce((s, r) => s + r.t.totalFine, 0),
      endorsedCount: endorsed.length,
      endorsedOwed: endorsed.reduce((s, r) => s + r.t.totalFine, 0),
      oldest: overdue.reduce((m, r) => Math.max(m, r.days), 0),
    };
  }, [overdue]);

  const endorsementCounts = useMemo(
    () => ({
      All: overdue.length,
      "Not endorsed": overdue.filter((r) => !r.t.endorsedAt).length,
      "Endorsed to PNP": overdue.filter((r) => r.t.endorsedAt).length,
    }),
    [overdue],
  );

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return overdue.filter(({ t, days }) => {
      if (endorsement === "Endorsed to PNP" && !t.endorsedAt) return false;
      if (endorsement === "Not endorsed" && t.endorsedAt) return false;
      if (!inAgingBucket(days, aging)) return false;
      if (!q) return true;
      return (
        t.id.toLowerCase().includes(q) ||
        t.plateNo.toLowerCase().includes(q) ||
        t.violatorName.toLowerCase().includes(q) ||
        t.licenseNo.toLowerCase().includes(q)
      );
    });
  }, [overdue, query, endorsement, aging]);

  const detail = detailId
    ? (overdue.find((r) => r.t.id === detailId) ?? null)
    : null;
  const confirmTicket = confirm
    ? (overdue.find((r) => r.t.id === confirm.id)?.t ?? null)
    : null;

  const runConfirm = async () => {
    if (!confirm || !confirmTicket) return;
    if (!user) {
      toast.error("Please sign in again.");
      return;
    }
    setBusy(true);
    try {
      if (confirm.action === "endorse") {
        await endorseToPnp(confirmTicket.id, user.name);
        toast.success(`${confirmTicket.id} endorsed to PNP`, {
          description: "It is now flagged in the PNP portal.",
        });
      } else {
        await withdrawEndorsement(confirmTicket.id);
        toast.success(`Endorsement withdrawn for ${confirmTicket.id}`);
      }
      setConfirm(null);
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Unable to update PNP endorsement.",
      );
    } finally {
      setBusy(false);
    }
  };

  const exportCsv = () => {
    downloadCsv(
      `overdue-citations-${localDateKey(new Date())}.csv`,
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
        "Total owed",
        "Endorsed to PNP",
        "Endorsed by",
        "Endorsed at",
      ],
      rows.map(({ t, days }) => [
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
        t.endorsedAt ? "Yes" : "No",
        t.endorsedBy ?? "",
        t.endorsedAt ? dateTime(t.endorsedAt) : "",
      ]),
    );
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
            onClick={() => setConfirm({ id: t.id, action: "withdraw" })}
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
            onClick={() => setConfirm({ id: t.id, action: "endorse" })}
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
            onClick={exportCsv}
            disabled={rows.length === 0}
            id="overdue-export-csv"
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-card px-4 text-sm font-semibold shadow-sm transition-all hover:bg-muted hover:shadow-lift disabled:pointer-events-none disabled:opacity-50"
          >
            <Download className="size-4" />
            Export CSV
          </button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 stagger-children">
        <StatCard
          label="Overdue citations"
          value={stats.count}
          hint="Past due date, still unpaid"
          icon={AlertTriangle}
          tone="danger"
        />
        <StatCard
          label="Amount owed"
          value={peso(stats.owed)}
          hint="Fines + surcharges outstanding"
          icon={Wallet}
          tone="warning"
        />
        <StatCard
          label="Endorsed to PNP"
          value={stats.endorsedCount}
          hint={`${peso(stats.endorsedOwed)} under enforcement`}
          icon={ShieldCheck}
          tone="info"
        />
        <StatCard
          label="Oldest overdue"
          value={stats.oldest ? `${stats.oldest} days` : "—"}
          hint="Longest time past due"
          icon={Hourglass}
          tone="primary"
        />
      </div>

      <SectionCard
        title="Overdue list"
        description={`${rows.length} of ${overdue.length} citation${overdue.length === 1 ? "" : "s"}`}
        icon={AlarmClock}
      >
        <div className="flex flex-col gap-3 border-b border-border p-4">
          <SearchInput
            id="overdue-search"
            value={query}
            onChange={setQuery}
            placeholder="Search ticket no., plate, name, or license"
            hotkey
          />
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
            <FilterChips
              options={endorsementFilters}
              value={endorsement}
              onChange={setEndorsement}
              counts={endorsementCounts}
            />
            <FilterChips
              options={agingBuckets}
              value={aging}
              onChange={setAging}
            />
          </div>
        </div>

        {!loaded ? (
          <ListSkeleton rows={5} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={overdue.length === 0 ? ShieldCheck : AlarmClock}
            title={
              overdue.length === 0
                ? "No overdue citations"
                : "No citations match these filters"
            }
            description={
              overdue.length === 0
                ? "Every issued citation is either paid or still within its due date."
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
                        t.endorsedAt && "bg-rose-50/60 dark:bg-rose-500/5",
                      )}
                    >
                      <td className="px-4 py-3">
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
                    t.endorsedAt &&
                      "border-rose-200 bg-rose-50/60 dark:border-rose-500/30 dark:bg-rose-500/5",
                  )}
                >
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

        <div className="flex items-start gap-2 border-t border-border px-4 py-3 text-xs text-muted-foreground">
          <Info className="mt-px size-3.5 shrink-0" />
          {copy.note}
        </div>
      </SectionCard>

      {/* Detail dialog */}
      <Dialog
        open={!!detail}
        onOpenChange={(open) => !open && setDetailId(null)}
      >
        <DialogContent className="max-h-[90dvh] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-2xl">
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
                  ["Vehicle", detail.t.vehicleType],
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
                  <span className="font-bold">Total owed</span>
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
