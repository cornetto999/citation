import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowUpRight, ClipboardList, Search, WalletCards } from "lucide-react";
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

function Metric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-3.5 shadow-panel">
      <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 font-display text-xl font-bold tabular">{value}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

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
    return allMyTickets.filter(
      (ticket) =>
        !normalizedQuery ||
        ticket.id.toLowerCase().includes(normalizedQuery) ||
        ticket.plateNo.toLowerCase().includes(normalizedQuery) ||
        ticket.violatorName.toLowerCase().includes(normalizedQuery),
    );
  }, [allMyTickets, query]);

  const outstandingCount = allMyTickets.filter(
    (ticket) => ticket.status === "Unpaid" || ticket.status === "Overdue",
  ).length;
  const totalAssessed = allMyTickets.reduce(
    (sum, ticket) => sum + ticket.totalFine,
    0,
  );

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
        <section className="rounded-2xl border border-border bg-card p-5 shadow-panel sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-primary">
                <ClipboardList className="size-5" />
              </span>
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
                  Citation register
                </p>
                <h1 className="mt-1 font-display text-2xl font-bold tracking-tight sm:text-3xl">
                  My citations
                </h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  Review citations issued from your field desk.
                </p>
              </div>
            </div>
            <Link
              to="/enforcer"
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-3.5 text-sm font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              New citation <ArrowUpRight className="size-4" />
            </Link>
          </div>
          <div className="mt-5 grid grid-cols-3 gap-2.5 sm:gap-3">
            <Metric
              label="Issued"
              value={String(allMyTickets.length)}
              detail="all time"
            />
            <Metric
              label="Open"
              value={String(outstandingCount)}
              detail="needs settlement"
            />
            <Metric
              label="Assessed"
              value={peso(totalAssessed)}
              detail="total fines"
            />
          </div>
        </section>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-bold">
              Citation activity
            </h2>
            <p className="text-sm text-muted-foreground">
              {myTickets.length} result{myTickets.length === 1 ? "" : "s"}
            </p>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1.5 text-xs font-semibold text-secondary-foreground">
            <WalletCards className="size-3.5" /> Fine records
          </span>
        </div>

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search ticket, plate, or driver…"
            aria-label="Search my citations"
            className="h-12 w-full rounded-xl border border-input bg-card pl-10 pr-4 text-base shadow-sm outline-none transition-shadow placeholder:text-muted-foreground/80 focus:border-ring focus:ring-2 focus:ring-ring/15"
          />
        </div>

        <div className="space-y-3">
          {myTickets.map((ticket) => (
            <article
              key={ticket.id}
              className={`rounded-2xl border border-border border-l-4 bg-card p-4 shadow-panel transition-shadow hover:shadow-lift ${statusAccent[ticket.status]}`}
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
                  <span className="rounded-lg bg-secondary px-2.5 py-1 font-semibold tabular text-foreground">
                    {peso(ticket.totalFine)}
                  </span>
                </div>
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
