import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowUpRight, ClipboardList } from "lucide-react";
import { useEffect, useMemo } from "react";
import { AppShell } from "@/components/AppShell";
import { EnforcerSidebar } from "@/components/EnforcerSidebar";
import { peso } from "@/lib/format";
import { useAuthStore } from "@/store/useAuthStore";
import { useTicketStore } from "@/store/useTicketStore";

export const Route = createFileRoute("/enforcer/")({
  head: () => ({
    meta: [{ title: "Dashboard | Traffic Enforcer" }],
  }),
  component: EnforcerDashboardPage,
});

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
    <div className="rounded-2xl border border-border bg-card p-4 shadow-panel transition-all hover:shadow-lift hover:-translate-y-0.5">
      <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-1.5 font-display text-2xl font-bold tabular text-card-foreground">
        {value}
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

function EnforcerDashboardPage() {
  const user = useAuthStore((s) => s.user);
  const tickets = useTicketStore((s) => s.tickets);
  const navigate = useNavigate();

  useEffect(() => {
    if (!user || user.role !== "enforcer") {
      navigate({ to: "/login" });
    }
  }, [navigate, user]);

  const allMyTickets = useMemo(
    () => tickets.filter((ticket) => ticket.issuedBy === user?.name),
    [tickets, user?.name],
  );

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
      title="Dashboard"
      subtitle="Overview"
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
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <ClipboardList className="size-5" />
              </span>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
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
              to="/enforcer/new"
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground shadow-sm transition-all hover:brightness-110 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              New citation <ArrowUpRight className="size-4" />
            </Link>
          </div>
          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3 stagger-children">
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
      </div>
    </AppShell>
  );
}
