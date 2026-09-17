import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useAuthStore } from "@/store/useAuthStore";
import { useTicketStore } from "@/store/useTicketStore";
import { dateTime, peso } from "@/lib/format";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar as CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/treasury/reports")({
  head: () => ({
    meta: [{ title: "Reports | Municipal Treasury" }],
  }),
  component: TreasuryReportsPage,
});

// ─── Reusable DatePicker ───────────────────────────────────────────────────
function DatePicker({
  label,
  date,
  onSelect,
  disabled,
}: {
  label: string;
  date: Date | undefined;
  onSelect: (d: Date | undefined) => void;
  disabled?: { after?: Date; before?: Date };
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          data-empty={!date}
          className={cn(
            "w-[160px] justify-start text-left font-normal",
            "data-[empty=true]:text-muted-foreground",
          )}
        >
          <CalendarIcon className="mr-2 size-4" />
          {date ? format(date, "PPP") : <span>{label}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={date}
          onSelect={onSelect}
          disabled={disabled}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────
function TreasuryReportsPage() {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const tickets = useTicketStore((s) => s.tickets);

  useEffect(() => {
    if (!user || user.role !== "treasury") {
      navigate({ to: "/login" });
    }
  }, [user, navigate]);

  const todayStart = () => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  };

  const [fromDate, setFromDate] = useState<Date | undefined>(todayStart());
  const [toDate, setToDate] = useState<Date | undefined>(new Date());

  const reportData = useMemo(() => {
    const filtered = tickets.filter((t) => {
      if (t.status !== "Paid" || !t.payment) return false;
      const paid = new Date(t.payment.paidAt);
      if (fromDate) {
        const from = new Date(fromDate);
        from.setHours(0, 0, 0, 0);
        if (paid < from) return false;
      }
      if (toDate) {
        const to = new Date(toDate);
        to.setHours(23, 59, 59, 999);
        if (paid > to) return false;
      }
      return true;
    });

    return {
      count: filtered.length,
      total: filtered.reduce((sum, t) => sum + t.payment!.amount, 0),
      tickets: filtered.sort(
        (a, b) =>
          new Date(b.payment!.paidAt).getTime() -
          new Date(a.payment!.paidAt).getTime(),
      ),
    };
  }, [tickets, fromDate, toDate]);

  const periodLabel =
    fromDate && toDate
      ? `${format(fromDate, "PPP")} – ${format(toDate, "PPP")}`
      : fromDate
        ? `From ${format(fromDate, "PPP")}`
        : toDate
          ? `Until ${format(toDate, "PPP")}`
          : "All time";

  if (!user || user.role !== "treasury") return null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-lg font-semibold">Collection Report</h2>

        {/* Date range pickers */}
        <div className="flex flex-wrap items-center gap-2">
          <DatePicker
            label="From date"
            date={fromDate}
            onSelect={setFromDate}
            disabled={{ after: toDate ?? new Date() }}
          />
          <span className="text-sm text-muted-foreground">to</span>
          <DatePicker
            label="To date"
            date={toDate}
            onSelect={setToDate}
            disabled={{ before: fromDate, after: new Date() }}
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setFromDate(todayStart());
              setToDate(new Date());
            }}
            className="text-xs text-muted-foreground"
          >
            Reset
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-6 shadow-panel">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Collection
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">{periodLabel}</p>
          <p className="mt-3 font-display text-4xl font-bold tabular text-card-foreground">
            {peso(reportData.total)}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-6 shadow-panel">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Citations Settled
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">{periodLabel}</p>
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
