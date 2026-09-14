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
      <h2 className="text-xl font-bold">Treasury Dashboard</h2>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-6 shadow-panel">
          <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Collected Today
          </p>
          <p className="mt-2 font-display text-3xl font-bold tabular text-primary">
            {peso(collectedToday)}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-6 shadow-panel">
          <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Citations Settled (Today)
          </p>
          <p className="mt-2 font-display text-3xl font-bold tabular">
            {settledTodayCount}
          </p>
        </div>
        <button
          onClick={() => setPendingModalOpen(true)}
          className="rounded-xl border border-border bg-card p-6 shadow-panel text-left hover:border-primary hover:shadow-md transition-all cursor-pointer"
        >
          <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Total Pending (Unpaid)
          </p>
          <p className="mt-2 font-display text-3xl font-bold tabular text-destructive">
            {pendingCount}
          </p>
        </button>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-6 shadow-panel">
          <h3 className="text-base font-semibold">Quick Actions</h3>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Link
              to="/treasury/cashier"
              className="flex flex-col items-center justify-center gap-3 rounded-xl border border-border bg-background p-6 text-center shadow-sm transition-all hover:border-primary hover:bg-primary/5 hover:shadow-md"
            >
              <div className="rounded-full bg-primary/10 p-3 text-primary">
                <CreditCard className="size-6" />
              </div>
              <p className="text-sm font-semibold">Cashier Window</p>
            </Link>
            <Link
              to="/treasury/reports"
              className="flex flex-col items-center justify-center gap-3 rounded-xl border border-border bg-background p-6 text-center shadow-sm transition-all hover:border-primary hover:bg-primary/5 hover:shadow-md"
            >
              <div className="rounded-full bg-primary/10 p-3 text-primary">
                <History className="size-6" />
              </div>
              <p className="text-sm font-semibold">Collection Reports</p>
            </Link>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card overflow-hidden shadow-panel flex flex-col">
          <div className="border-b border-border bg-muted/50 px-5 py-4 flex items-center justify-between">
            <h3 className="text-sm font-semibold">Recent Transactions</h3>
            <Link
              to="/treasury/transactions"
              className="text-xs font-semibold text-primary hover:underline"
            >
              View all
            </Link>
          </div>
          <div className="flex-1 overflow-y-auto p-0">
            <div className="divide-y divide-border">
              {recentTransactions.map((t) => (
                <div
                  key={t.id}
                  className="flex items-center justify-between p-4 hover:bg-muted/50 transition-colors"
                >
                  <div>
                    <p className="font-semibold text-sm">{t.violatorName}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      OR: {t.payment!.orNumber} • Ticket: {t.id}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold tabular text-sm">
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
                      <p className="font-semibold tabular text-destructive">
                        {peso(t.totalFine)}
                      </p>
                      <Link
                        to="/treasury/cashier"
                        onClick={() => setPendingModalOpen(false)}
                        className="text-xs font-semibold text-primary hover:underline mt-1 inline-block"
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
