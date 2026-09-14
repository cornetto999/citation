import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useAuthStore } from "@/store/useAuthStore";
import { AlertTriangle, Eye, Search } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { PnpSidebar } from "@/components/PnpSidebar";
import { StatusBadge } from "@/components/StatusBadge";
import { useTicketStore } from "@/store/useTicketStore";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { ClientOnly } from "@/components/ClientOnly";

import { daysUntil, peso, shortDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { TicketStatus } from "@/types";

export const Route = createFileRoute("/pnp")({
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

const filters = ["All", "Unpaid", "Paid", "Overdue", "Contested"] as const;

function PnpPage() {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const tickets = useTicketStore((s) => s.tickets);

  useEffect(() => {
    if (!user || user.role !== "pnp") {
      navigate({ to: "/login" });
    }
  }, [user, navigate]);

  const [filter, setFilter] = useState<(typeof filters)[number]>("All");
  const [query, setQuery] = useState("");

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tickets
      .filter((t) =>
        filter === "All" ? true : t.status === (filter as TicketStatus),
      )
      .filter(
        (t) =>
          !q ||
          t.id.toLowerCase().includes(q) ||
          t.plateNo.toLowerCase().includes(q) ||
          t.violatorName.toLowerCase().includes(q),
      );
  }, [tickets, filter, query]);

  const stats = [
    { label: "Total citations", value: String(tickets.length) },
    {
      label: "Unpaid",
      value: String(tickets.filter((t) => t.status === "Unpaid").length),
    },
    {
      label: "Overdue",
      value: String(tickets.filter((t) => t.status === "Overdue").length),
    },
    {
      label: "Collected",
      value: peso(
        tickets
          .filter((t) => t.status === "Paid")
          .reduce((s, t) => s + t.payment!.amount, 0),
      ),
    },
  ];

  if (!user || user.role !== "pnp") return null;
  const officer = user;

  return (
    <ClientOnly>
      <AppShell
        title="Citation Monitoring"
        subtitle="Read-only command view · live feed from field units"
        operator={officer.name}
        unit={officer.unit}
        accessLabel="PNP"
        sidebar={<PnpSidebar />}
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map((s) => (
            <div
              key={s.label}
              className="rounded-xl border border-border bg-card p-4 shadow-panel"
            >
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                {s.label}
              </p>
              <p className="mt-1 font-display text-2xl font-bold tabular">
                {s.value}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-6 rounded-xl border border-border bg-card shadow-panel">
          <div className="flex flex-wrap items-center gap-3 border-b border-border p-4">
            <div className="relative min-w-56 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search ticket no., plate, or name"
                className="h-10 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-sm outline-none focus:border-ring"
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {filters.map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={cn(
                    "h-9 rounded-lg px-3 text-sm font-medium transition-colors",
                    filter === f
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary text-secondary-foreground hover:bg-muted",
                  )}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3 font-semibold">Ticket no.</th>
                  <th className="px-4 py-3 font-semibold">Plate / Vehicle</th>
                  <th className="px-4 py-3 font-semibold">Violator</th>
                  <th className="px-4 py-3 font-semibold">Violations</th>
                  <th className="px-4 py-3 font-semibold">Issued</th>
                  <th className="px-4 py-3 font-semibold">Due</th>
                  <th className="px-4 py-3 text-right font-semibold">Fine</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 text-center font-semibold">Photo</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((t) => {
                  const left = daysUntil(t.dueDate);
                  const late = t.status !== "Paid" && left < 0;
                  return (
                    <tr
                      key={t.id}
                      className="border-b border-border/60 last:border-0 hover:bg-muted/50"
                    >
                      <td className="px-4 py-3 font-mono text-xs font-semibold">
                        {t.id}
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-semibold">{t.plateNo}</p>
                        <p className="text-xs text-muted-foreground">
                          {t.vehicleType}
                        </p>
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
                      <td className="px-4 py-3 text-xs">
                        {shortDate(t.issuedAt)}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        <span
                          className={cn(late && "font-semibold text-destructive")}
                        >
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
                          <StatusBadge status={t.status} />
                        </td>
                        <td className="px-4 py-3 text-center">
                          {t.photoData ? (
                            <Dialog>
                              <DialogTrigger asChild>
                                <button className="inline-flex size-8 items-center justify-center rounded-lg bg-secondary text-secondary-foreground hover:bg-muted active:scale-95 transition-all">
                                  <Eye className="size-4" />
                                </button>
                              </DialogTrigger>
                              <DialogContent className="max-w-xl p-0 overflow-hidden border-none bg-black/90">
                                <img src={t.photoData} alt="Evidence" className="w-full object-contain" />
                              </DialogContent>
                            </Dialog>
                          ) : (
                            <span className="text-xs text-muted-foreground">-</span>
                          )}
                        </td>
                      </tr>
                  );
                })}
                {rows.length === 0 && (
                  <tr>
                    <td
                      colSpan={9}
                      className="px-4 py-16 text-center text-muted-foreground"
                    >
                      No citations match this view.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="flex items-center gap-2 border-t border-border px-4 py-3 text-xs text-muted-foreground">
            <Eye className="size-3.5" />
            Monitoring access is read-only. Payment posting is handled by the
            Municipal Treasury.
          </div>
        </div>
      </AppShell>
    </ClientOnly>
  );
}
