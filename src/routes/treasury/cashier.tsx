import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useAuthStore } from "@/store/useAuthStore";
import {
  Banknote,
  Check,
  Printer,
  Search,
  X,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { StatusBadge } from "@/components/StatusBadge";
import { useTicketStore } from "@/store/useTicketStore";
import { dateTime, peso, shortDate } from "@/lib/format";
import type { Payment, Ticket } from "@/types";

export const Route = createFileRoute("/treasury/cashier")({
  head: () => ({
    meta: [{ title: "Cashier Window | Municipal Treasury" }],
  }),
  component: TreasuryCashierPage,
});

function TreasuryCashierPage() {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const tickets = useTicketStore((s) => s.tickets);
  const payTicket = useTicketStore((s) => s.payTicket);

  useEffect(() => {
    if (!user || user.role !== "treasury") {
      navigate({ to: "/login" });
    }
  }, [user, navigate]);

  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Ticket | null>(null);
  const [tendered, setTendered] = useState("");
  const [manualOrNumber, setManualOrNumber] = useState("");
  const [receipt, setReceipt] = useState<Payment | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

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
        manualOrNumber.trim() || undefined,
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
    setManualOrNumber("");
    setQuery("");
  };

  if (!user || user.role !== "treasury") return null;

  return (
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
                setManualOrNumber("");
              }}
              className={`w-full rounded-xl border border-border bg-white p-4 text-left shadow-sm transition-shadow hover:shadow-md ${
                current?.id === t.id ? "ring-2 ring-primary border-primary" : ""
              }`}
            >
              <div className="flex items-center justify-between">
                <p className="font-bold text-sm">{t.id}</p>
                <p className="font-bold tabular text-sm">{peso(t.totalFine)}</p>
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
                  <span className="font-semibold tabular">{peso(v.fine)}</span>
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
                  <p>Received by: {(receipt ?? current.payment)?.receivedBy}</p>
                  <p>
                    Posted: {dateTime((receipt ?? current.payment)!.paidAt)}
                  </p>
                </div>
                <div className="mt-4 flex gap-2">
                  <button
                    onClick={() => window.print()}
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
                  <label className="text-sm font-semibold">Cash tendered</label>
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
                    {[current.totalFine, 1000, 2000, 5000].map((amt, i) => (
                      <button
                        key={`${amt}-${i}`}
                        onClick={() => setTendered(String(amt))}
                        className="h-9 rounded-lg bg-secondary px-3 text-xs font-semibold text-secondary-foreground hover:bg-muted"
                      >
                        {i === 0 ? "Exact" : peso(amt)}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="rounded-lg bg-muted p-4">
                  <p className="text-sm text-muted-foreground">Change due</p>
                  <p className="font-display text-3xl font-bold tabular">
                    {peso(Math.max(change, 0))}
                  </p>
                  {cash > 0 && change < 0 && (
                    <p className="mt-2 text-sm font-medium text-destructive">
                      Short by {peso(Math.abs(change))}
                    </p>
                  )}
                  <button
                    onClick={() => setConfirmOpen(true)}
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

      {current && (
        <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Confirm Payment</DialogTitle>
              <DialogDescription>
                You are about to post a payment of {peso(current.totalFine)} for
                Ticket {current.id}.
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <label className="text-sm font-semibold">
                Manual OR Number{" "}
                <span className="text-muted-foreground font-normal">
                  (Optional)
                </span>
              </label>
              <input
                value={manualOrNumber}
                onChange={(e) => setManualOrNumber(e.target.value)}
                placeholder="e.g. OR-2026-1234"
                className="mt-1.5 h-11 w-full rounded-lg border-2 border-input bg-background px-4 font-mono text-sm outline-none focus:border-ring"
              />
              <p className="mt-2 text-xs text-muted-foreground">
                Leave blank to auto-generate an Official Receipt number.
              </p>
            </div>
            <DialogFooter>
              <button
                onClick={() => setConfirmOpen(false)}
                className="h-10 rounded-lg border border-border px-4 text-sm font-semibold hover:bg-muted"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setConfirmOpen(false);
                  process();
                }}
                className="h-10 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90"
              >
                Settle Transaction
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
