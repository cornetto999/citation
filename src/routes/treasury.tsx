import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useAuthStore } from "@/store/useAuthStore";
import {
  Banknote,
  Check,
  Printer,
  Search,
  BarChart3,
  ReceiptCent,
  X,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { StatusBadge } from "@/components/StatusBadge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useTicketStore } from "@/store/useTicketStore";

import { dateTime, peso, shortDate } from "@/lib/format";
import type { Payment, Ticket } from "@/types";

export const Route = createFileRoute("/treasury")({
  head: () => ({
    meta: [
      { title: "Cashier Window | Municipal Treasury" },
      {
        name: "description",
        content:
          "Treasury point-of-sale for traffic citations: search a ticket, tender cash, compute change, and issue the official receipt.",
      },
      { property: "og:title", content: "Cashier Window | Municipal Treasury" },
      {
        property: "og:description",
        content:
          "Settle traffic citations over the counter and post payments instantly.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: TreasuryPage,
});

function TreasuryPage() {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const tickets = useTicketStore((s) => s.tickets);

  useEffect(() => {
    if (!user || user.role !== "treasury") {
      navigate({ to: "/login" });
    }
  }, [user, navigate]);

  const payTicket = useTicketStore((s) => s.payTicket);

  type ReportPeriod = "day" | "week" | "month" | "year";
  const [reportPeriod, setReportPeriod] = useState<ReportPeriod>("day");

  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Ticket | null>(null);
  const [tendered, setTendered] = useState("");
  const [receipt, setReceipt] = useState<Payment | null>(null);

  const current = selected
    ? (tickets.find((t) => t.id === selected.id) ?? null)
    : null;
  const results = query.trim()
    ? tickets.filter(
        (t) =>
          t.id.toLowerCase().includes(query.trim().toLowerCase()) ||
          t.plateNo.toLowerCase().includes(query.trim().toLowerCase()),
      )
    : tickets.filter((t) => t.status !== "Paid").slice(0, 6);

  const cash = Number(tendered) || 0;
  const change = current ? cash - current.totalFine : 0;

  const process = async () => {
    if (!current || cash < current.totalFine) return;
    try {
      const payment = await payTicket(
        current.id,
        "Cash (Over-the-counter)",
        user!.name,
      );
      if (payment) {
        setReceipt(payment);
        toast.success(`Payment posted for ${current.id}`, {
          description: `OR ${payment.orNumber}`,
        });
      }
    } catch (e) {
      toast.error("Failed to post payment");
    }
  };

  const newTransaction = () => {
    setSelected(null);
    setReceipt(null);
    setTendered("");
    setQuery("");
  };

  const collectedToday = tickets
    .filter(
      (t) =>
        t.payment &&
        new Date(t.payment.paidAt).toDateString() === new Date().toDateString(),
    )
    .reduce((s, t) => s + t.totalFine, 0);

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
      total: filtered.reduce((sum, t) => sum + t.totalFine, 0),
      tickets: filtered.sort(
        (a, b) =>
          new Date(b.payment!.paidAt).getTime() -
          new Date(a.payment!.paidAt).getTime(),
      ),
    };
  }, [tickets, reportPeriod]);

  if (!user || user.role !== "treasury") return null;
  const cashier = user;

  return (
    <AppShell
      title="Cashier Window 3"
      subtitle={`Shift collection today: ${peso(collectedToday)}`}
      operator={cashier.name}
      unit={cashier.unit}
      accessLabel="Treasury"
    >
      <Tabs defaultValue="cashier" className="w-full">
        <div className="mb-6 flex items-center">
          <TabsList className="rounded-full bg-slate-200/60 p-1 h-auto">
            <TabsTrigger
              value="cashier"
              className="flex gap-2 rounded-full px-5 py-2 text-sm font-semibold text-slate-500 data-[state=active]:bg-white data-[state=active]:text-primary data-[state=active]:shadow-sm"
            >
              <ReceiptCent className="size-4" /> Cashier
            </TabsTrigger>
            <TabsTrigger
              value="reports"
              className="flex gap-2 rounded-full px-5 py-2 text-sm font-semibold text-slate-500 data-[state=active]:bg-white data-[state=active]:text-primary data-[state=active]:shadow-sm"
            >
              <BarChart3 className="size-4" /> Reports
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent
          value="cashier"
          className="m-0 border-none p-0 outline-none"
        >
          <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
            <div className="flex flex-col">
              <div className="relative">
                <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search Ticket No. or Plate"
                  className="h-12 w-full rounded-full border border-border bg-white pl-10 pr-10 text-sm outline-none focus:border-ring shadow-sm placeholder:text-muted-foreground/70"
                />
                {query && (
                  <button
                    onClick={() => setQuery("")}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="size-4" />
                  </button>
                )}
              </div>
              <h3 className="mt-6 mb-3 text-sm font-bold text-foreground">
                Active Citations ({results.length})
              </h3>

              <div className="max-h-[28rem] space-y-3 overflow-y-auto pb-4 pr-2">
                {results.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => {
                      setSelected(t);
                      setReceipt(t.payment ?? null);
                      setTendered("");
                    }}
                    className={`w-full rounded-xl border border-border bg-white p-4 text-left shadow-sm transition-shadow hover:shadow-md ${
                      current?.id === t.id
                        ? "ring-2 ring-primary border-primary"
                        : ""
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <p className="font-bold text-sm">{t.id}</p>
                      <p className="font-bold tabular text-sm">
                        {peso(t.totalFine)}
                      </p>
                    </div>
                    <div className="mt-3 flex items-center justify-between">
                      <p className="text-xs text-muted-foreground">
                        {t.plateNo} • {t.violatorName}
                      </p>
                      <div className="flex items-center gap-1.5">
                        <StatusBadge status={t.status} />
                        <ChevronRight className="size-4 text-muted-foreground/50" />
                      </div>
                    </div>
                  </button>
                ))}
                {results.length === 0 && (
                  <p className="py-10 text-center text-sm text-muted-foreground">
                    No citation found.
                  </p>
                )}
              </div>
            </div>

            <section className="rounded-3xl border border-border bg-white p-8 shadow-sm">
              {!current ? (
                <div className="flex h-full min-h-[500px] flex-col items-center justify-center text-center">
                  <img
                    src="/empty-state.jpg"
                    alt="Empty State"
                    className="w-48 mb-6 object-contain mix-blend-multiply"
                  />
                  <h2 className="font-display text-2xl font-bold text-foreground">
                    No Transaction Open
                  </h2>
                  <p className="mt-2 max-w-sm text-sm text-muted-foreground">
                    Search for a ticket number in the left panel to begin an
                    over-the-counter payment.
                  </p>
                  <button className="mt-6 rounded-full bg-slate-100 px-5 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-200 transition-colors">
                    Open Quick Search Guide
                  </button>
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-mono text-sm text-muted-foreground">
                        {current.id}
                      </p>
                      <h2 className="font-display text-2xl font-bold">
                        {current.violatorName}
                      </h2>
                      <p className="text-sm text-muted-foreground">
                        {current.plateNo} · {current.vehicleType} · issued{" "}
                        {shortDate(current.issuedAt)}
                      </p>
                    </div>
                    <StatusBadge status={current.status} />
                  </div>

                  <div className="rounded-lg border border-border">
                    {current.violations.map((v) => (
                      <div
                        key={v.code}
                        className="flex items-center justify-between border-b border-border px-4 py-3 text-sm last:border-0"
                      >
                        <span>
                          <span className="font-medium">{v.label}</span>
                          <span className="ml-2 font-mono text-xs text-muted-foreground">
                            {v.code}
                          </span>
                        </span>
                        <span className="font-semibold tabular">
                          {peso(v.fine)}
                        </span>
                      </div>
                    ))}
                    <div className="flex items-center justify-between bg-secondary px-4 py-3">
                      <span className="text-sm font-semibold uppercase tracking-wide">
                        Amount due
                      </span>
                      <span className="font-display text-2xl font-bold tabular">
                        {peso(current.totalFine)}
                      </span>
                    </div>
                  </div>

                  {current.status === "Paid" ? (
                    <div className="rounded-lg border border-paid-foreground/30 bg-paid p-5 text-paid-foreground">
                      <div className="flex items-center gap-2 font-semibold">
                        <Check className="size-5" /> Settled
                      </div>
                      <div className="mt-3 space-y-1 text-sm">
                        <p>
                          OR No.:{" "}
                          <span className="font-mono">
                            {(receipt ?? current.payment)?.orNumber}
                          </span>
                        </p>
                        <p>Channel: {(receipt ?? current.payment)?.channel}</p>
                        <p>
                          Received by:{" "}
                          {(receipt ?? current.payment)?.receivedBy}
                        </p>
                        <p>
                          Posted:{" "}
                          {dateTime((receipt ?? current.payment)!.paidAt)}
                        </p>
                      </div>
                      <div className="mt-4 flex gap-2">
                        <button
                          onClick={() =>
                            toast.info("Receipt sent to the window printer")
                          }
                          className="inline-flex h-11 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground"
                        >
                          <Printer className="size-4" /> Print e-OR
                        </button>
                        <button
                          onClick={newTransaction}
                          className="h-11 rounded-lg border border-border bg-card px-4 text-sm font-semibold text-card-foreground"
                        >
                          New transaction
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <label className="text-sm font-semibold">
                          Cash tendered
                        </label>
                        <input
                          value={tendered}
                          onChange={(e) =>
                            setTendered(e.target.value.replace(/[^0-9.]/g, ""))
                          }
                          inputMode="decimal"
                          placeholder="0.00"
                          className="mt-1.5 h-14 w-full rounded-lg border-2 border-input bg-background px-4 text-right font-display text-2xl font-bold tabular outline-none focus:border-ring"
                        />
                        <div className="mt-2 flex flex-wrap gap-2">
                          {[current.totalFine, 1000, 2000, 5000].map(
                            (amt, i) => (
                              <button
                                key={`${amt}-${i}`}
                                onClick={() => setTendered(String(amt))}
                                className="h-9 rounded-lg bg-secondary px-3 text-xs font-semibold text-secondary-foreground hover:bg-muted"
                              >
                                {i === 0 ? "Exact" : peso(amt)}
                              </button>
                            ),
                          )}
                        </div>
                      </div>
                      <div className="rounded-lg bg-muted p-4">
                        <p className="text-sm text-muted-foreground">
                          Change due
                        </p>
                        <p className="font-display text-3xl font-bold tabular">
                          {peso(Math.max(change, 0))}
                        </p>
                        {cash > 0 && change < 0 && (
                          <p className="mt-2 text-sm font-medium text-destructive">
                            Short by {peso(Math.abs(change))}
                          </p>
                        )}
                        <button
                          onClick={process}
                          disabled={cash < current.totalFine}
                          className="mt-4 flex h-14 w-full items-center justify-center gap-2 rounded-lg bg-primary text-base font-semibold text-primary-foreground disabled:opacity-40"
                        >
                          <Banknote className="size-5" /> Post payment
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </section>
          </div>
        </TabsContent>

        <TabsContent
          value="reports"
          className="m-0 border-none p-0 outline-none space-y-6"
        >
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
              <ToggleGroupItem
                value="month"
                className="rounded-md px-3 text-xs"
              >
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
                      <p className="font-semibold tabular">
                        {peso(t.totalFine)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {t.payment!.channel}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}
