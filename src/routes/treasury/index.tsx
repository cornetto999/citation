import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useAuthStore } from "@/store/useAuthStore";
import { useTicketStore } from "@/store/useTicketStore";
import { peso, shortDate } from "@/lib/format";
import { CreditCard, History, Search } from "lucide-react";
import { Link } from "@tanstack/react-router";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/treasury/")({
  head: () => ({
    meta: [{ title: "Dashboard | Municipal Treasury" }],
  }),
  component: TreasuryDashboardPage,
});

function TreasuryDashboardPage() {
  const user = useAuthStore((s) => s.user);
  const tickets = useTicketStore((s) => s.tickets);
  const [pendingModalOpen, setPendingModalOpen] = useState(false);

  if (!user || user.role !== "treasury") return null;

  const today = new Date().toDateString();

  const collectedToday = tickets
    .filter(
      (t) =>
        t.status === "Paid" &&
        t.payment &&
        new Date(t.payment.paidAt).toDateString() === today,
    )
    .reduce((s, t) => s + t.payment!.amount, 0);

  const settledTodayCount = tickets.filter(
    (t) =>
      t.status === "Paid" &&
      t.payment &&
      new Date(t.payment.paidAt).toDateString() === today,
  ).length;

  const pendingTickets = tickets.filter((t) => t.status === "Unpaid");
  const pendingCount = pendingTickets.length;

  const recentTransactions = tickets
    .filter((t) => t.status === "Paid" && t.payment)
    .sort(
      (a, b) =>
        new Date(b.payment!.paidAt).getTime() -
        new Date(a.payment!.paidAt).getTime(),
    )
    .slice(0, 5);

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold tracking-tight">Treasury Dashboard</h2>

      <div className="grid gap-3 sm:grid-cols-3 stagger-children">
        <div className="rounded-2xl border border-border bg-card p-5 shadow-panel transition-all hover:shadow-lift hover:-translate-y-0.5 sm:p-6">
          <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Collected Today
          </p>
          <p className="mt-2 font-display text-3xl font-bold tabular text-primary">
            {peso(collectedToday)}
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-5 shadow-panel transition-all hover:shadow-lift hover:-translate-y-0.5 sm:p-6">
          <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Citations Settled (Today)
          </p>
          <p className="mt-2 font-display text-3xl font-bold tabular">
            {settledTodayCount}
          </p>
        </div>
        <button
          onClick={() => setPendingModalOpen(true)}
          className="rounded-2xl border border-border bg-card p-5 shadow-panel text-left transition-all hover:shadow-lift hover:-translate-y-0.5 hover:border-destructive/30 cursor-pointer sm:p-6"
        >
          <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Total Pending (Unpaid)
          </p>
          <p className="mt-2 font-display text-3xl font-bold tabular text-destructive">
            {pendingCount}
          </p>
        </button>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card p-5 shadow-panel sm:p-6">
          <h3 className="text-base font-bold tracking-tight">Quick Actions</h3>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Link
              to="/treasury/cashier"
              className="group flex flex-col items-center justify-center gap-3 rounded-2xl border border-border bg-background p-6 text-center shadow-sm transition-all hover:border-primary/30 hover:bg-primary/5 hover:shadow-lift hover:-translate-y-0.5"
            >
              <div className="rounded-xl bg-primary/10 p-3 text-primary transition-all group-hover:bg-primary/15 group-hover:shadow-glow">
                <CreditCard className="size-6" />
              </div>
              <p className="text-sm font-bold">Cashier Window</p>
            </Link>
            <Link
              to="/treasury/reports"
              className="group flex flex-col items-center justify-center gap-3 rounded-2xl border border-border bg-background p-6 text-center shadow-sm transition-all hover:border-primary/30 hover:bg-primary/5 hover:shadow-lift hover:-translate-y-0.5"
            >
              <div className="rounded-xl bg-primary/10 p-3 text-primary transition-all group-hover:bg-primary/15 group-hover:shadow-glow">
                <History className="size-6" />
              </div>
              <p className="text-sm font-bold">Collection Reports</p>
            </Link>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-panel flex flex-col">
          <div className="border-b border-border bg-muted/30 px-5 py-4 flex items-center justify-between">
            <h3 className="text-sm font-bold">Recent Transactions</h3>
            <Link
              to="/treasury/transactions"
              className="text-xs font-bold text-primary hover:underline"
            >
              View all
            </Link>
          </div>
          <div className="flex-1 overflow-y-auto p-0">
            <div className="divide-y divide-border">
              {recentTransactions.map((t) => (
                <div
                  key={t.id}
                  className="flex items-center justify-between p-4 hover:bg-muted/30 transition-colors"
                >
                  <div>
                    <p className="font-semibold text-sm">{t.violatorName}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      OR: {t.payment!.orNumber} • Ticket: {t.id}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold tabular text-sm">
                      {peso(t.totalFine)}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {shortDate(t.payment!.paidAt)}
                    </p>
                  </div>
                </div>
              ))}
              {recentTransactions.length === 0 && (
                <p className="p-6 text-center text-sm text-muted-foreground">
                  No recent transactions.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      <Dialog open={pendingModalOpen} onOpenChange={setPendingModalOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Pending Citations (Unpaid)</DialogTitle>
          </DialogHeader>
          <div className="overflow-y-auto flex-1 pr-2">
            {pendingTickets.length === 0 ? (
              <p className="py-8 text-center text-muted-foreground">
                No pending citations.
              </p>
            ) : (
              <div className="divide-y divide-border">
                {pendingTickets.map((t) => (
                  <div
                    key={t.id}
                    className="py-4 flex items-center justify-between"
                  >
                    <div>
                      <p className="font-semibold">{t.violatorName}</p>
                      <p className="text-sm text-muted-foreground mt-0.5">
                        Ticket: {t.id} • Issued: {shortDate(t.issuedAt)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold tabular text-destructive">
                        {peso(t.totalFine)}
                      </p>
                      <Link
                        to="/treasury/cashier"
                        onClick={() => setPendingModalOpen(false)}
                        className="text-xs font-bold text-primary hover:underline mt-1 inline-block"
                      >
                        Process Payment &rarr;
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
