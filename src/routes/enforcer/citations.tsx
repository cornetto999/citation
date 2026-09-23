import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { CalendarDays, ClipboardList, Search, WalletCards } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { EnforcerSidebar } from "@/components/EnforcerSidebar";
import { StatusBadge } from "@/components/StatusBadge";
import { dateTime, peso } from "@/lib/format";
import { useAuthStore } from "@/store/useAuthStore";
import { useTicketStore } from "@/store/useTicketStore";
import type { TicketStatus } from "@/types";

const statusAccent: Record<TicketStatus, string> = {
  Paid: "border-l-paid-foreground",
  Unpaid: "border-l-unpaid-foreground",
  Overdue: "border-l-overdue-foreground",
  Contested: "border-l-contested-foreground",
};

export const Route = createFileRoute("/enforcer/citations")({
  head: () => ({
    meta: [{ title: "My Citations | Traffic Enforcer" }],
  }),
  component: EnforcerCitationsPage,
});

function EnforcerCitationsPage() {
  const user = useAuthStore((s) => s.user);
  const tickets = useTicketStore((s) => s.tickets);
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [dateRange, setDateRange] = useState("all");

  useEffect(() => {
    if (!user || user.role !== "enforcer") {
      navigate({ to: "/login" });
    }
  }, [navigate, user]);

  const allMyTickets = useMemo(
    () => tickets.filter((ticket) => ticket.issuedBy === user?.name),
    [tickets, user?.name],
  );

  const myTickets = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return allMyTickets.filter((ticket) => {
      const matchesQuery =
        !normalizedQuery ||
        ticket.id.toLowerCase().includes(normalizedQuery) ||
        ticket.plateNo.toLowerCase().includes(normalizedQuery) ||
        ticket.violatorName.toLowerCase().includes(normalizedQuery);

      if (!matchesQuery) return false;

      if (dateRange !== "all") {
        const startDate = new Date();
        if (dateRange === "7-days") startDate.setDate(startDate.getDate() - 7);
        if (dateRange === "1-month")
          startDate.setMonth(startDate.getMonth() - 1);
        if (dateRange === "1-year")
          startDate.setFullYear(startDate.getFullYear() - 1);

        if (new Date(ticket.issuedAt) < startDate) return false;
      }

      return true;
    });
  }, [allMyTickets, dateRange, query]);

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
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-bold tracking-tight">
              Citation activity
            </h2>
            <p className="text-sm text-muted-foreground">
              {myTickets.length} result{myTickets.length === 1 ? "" : "s"}
            </p>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1.5 text-xs font-bold text-primary">
            <WalletCards className="size-3.5" /> Fine records
          </span>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search ticket, plate, or driver…"
              aria-label="Search my citations"
              className="h-12 w-full rounded-xl border border-input bg-card pl-10 pr-4 text-base shadow-sm outline-none transition-all placeholder:text-muted-foreground/60 focus:border-ring focus:ring-2 focus:ring-ring/20"
            />
          </div>
          <div className="relative">
            <CalendarDays className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <select
              value={dateRange}
              onChange={(event) => setDateRange(event.target.value)}
              aria-label="Filter by date range"
              className="h-12 w-full appearance-none rounded-xl border border-input bg-card py-0 pl-10 pr-9 text-sm font-medium shadow-sm outline-none transition-all focus:border-ring focus:ring-2 focus:ring-ring/20 sm:w-auto"
            >
              <option value="all">All time</option>
              <option value="7-days">Last 7 days</option>
              <option value="1-month">Last 1 month</option>
              <option value="1-year">Last 1 year</option>
            </select>
          </div>
        </div>

        <div className="space-y-3 stagger-children">
          {myTickets.map((ticket) => (
            <article
              key={ticket.id}
              className={`rounded-2xl border border-border border-l-4 bg-card p-4 shadow-panel transition-all hover:shadow-lift hover:-translate-y-0.5 ${statusAccent[ticket.status]}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-mono text-xs text-muted-foreground">
                    {ticket.id}
                  </p>
                  <h3 className="mt-1 text-lg font-bold tracking-tight">
                    {ticket.plateNo}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {ticket.vehicleType} · {ticket.violatorName}
                  </p>
                </div>
                <StatusBadge status={ticket.status} />
              </div>
              <div className="mt-4 border-t border-border pt-3 text-sm">
                <p className="font-medium leading-6">
                  {ticket.violations
                    .map((violation) => violation.label)
                    .join(", ")}
                </p>
                <div className="mt-3 flex items-center justify-between gap-3 text-muted-foreground">
                  <time dateTime={ticket.issuedAt}>
                    {dateTime(ticket.issuedAt)}
                  </time>
                  <span className="rounded-lg bg-primary/10 px-2.5 py-1 font-bold tabular text-primary">
                    {peso(ticket.totalFine)}
                  </span>
                </div>
                {ticket.photoData && (
                  <div className="mt-4 overflow-hidden rounded-xl border border-border bg-black/5">
                    <img
                      src={ticket.photoData}
                      alt="Evidence"
                      className="h-40 w-full object-contain"
                    />
                  </div>
                )}
              </div>
            </article>
          ))}
          {myTickets.length === 0 && (
            <p className="rounded-2xl border border-dashed border-border bg-card px-4 py-10 text-center text-sm text-muted-foreground">
              No citations match your search.
            </p>
          )}
        </div>
      </div>
    </AppShell>
  );
}
