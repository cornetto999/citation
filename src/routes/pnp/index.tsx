import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, memo } from "react";
import { useAuthStore } from "@/store/useAuthStore";
import { AlertTriangle, Eye, Search, Siren } from "lucide-react";
import { StatusBadge } from "@/components/StatusBadge";
import { useTicketStore } from "@/store/useTicketStore";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

import { daysUntil, peso, shortDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Ticket, TicketStatus } from "@/types";

export const Route = createFileRoute("/pnp/")({
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

const TicketRow = memo(({ t }: { t: Ticket }) => {
  const left = daysUntil(t.dueDate);
  const late = t.status !== "Paid" && left < 0;
  return (
    <tr
      className={cn(
        "border-b border-border/60 last:border-0 transition-colors",
        t.endorsedAt
          ? "bg-rose-50/60 hover:bg-rose-100/50 dark:bg-rose-500/5 dark:hover:bg-rose-500/10"
          : "hover:bg-muted/30",
      )}
    >
      <td className="px-4 py-3">
        <div className="flex items-center gap-1.5">
          {t.endorsedAt && (
            <span
              title={`Flagged for PNP enforcement by ${t.endorsedBy || "Treasury/Admin"}`}
            >
              <Siren className="size-3.5 shrink-0 text-rose-600 animate-pulse" />
            </span>
          )}
          <span className="font-mono text-xs font-semibold">{t.id}</span>
        </div>
      </td>
      <td className="px-4 py-3">
        <p className="font-semibold">{t.plateNo}</p>
        <p className="text-xs text-muted-foreground">{t.vehicleType}</p>
      </td>
      <td className="px-4 py-3">
        <p>{t.violatorName}</p>
        <p className="font-mono text-xs text-muted-foreground">{t.licenseNo}</p>
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
                {Math.abs(left)}d late
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
        <div className="flex flex-col items-start gap-1">
          <StatusBadge status={t.status} />
          {t.endorsedAt && (
            <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-700 dark:bg-rose-500/20 dark:text-rose-300">
              <Siren className="size-2.5" />
              Flagged PNP
            </span>
          )}
        </div>
      </td>
      <td className="px-4 py-3 text-center">
        {t.photoData ? (
          <Dialog>
            <DialogTrigger asChild>
              <button className="inline-flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary hover:bg-primary/20 active:scale-95 transition-all">
                <Eye className="size-4" />
              </button>
            </DialogTrigger>
            <DialogContent className="max-w-xl p-0 overflow-hidden border-none bg-black/90">
              <img
                src={t.photoData}
                alt="Evidence"
                className="w-full object-contain"
              />
            </DialogContent>
          </Dialog>
        ) : (
          <span className="text-xs text-muted-foreground">-</span>
        )}
      </td>
    </tr>
  );
});

/* Mobile card variant for small screens */
const TicketCard = memo(({ t }: { t: Ticket }) => {
  const left = daysUntil(t.dueDate);
  const late = t.status !== "Paid" && left < 0;
  return (
    <div
      className={cn(
        "rounded-2xl border border-border bg-card p-4 shadow-panel transition-all hover:shadow-lift",
        t.endorsedAt &&
          "border-rose-300 bg-rose-50/50 dark:border-rose-500/30 dark:bg-rose-500/5",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            {t.endorsedAt && (
              <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-700 dark:bg-rose-500/20 dark:text-rose-300">
                <Siren className="size-2.5" />
                Flagged PNP
              </span>
            )}
            <p className="font-mono text-xs font-semibold text-muted-foreground">
              {t.id}
            </p>
          </div>
          <p className="mt-1 text-base font-bold tracking-tight">{t.plateNo}</p>
          <p className="text-sm text-muted-foreground">{t.violatorName}</p>
        </div>
        <StatusBadge status={t.status} />
      </div>
      <div className="mt-3 text-xs text-muted-foreground">
        {t.violations.map((v) => v.label).join(", ")}
      </div>
      <div className="mt-3 flex items-center justify-between border-t border-border pt-3 text-sm">
        <div className="flex flex-col gap-0.5">
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
              {late ? `${Math.abs(left)}d overdue` : `${left}d left`}
            </span>
          )}
        </div>
        <span className="font-bold tabular">{peso(t.totalFine)}</span>
      </div>
    </div>
  );
});

function PnpPage() {
  const user = useAuthStore((s) => s.user);
  const tickets = useTicketStore((s) => s.tickets);

  const [filter, setFilter] = useState<(typeof filters)[number]>("All");
  const [query, setQuery] = useState("");

  const flaggedTickets = useMemo(
    () => tickets.filter((t) => Boolean(t.endorsedAt)),
    [tickets],
  );

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tickets
      .filter((t) => {
        if (filter === "All") return true;
        if (filter === "Flagged to PNP") return Boolean(t.endorsedAt);
        return t.status === (filter as TicketStatus);
      })
      .filter(
        (t) =>
          !q ||
          t.id.toLowerCase().includes(q) ||
          t.plateNo.toLowerCase().includes(q) ||
          t.violatorName.toLowerCase().includes(q),
      );
  }, [tickets, filter, query]);

  const stats = [
    {
      label: "Total citations",
      value: String(tickets.length),
      description: "All issued citations across field units.",
      tickets,
      highlight: false,
    },
    {
      label: "Flagged to PNP",
      value: String(flaggedTickets.length),
      description:
        "High-priority citations endorsed by LGU / Treasury for police checkpoint interception & enforcement.",
      tickets: flaggedTickets,
      highlight: true,
    },
    {
      label: "Unpaid",
      value: String(tickets.filter((t) => t.status === "Unpaid").length),
      description: "Citations awaiting payment.",
      tickets: tickets.filter((t) => t.status === "Unpaid"),
      highlight: false,
    },
    {
      label: "Overdue",
      value: String(tickets.filter((t) => t.status === "Overdue").length),
      description: "Overdue citations awaiting settlement.",
      tickets: tickets.filter((t) => t.status === "Overdue"),
      highlight: false,
    },
    {
      label: "Collected",
      value: peso(
        tickets
          .filter((t) => t.status === "Paid")
          .reduce((s, t) => s + (t.payment?.amount ?? 0), 0),
      ),
      description: "Recorded payments for paid citations.",
      tickets: tickets.filter((t) => t.status === "Paid"),
      highlight: false,
    },
  ];

  if (!user || user.role !== "pnp") return null;

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5 stagger-children">
        {stats.map((s) => (
          <Dialog key={s.label}>
            <DialogTrigger asChild>
              <button
                type="button"
                className={cn(
                  "cursor-pointer rounded-2xl border bg-card p-4 text-left shadow-panel transition-all hover:shadow-lift hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  s.highlight && Number(s.value) > 0
                    ? "border-rose-300/80 bg-rose-50/40 dark:border-rose-500/40 dark:bg-rose-500/5"
                    : "border-border",
                )}
              >
                <span className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  <span>{s.label}</span>
                  {s.highlight && Number(s.value) > 0 && (
                    <span className="flex items-center gap-1 text-[10px] font-bold text-rose-600 dark:text-rose-400">
                      <Siren className="size-3 animate-pulse" />
                      Priority
                    </span>
                  )}
                </span>
                <span
                  className={cn(
                    "mt-1.5 block font-display text-2xl font-bold tabular",
                    s.highlight && Number(s.value) > 0
                      ? "text-rose-600 dark:text-rose-400"
                      : "",
                  )}
                >
                  {s.value}
                </span>
              </button>
            </DialogTrigger>
            <DialogContent className="max-h-[85dvh] w-[calc(100%-2rem)] max-w-2xl grid-rows-[auto_auto_minmax(0,1fr)] gap-4 overflow-hidden rounded-2xl p-4 sm:p-6">
              <DialogHeader className="pr-6 text-left">
                <DialogTitle>{s.label}</DialogTitle>
                <DialogDescription>{s.description}</DialogDescription>
              </DialogHeader>
              <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3">
                <p className="font-display text-2xl font-bold tabular">
                  {s.value}
                </p>
                <p className="text-sm text-muted-foreground">
                  {s.tickets.length}{" "}
                  {s.tickets.length === 1 ? "citation" : "citations"}
                </p>
              </div>
              <div className="min-h-0 space-y-3 overflow-y-auto overscroll-contain pr-1">
                {s.tickets.map((ticket) => (
                  <div key={ticket.id} className="space-y-2">
                    <TicketCard t={ticket} />
                    {s.label === "Collected" && ticket.payment && (
                      <div className="flex flex-wrap justify-between gap-2 px-4 pb-2 text-xs text-muted-foreground">
                        <span>
                          {ticket.payment.orNumber} · {ticket.payment.channel} ·{" "}
                          {shortDate(ticket.payment.paidAt)}
                        </span>
                        <span className="font-semibold tabular text-foreground">
                          Paid {peso(ticket.payment.amount)}
                        </span>
                      </div>
                    )}
                  </div>
                ))}
                {s.tickets.length === 0 && (
                  <p className="py-10 text-center text-sm text-muted-foreground">
                    {s.label === "Collected"
                      ? "No payments have been recorded yet."
                      : `No ${s.label.toLowerCase()} citations.`}
                  </p>
                )}
              </div>
            </DialogContent>
          </Dialog>
        ))}
      </div>

      <div className="mt-6 rounded-2xl border border-border bg-card shadow-panel">
        <div className="flex flex-wrap items-center gap-3 border-b border-border p-4">
          <div className="relative min-w-0 flex-1 sm:min-w-56">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search ticket no., plate, or name"
              className="h-10 w-full rounded-xl border border-input bg-background pl-10 pr-3 text-sm outline-none transition-all focus:border-ring focus:ring-2 focus:ring-ring/20"
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {filters.map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={cn(
                  "h-9 rounded-xl px-3.5 text-sm font-semibold transition-all inline-flex items-center gap-1.5",
                  filter === f
                    ? f === "Flagged to PNP"
                      ? "bg-rose-600 text-white shadow-sm"
                      : "bg-primary text-primary-foreground shadow-sm"
                    : f === "Flagged to PNP" && flaggedTickets.length > 0
                      ? "bg-rose-100 text-rose-700 hover:bg-rose-200 dark:bg-rose-500/20 dark:text-rose-300"
                      : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground",
                )}
              >
                {f === "Flagged to PNP" && <Siren className="size-3.5" />}
                {f}
                {f === "Flagged to PNP" && flaggedTickets.length > 0 && (
                  <span
                    className={cn(
                      "rounded-full px-1.5 py-px text-[10px] font-bold tabular",
                      filter === f
                        ? "bg-white/20 text-white"
                        : "bg-rose-600 text-white",
                    )}
                  >
                    {flaggedTickets.length}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Desktop table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-3 font-bold">Ticket no.</th>
                <th className="px-4 py-3 font-bold">Plate / Vehicle</th>
                <th className="px-4 py-3 font-bold">Violator</th>
                <th className="px-4 py-3 font-bold">Violations</th>
                <th className="px-4 py-3 font-bold">Issued</th>
                <th className="px-4 py-3 font-bold">Due</th>
                <th className="px-4 py-3 text-right font-bold">Fine</th>
                <th className="px-4 py-3 font-bold">Status</th>
                <th className="px-4 py-3 text-center font-bold">Photo</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => (
                <TicketRow key={t.id} t={t} />
              ))}
              {rows.length === 0 && (
                <tr>
                  <td
                    colSpan={9}
                    className="px-4 py-16 text-center text-muted-foreground"
                  >
                    {filter === "Flagged to PNP"
                      ? "No citations are currently flagged for PNP enforcement."
                      : "No citations match this view."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile card list */}
        <div className="md:hidden p-3 space-y-3">
          {rows.map((t) => (
            <TicketCard key={t.id} t={t} />
          ))}
          {rows.length === 0 && (
            <p className="py-12 text-center text-sm text-muted-foreground">
              {filter === "Flagged to PNP"
                ? "No citations are currently flagged for PNP enforcement."
                : "No citations match this view."}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 border-t border-border px-4 py-3 text-xs text-muted-foreground">
          <Eye className="size-3.5" />
          Monitoring access is read-only. Payment posting is handled by the
          Municipal Treasury.
        </div>
      </div>
    </>
  );
}
