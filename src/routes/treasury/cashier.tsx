import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Banknote,
  Check,
  ChevronRight,
  LoaderCircle,
  Search,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useAuthStore } from "@/store/useAuthStore";
import { useTicketStore } from "@/store/useTicketStore";
import { StatusBadge } from "@/components/StatusBadge";
import { ReceiptView } from "@/components/ReceiptView";
import { CashierShiftPanel } from "@/components/CashierShiftPanel";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { peso, shortDate } from "@/lib/format";
import {
  treasuryRequest,
  useCashierShifts,
  useDebouncedSearch,
  type TicketPage,
} from "@/lib/treasury-client";
import type { Ticket } from "@/types";

export const Route = createFileRoute("/treasury/cashier")({
  head: () => ({ meta: [{ title: "Cashier Window | Municipal Treasury" }] }),
  validateSearch: (
    search: Record<string, unknown>,
  ): { ticket?: string | undefined } => ({
    ticket: typeof search["ticket"] === "string" ? search["ticket"] : undefined,
  }),
  component: TreasuryCashierPage,
});

function TreasuryCashierPage() {
  const user = useAuthStore((s) => s.user);
  const payTicket = useTicketStore((s) => s.payTicket);
  const queryClient = useQueryClient();
  const shifts = useCashierShifts();
  const navigate = Route.useNavigate();
  const { ticket: ticketParam } = Route.useSearch();
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(ticketParam ?? "");
  const [tendered, setTendered] = useState("");
  const [manualOrNumber, setManualOrNumber] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [posting, setPosting] = useState(false);
  const [paymentError, setPaymentError] = useState("");
  const searchInput = useRef<HTMLInputElement>(null);
  const paymentInFlight = useRef(false);
  const search = useDebouncedSearch(query);
  const authorized = user?.role === "treasury";
  const results = useQuery({
    queryKey: ["treasury", "cashier-search", search],
    queryFn: ({ signal }) =>
      treasuryRequest<TicketPage>(
        `tickets?${new URLSearchParams({ query: search, status: search ? "" : "outstanding", pageSize: "15" })}`,
        { signal },
      ),
    enabled: authorized,
  });
  const details = useQuery({
    queryKey: ["treasury", "ticket", selectedId],
    queryFn: ({ signal }) =>
      treasuryRequest<{ ticket: Ticket }>(
        `tickets/${encodeURIComponent(selectedId)}`,
        { signal },
      ),
    enabled: authorized && Boolean(selectedId),
  });
  const current = details.data?.ticket;
  const cash = Number(tendered);
  const cashValid =
    tendered !== "" &&
    Number.isFinite(cash) &&
    cash >= (current?.totalFine ?? Infinity);
  const change =
    current && cashValid
      ? Math.round((cash - current.totalFine) * 100) / 100
      : 0;
  const blocked = current?.status === "Contested" || Boolean(current?.payment);

  useEffect(() => {
    setSelectedId(ticketParam ?? "");
    setTendered("");
    setManualOrNumber("");
    setPaymentError("");
  }, [ticketParam]);

  const selectTicket = (ticket: Ticket) => {
    if (posting) return;
    setSelectedId(ticket.id);
    setTendered("");
    setManualOrNumber("");
    setPaymentError("");
    void navigate({ search: { ticket: ticket.id }, replace: true });
  };
  const reset = () => {
    setSelectedId("");
    setTendered("");
    setManualOrNumber("");
    setPaymentError("");
    setQuery("");
    void navigate({ search: {}, replace: true });
    searchInput.current?.focus();
  };
  const process = async () => {
    if (
      !user ||
      !current ||
      !shifts.data?.current ||
      paymentInFlight.current ||
      !cashValid ||
      !manualOrNumber.trim() ||
      blocked ||
      current.status === "Paid"
    )
      return;
    paymentInFlight.current = true;
    setPosting(true);
    setPaymentError("");
    try {
      const payment = await payTicket(
        current.id,
        "Cash (Over-the-counter)",
        user.name,
        manualOrNumber.trim(),
      );
      if (!payment)
        throw new Error(
          "This citation has changed. Refresh and check whether it is already paid.",
        );
      queryClient.setQueryData(["treasury", "ticket", current.id], {
        ticket: { ...current, status: "Paid", payment },
      });
      setConfirmOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["treasury"] });
      await queryClient.invalidateQueries({ queryKey: ["workflow"] });
      toast.success(`Payment posted · OR ${payment.orNumber}`);
    } catch (error) {
      setPaymentError(
        error instanceof Error
          ? error.message
          : "Unable to post payment. Your entries have been kept; check the payment status before retrying.",
      );
      void details.refetch();
    } finally {
      paymentInFlight.current = false;
      setPosting(false);
    }
  };
  if (!authorized) return null;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold">Cashier window</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Find a citation, verify the amount, then post one payment.
        </p>
      </div>
      <CashierShiftPanel compact />
      <div className="grid gap-5 xl:grid-cols-[320px_1fr]">
        <section aria-label="Find a citation">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (
                !results.isFetching &&
                query.trim() === search &&
                results.data?.tickets[0]
              )
                selectTicket(results.data.tickets[0]);
            }}
          >
            <label
              htmlFor="cashier-search"
              className="mb-2 block text-sm font-semibold"
            >
              Citation, plate, name, or license
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-4 size-4 text-muted-foreground" />
              <input
                ref={searchInput}
                id="cashier-search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                disabled={posting}
                placeholder="Search citations…"
                className="h-12 w-full rounded-xl border border-input bg-card pl-10 pr-10 text-sm outline-none focus:ring-2 focus:ring-primary/30"
              />
              {query && (
                <button
                  type="button"
                  disabled={posting}
                  aria-label="Clear search"
                  onClick={() => setQuery("")}
                  className="absolute right-3 top-4 text-muted-foreground"
                >
                  <X className="size-4" />
                </button>
              )}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Press Enter to open the first matching citation.
              {Boolean(results.data && results.data.total > 15) &&
                " Showing the first 15 matches; narrow your search to find a specific citation."}
            </p>
          </form>
          <div className="my-4 flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {search
                ? `${results.data?.total ?? 0} matches`
                : "Outstanding citations"}
            </span>
            {results.isFetching && (
              <span role="status" className="inline-flex items-center gap-1">
                <LoaderCircle className="size-3 animate-spin" /> Searching
              </span>
            )}
          </div>
          {results.isError ? (
            <div
              role="alert"
              className="rounded-xl border border-destructive/30 p-4 text-sm"
            >
              <p>{results.error.message}</p>
              <button
                onClick={() => void results.refetch()}
                className="mt-2 font-bold text-foreground"
              >
                Retry search
              </button>
            </div>
          ) : (
            <div className="max-h-[36rem] space-y-3 overflow-y-auto p-0.5">
              {results.data?.tickets.map((ticket) => (
                <button
                  disabled={posting}
                  key={ticket.id}
                  onClick={() => selectTicket(ticket)}
                  className={`w-full rounded-xl border bg-card p-4 text-left transition-colors hover:border-primary/40 disabled:opacity-60 ${selectedId === ticket.id ? "border-primary ring-1 ring-primary" : "border-border"}`}
                >
                  <div className="flex justify-between gap-2">
                    <span className="font-mono text-xs font-bold">
                      {ticket.id}
                    </span>
                    <span className="text-sm font-bold">
                      {peso(ticket.totalFine)}
                    </span>
                  </div>
                  <p className="mt-2 text-sm font-semibold">
                    {ticket.violatorName}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {ticket.plateNo} ·{" "}
                    {ticket.licenseNo || "No license recorded"}
                  </p>
                  <div className="mt-3 flex items-center justify-between">
                    <StatusBadge status={ticket.status} />
                    <ChevronRight className="size-4 text-muted-foreground" />
                  </div>
                </button>
              ))}
              {results.data?.tickets.length === 0 && (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  No citations match. Try a plate number or a shorter name.
                </p>
              )}
            </div>
          )}
        </section>
        <div>
          {!selectedId ? (
            <section className="flex min-h-96 flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card p-8 text-center">
              <Banknote className="mb-4 size-12 text-primary/50" />
              <h2 className="text-lg font-bold">Ready for the next payment</h2>
              <p className="mt-2 max-w-xs text-sm text-muted-foreground">
                Select a citation to review its violations and amount due.
              </p>
            </section>
          ) : details.isLoading ? (
            <div
              role="status"
              className="p-12 text-center text-sm text-muted-foreground"
            >
              Loading citation…
            </div>
          ) : details.isError ? (
            <div
              role="alert"
              className="rounded-xl border border-destructive/30 p-6"
            >
              <p>{details.error.message}</p>
              <button
                onClick={() => void details.refetch()}
                className="mt-3 font-bold text-foreground"
              >
                Retry citation
              </button>
            </div>
          ) : current?.status === "Paid" ? (
            <div className="space-y-4">
              <ReceiptView ticket={current} />
              <button
                onClick={reset}
                className="min-h-11 rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground"
              >
                New transaction
              </button>
            </div>
          ) : current ? (
            <section className="space-y-6 rounded-2xl border border-border bg-card p-5 shadow-panel sm:p-7">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-mono text-xs text-muted-foreground">
                    {current.id}
                  </p>
                  <h2 className="mt-1 text-2xl font-bold">
                    {current.violatorName}
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {current.plateNo} · {current.vehicleType}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    License {current.licenseNo || "not recorded"} · Due{" "}
                    {shortDate(current.dueDate)}
                  </p>
                </div>
                <StatusBadge status={current.status} />
              </div>
              <div className="divide-y divide-border overflow-hidden rounded-xl border border-border">
                {current.violations.map((v) => (
                  <div
                    key={v.code}
                    className="flex justify-between gap-4 px-4 py-3 text-sm"
                  >
                    <span>
                      {v.label}
                      <span className="ml-2 text-xs text-muted-foreground">
                        {v.code}
                      </span>
                    </span>
                    <strong className="shrink-0">{peso(v.fine)}</strong>
                  </div>
                ))}
                <div className="flex items-center justify-between bg-primary/5 px-4 py-4">
                  <strong>Amount due</strong>
                  <strong className="text-3xl text-foreground">
                    {peso(current.totalFine)}
                  </strong>
                </div>
              </div>
              {blocked ? (
                <div className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
                  {current.payment
                    ? "A payment already exists. Review this citation in payment exceptions before accepting any money."
                    : "This citation is contested. An administrator must complete the review before payment can be accepted."}
                  <Link
                    to="/treasury/transactions"
                    search={{ exceptions: true }}
                    className="mt-2 block font-bold underline"
                  >
                    View payment exceptions
                  </Link>
                </div>
              ) : (
                <>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label
                        htmlFor="cash-tendered"
                        className="text-sm font-bold"
                      >
                        Cash tendered
                      </label>
                      <input
                        id="cash-tendered"
                        type="number"
                        min="0"
                        step="0.01"
                        inputMode="decimal"
                        disabled={posting}
                        value={tendered}
                        onChange={(e) => setTendered(e.target.value)}
                        placeholder="0.00"
                        className="mt-2 h-14 w-full rounded-xl border border-input bg-background px-4 text-right text-2xl font-bold outline-none focus:ring-2 focus:ring-primary/30"
                      />
                      <div className="mt-2 flex flex-wrap gap-2">
                        {[...new Set([current.totalFine, 1000, 2000, 5000])]
                          .filter((amount) => amount >= current.totalFine)
                          .map((amount) => (
                            <button
                              key={amount}
                              onClick={() => setTendered(String(amount))}
                              className="min-h-9 rounded-lg bg-secondary px-3 text-xs font-bold"
                            >
                              {amount === current.totalFine
                                ? "Exact amount"
                                : peso(amount)}
                            </button>
                          ))}
                      </div>
                    </div>
                    <div className="rounded-xl bg-muted/50 p-4">
                      <p className="text-xs text-muted-foreground">
                        Change due
                      </p>
                      <p className="mt-2 text-3xl font-bold">{peso(change)}</p>
                      {tendered &&
                        Number.isFinite(cash) &&
                        cash < current.totalFine && (
                          <p className="mt-2 text-sm text-destructive">
                            Short by {peso(current.totalFine - cash)}
                          </p>
                        )}
                    </div>
                  </div>
                  <div>
                    <label
                      htmlFor="receipt-number"
                      className="text-sm font-bold"
                    >
                      Official Receipt number{" "}
                      <span className="text-destructive">*</span>
                    </label>
                    <input
                      id="receipt-number"
                      disabled={posting}
                      maxLength={100}
                      value={manualOrNumber}
                      onChange={(e) => setManualOrNumber(e.target.value)}
                      placeholder="Enter the issued OR number"
                      className="mt-2 h-12 w-full rounded-xl border border-input bg-background px-4 font-mono text-sm outline-none focus:ring-2 focus:ring-primary/30"
                    />
                    <p className="mt-2 text-xs text-muted-foreground">
                      Use the OR assigned under your Treasury's receipt
                      numbering process.
                    </p>
                  </div>
                  {paymentError && (
                    <p
                      role="alert"
                      className="rounded-xl bg-destructive/10 p-4 text-sm text-destructive"
                    >
                      {paymentError}
                    </p>
                  )}
                  <button
                    disabled={
                      !cashValid ||
                      !manualOrNumber.trim() ||
                      posting ||
                      !shifts.data?.current
                    }
                    onClick={() => setConfirmOpen(true)}
                    className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 font-bold text-primary-foreground disabled:opacity-40"
                  >
                    <Banknote className="size-5" />{" "}
                    {shifts.data?.current
                      ? "Review payment"
                      : "Open your shift to accept payment"}
                  </button>
                </>
              )}
            </section>
          ) : null}
        </div>
      </div>
      {current && (
        <Dialog
          open={confirmOpen}
          onOpenChange={(open) => {
            if (!posting) setConfirmOpen(open);
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Review and post payment</DialogTitle>
              <DialogDescription>
                Check the citation and issued receipt number before posting.
              </DialogDescription>
            </DialogHeader>
            <dl className="grid grid-cols-2 gap-3 py-3 text-sm">
              {[
                ["Citation", current.id],
                ["Violator", current.violatorName],
                ["Plate", current.plateNo],
                ["Amount received", peso(current.totalFine)],
                ["Cash tendered", peso(cash)],
                ["Change due", peso(change)],
                ["OR number", manualOrNumber.trim()],
                ["Cashier", user.name],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs text-muted-foreground">{label}</dt>
                  <dd className="mt-1 break-words font-semibold">{value}</dd>
                </div>
              ))}
            </dl>
            {paymentError && (
              <p role="alert" className="text-sm text-destructive">
                {paymentError}
              </p>
            )}
            <DialogFooter>
              <button
                disabled={posting}
                onClick={() => setConfirmOpen(false)}
                className="min-h-11 rounded-xl border border-border px-4 text-sm font-bold"
              >
                Back to edit
              </button>
              <button
                disabled={
                  posting ||
                  current.status === "Paid" ||
                  blocked ||
                  !shifts.data?.current
                }
                onClick={() => void process()}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground disabled:opacity-50"
              >
                {posting ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : (
                  <Check className="size-4" />
                )}
                {posting ? "Posting payment…" : "Post payment"}
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
