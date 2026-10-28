import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  AlarmClock,
  ArrowRight,
  Banknote,
  ClipboardList,
  FileChartColumn,
  ReceiptText,
  RefreshCw,
  TriangleAlert,
} from "lucide-react";
import { useDashboardMetrics } from "@/hooks/useDashboardMetrics";
import { CashierShiftPanel } from "@/components/CashierShiftPanel";
import { StatusBadge } from "@/components/StatusBadge";
import { peso, shortDate } from "@/lib/format";
import { treasuryRequest, type TicketPage } from "@/lib/treasury-client";

export const Route = createFileRoute("/treasury/")({
  head: () => ({ meta: [{ title: "Dashboard | Municipal Treasury" }] }),
  component: TreasuryDashboardPage,
});

function TreasuryDashboardPage() {
  const metrics = useDashboardMetrics();
  const pending = useQuery({
    queryKey: ["treasury", "pending-preview"],
    queryFn: ({ signal }) =>
      treasuryRequest<TicketPage>("tickets?status=outstanding&pageSize=5", {
        signal,
      }),
  });
  const value = (amount: number, money = false) =>
    metrics.loading || metrics.error
      ? "—"
      : money
        ? peso(amount)
        : amount.toLocaleString();
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">
            Revenue desk
          </p>
          <h1 className="mt-1 text-2xl font-bold">Treasury overview</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Today's collections, your cash drawer, and payments that need
            attention.
          </p>
        </div>
        <Link
          to="/treasury/cashier"
          className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground"
        >
          <Banknote className="size-4" />
          Accept payment
        </Link>
      </div>
      {metrics.error && (
        <div
          role="alert"
          className="rounded-xl border border-destructive/30 bg-card p-4 text-sm"
        >
          <p>{metrics.error.message}</p>
          <button
            onClick={() => void metrics.refresh()}
            className="mt-2 font-bold text-primary"
          >
            Retry summary
          </button>
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Collected today", value(metrics.revenueToday, true)],
          ["Settled today", value(metrics.settledToday)],
          ["Outstanding citations", value(metrics.pendingCount)],
          ["Overdue citations", value(metrics.overdueCount)],
        ].map(([label, amount]) => (
          <section
            key={label}
            className="rounded-2xl border border-border bg-card p-5 shadow-panel"
          >
            <h2 className="text-xs font-semibold text-muted-foreground">
              {label}
            </h2>
            <p className="mt-2 text-3xl font-bold text-primary">{amount}</p>
            <p className="mt-2 text-xs text-muted-foreground">
              {String(label).includes("today")
                ? "Philippine calendar day"
                : "Municipal citation register"}
            </p>
          </section>
        ))}
      </div>
      <CashierShiftPanel compact />
      <div className="grid gap-3 md:grid-cols-3">
        <Link
          to="/treasury/transactions"
          search={{ exceptions: true }}
          className="rounded-2xl border border-border bg-card p-5 shadow-panel transition-colors hover:border-primary/40"
        >
          <TriangleAlert className="size-5 text-amber-600" />
          <h2 className="mt-3 font-bold">
            Payment exceptions{" "}
            <span className="ml-1 text-primary">
              {value(metrics.paymentExceptionCount)}
            </span>
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Check incomplete payments and records that need reconciliation.
          </p>
          <span className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-primary">
            Review queue <ArrowRight className="size-3" />
          </span>
        </Link>
        <Link
          to="/treasury/overdue"
          className="rounded-2xl border border-border bg-card p-5 shadow-panel transition-colors hover:border-primary/40"
        >
          <AlarmClock className="size-5 text-primary" />
          <h2 className="mt-3 font-bold">Overdue follow-up</h2>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Review overdue citations and endorse eligible cases to PNP.
          </p>
          <span className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-primary">
            Open overdue board <ArrowRight className="size-3" />
          </span>
        </Link>
        <Link
          to="/treasury/reports"
          className="rounded-2xl border border-border bg-card p-5 shadow-panel transition-colors hover:border-primary/40"
        >
          <FileChartColumn className="size-5 text-primary" />
          <h2 className="mt-3 font-bold">Collection reports</h2>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Filter by payment date, channel, and cashier. Export matching
            records.
          </p>
          <span className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-primary">
            View collections <ArrowRight className="size-3" />
          </span>
        </Link>
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-panel">
          <div className="flex items-center justify-between gap-3 border-b border-border p-5">
            <h2 className="flex items-center gap-2 text-sm font-bold">
              <ClipboardList className="size-4 text-primary" />
              Outstanding citations
            </h2>
            <Link
              to="/treasury/cashier"
              className="text-xs font-bold text-primary"
            >
              Find a citation
            </Link>
          </div>
          {pending.isError ? (
            <div role="alert" className="p-5 text-sm">
              <p>{pending.error.message}</p>
              <button
                onClick={() => void pending.refetch()}
                className="mt-2 font-semibold text-primary"
              >
                Retry
              </button>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {pending.data?.tickets.map((ticket) => (
                <div
                  key={ticket.id}
                  className="flex flex-wrap items-center justify-between gap-3 p-5"
                >
                  <div>
                    <p className="text-sm font-semibold">
                      {ticket.violatorName}
                    </p>
                    <p className="mt-1 font-mono text-xs text-muted-foreground">
                      {ticket.id} · {ticket.plateNo}
                    </p>
                    <div className="mt-2">
                      <StatusBadge status={ticket.status} />
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold">
                      {peso(ticket.totalFine)}
                    </p>
                    <Link
                      to="/treasury/cashier"
                      search={{ ticket: ticket.id }}
                      className="mt-2 inline-flex min-h-9 items-center gap-1 rounded-lg bg-primary/5 px-3 text-xs font-bold text-primary"
                    >
                      Collect <ArrowRight className="size-3" />
                    </Link>
                  </div>
                </div>
              ))}
              {!pending.data?.tickets.length && (
                <p className="p-10 text-center text-sm text-muted-foreground">
                  {pending.isLoading
                    ? "Loading outstanding citations…"
                    : "No outstanding citations."}
                </p>
              )}
            </div>
          )}
        </section>
        <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-panel">
          <div className="flex items-center justify-between gap-3 border-b border-border p-5">
            <h2 className="flex items-center gap-2 text-sm font-bold">
              <ReceiptText className="size-4 text-primary" />
              Recent payments
            </h2>
            <Link
              to="/treasury/transactions"
              className="text-xs font-bold text-primary"
            >
              View all
            </Link>
          </div>
          <div className="divide-y divide-border">
            {metrics.recentTransactions.map(
              (ticket) =>
                ticket.payment && (
                  <Link
                    key={ticket.id}
                    to="/treasury/receipts"
                    search={{ ticket: ticket.id }}
                    className="flex items-center justify-between gap-3 p-5 transition-colors hover:bg-muted/30"
                  >
                    <div>
                      <p className="text-sm font-semibold">
                        {ticket.violatorName}
                      </p>
                      <p className="mt-1 font-mono text-xs text-muted-foreground">
                        OR {ticket.payment.orNumber}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {ticket.payment.channel}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold">
                        {peso(ticket.payment.amount)}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {shortDate(ticket.payment.paidAt)}
                      </p>
                    </div>
                  </Link>
                ),
            )}
            {!metrics.recentTransactions.length && (
              <p className="p-10 text-center text-sm text-muted-foreground">
                {metrics.loading
                  ? "Loading recent payments…"
                  : metrics.error
                    ? "Recent payments are unavailable."
                    : "No recorded payments yet."}
              </p>
            )}
          </div>
        </section>
      </div>
      <div className="flex items-center justify-end gap-2 text-xs text-muted-foreground">
        <span>
          {metrics.loading
            ? "Updating summary…"
            : metrics.updatedAt
              ? `Last updated ${new Date(metrics.updatedAt).toLocaleTimeString("en-PH", { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit" })}`
              : "Summary not synced"}
        </span>
        <button
          aria-label="Refresh Treasury summary"
          onClick={() => void metrics.refresh()}
          disabled={metrics.loading}
          className="flex size-9 items-center justify-center rounded-lg hover:bg-muted disabled:opacity-40"
        >
          <RefreshCw
            className={`size-3.5 ${metrics.loading ? "animate-spin" : ""}`}
          />
        </button>
      </div>
    </div>
  );
}
