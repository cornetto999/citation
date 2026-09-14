import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useAuthStore } from "@/store/useAuthStore";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useTicketStore } from "@/store/useTicketStore";
import { dateTime, peso } from "@/lib/format";

export const Route = createFileRoute("/treasury/reports")({
  head: () => ({
    meta: [{ title: "Reports | Municipal Treasury" }],
  }),
  component: TreasuryReportsPage,
});

function TreasuryReportsPage() {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const tickets = useTicketStore((s) => s.tickets);

  useEffect(() => {
    if (!user || user.role !== "treasury") {
      navigate({ to: "/login" });
    }
  }, [user, navigate]);

  type ReportPeriod = "day" | "week" | "month" | "year";
  const [reportPeriod, setReportPeriod] = useState<ReportPeriod>("day");

  const reportData = useMemo(() => {
    const now = new Date();
    let start: Date;
    switch (reportPeriod) {
      case "day":
        start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        break;
      case "week": {
        const startOfDay = new Date(
          now.getFullYear(),
          now.getMonth(),
          now.getDate(),
        );
        start = new Date(startOfDay);
        start.setDate(start.getDate() - start.getDay());
        break;
      }
      case "month":
        start = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case "year":
        start = new Date(now.getFullYear(), 0, 1);
        break;
    }

    const filtered = tickets.filter(
      (t) =>
        t.status === "Paid" && t.payment && new Date(t.payment.paidAt) >= start,
    );

    return {
      periodLabel:
        reportPeriod === "day"
          ? "Today"
          : reportPeriod === "week"
            ? "This Week"
            : reportPeriod === "month"
              ? "This Month"
              : "This Year",
      count: filtered.length,
      total: filtered.reduce((sum, t) => sum + t.payment!.amount, 0),
      tickets: filtered.sort(
        (a, b) =>
          new Date(b.payment!.paidAt).getTime() -
          new Date(a.payment!.paidAt).getTime(),
      ),
    };
  }, [tickets, reportPeriod]);

  if (!user || user.role !== "treasury") return null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-lg font-semibold">Collection Report</h2>
        <ToggleGroup
          type="single"
          value={reportPeriod}
          onValueChange={(v) => {
            if (v) setReportPeriod(v as ReportPeriod);
          }}
          size="sm"
          className="bg-muted p-1 rounded-lg"
        >
          <ToggleGroupItem value="day" className="rounded-md px-3 text-xs">
            Today
          </ToggleGroupItem>
          <ToggleGroupItem value="week" className="rounded-md px-3 text-xs">
            Week
          </ToggleGroupItem>
          <ToggleGroupItem value="month" className="rounded-md px-3 text-xs">
            Month
          </ToggleGroupItem>
          <ToggleGroupItem value="year" className="rounded-md px-3 text-xs">
            Year
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-6 shadow-panel">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {reportData.periodLabel} Collection
          </h3>
          <p className="mt-3 font-display text-4xl font-bold tabular text-card-foreground">
            {peso(reportData.total)}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-6 shadow-panel">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Citations Settled
          </h3>
          <p className="mt-3 font-display text-4xl font-bold tabular text-card-foreground">
            {reportData.count}
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden shadow-panel">
        <div className="border-b border-border bg-muted/50 px-4 py-3">
          <h3 className="text-sm font-semibold">Transactions</h3>
        </div>
        <div className="divide-y divide-border">
          {reportData.tickets.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">
              No transactions for this period.
            </p>
          ) : (
            reportData.tickets.map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between p-4 hover:bg-muted/50"
              >
                <div>
                  <p className="font-mono text-xs font-semibold">
                    {t.payment!.orNumber}{" "}
                    <span className="text-muted-foreground ml-2">
                      Ticket: {t.id}
                    </span>
                  </p>
                  <p className="mt-1 text-sm">
                    {t.violatorName} • {dateTime(t.payment!.paidAt)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-semibold tabular">{peso(t.totalFine)}</p>
                  <p className="text-xs text-muted-foreground">
                    {t.payment!.channel}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
