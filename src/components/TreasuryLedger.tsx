import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  Download,
  LoaderCircle,
  RefreshCw,
  Search,
  ReceiptText,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";
import { downloadCsv, peso } from "@/lib/format";
import { receiptDate } from "@/lib/receipt";
import {
  treasuryDateKey,
  treasuryRequest,
  useDebouncedSearch,
  type PaymentPage,
} from "@/lib/treasury-client";
import type { Ticket } from "@/types";
import { RecordPager } from "@/components/WorkflowFeedback";

interface PaymentException {
  id: string;
  ticketId: string;
  reason: string;
  status: "open" | "resolved";
  createdAt: string;
  providerReference?: string;
}
const channels = [
  "Cash (Over-the-counter)",
  "QRPh",
  "GCash",
  "Maya",
  "Online (PayMongo)",
];
const fieldClass =
  "h-11 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/30";

export function TreasuryLedger({
  report = false,
  exceptionsInitially = false,
}: {
  report?: boolean;
  exceptionsInitially?: boolean;
}) {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [from, setFrom] = useState(report ? treasuryDateKey() : "");
  const [to, setTo] = useState(report ? treasuryDateKey() : "");
  const [channel, setChannel] = useState("");
  const [cashier, setCashier] = useState("");
  const [page, setPage] = useState(1);
  const [exceptionPage, setExceptionPage] = useState(1);
  const [exporting, setExporting] = useState(false);
  const exportAbort = useRef<AbortController | null>(null);
  useEffect(() => () => exportAbort.current?.abort(), []);
  const [checking, setChecking] = useState<string | null>(null);
  const [providerMessage, setProviderMessage] = useState<{
    id: string;
    message: string;
  } | null>(null);
  const [showExceptions, setShowExceptions] = useState(exceptionsInitially);
  const debounced = useDebouncedSearch(query);
  const dateValid = !from || !to || from <= to;
  const queryParams = new URLSearchParams({
    query: debounced,
    from,
    to,
    channel,
    receivedBy: cashier,
    page: String(page),
    pageSize: "25",
  }).toString();
  const ledger = useQuery({
    queryKey: ["treasury", "payments", queryParams],
    queryFn: ({ signal }) =>
      treasuryRequest<PaymentPage>(`payments?${queryParams}`, { signal }),
    enabled: dateValid,
  });
  const exceptions = useQuery({
    queryKey: ["treasury", "exceptions", exceptionPage],
    queryFn: ({ signal }) =>
      treasuryRequest<{
        exceptions: PaymentException[];
        total: number;
        page: number;
        pageSize: number;
      }>(`exceptions?page=${exceptionPage}&pageSize=25`, { signal }),
    enabled: !report,
  });
  const update = (set: (value: string) => void, value: string) => {
    set(value);
    setPage(1);
  };
  const clear = () => {
    setQuery("");
    setFrom(report ? treasuryDateKey() : "");
    setTo(report ? treasuryDateKey() : "");
    setChannel("");
    setCashier("");
    setPage(1);
  };
  const rows = ledger.data?.tickets ?? [];
  const openExceptions =
    exceptions.data?.exceptions.filter((item) => item.status === "open") ?? [];
  const checkProvider = async (item: PaymentException) => {
    if (checking) return;
    setChecking(item.id);
    setProviderMessage(null);
    try {
      const response = await fetch("/api/payments/reconcile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticketId: item.ticketId }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok)
        throw new Error(
          payload?.error || "Unable to check the payment provider.",
        );
      if (typeof payload?.paid !== "boolean") {
        throw new Error(
          "The provider check did not return a confirmed status. Please retry.",
        );
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["treasury"] }),
        queryClient.invalidateQueries({ queryKey: ["workflow"] }),
      ]);
      if (payload.paid)
        toast.success("Payment confirmed and citation reconciled.");
      else {
        const message =
          "Awaiting provider confirmation. This checkout has not settled the citation.";
        setProviderMessage({ id: item.id, message });
        toast.info(message);
      }
    } catch (cause) {
      const message =
        cause instanceof Error
          ? cause.message
          : "Unable to check the payment provider.";
      setProviderMessage({ id: item.id, message });
      toast.error(message);
    } finally {
      setChecking(null);
    }
  };
  const exportCsv = async () => {
    if (
      exportAbort.current ||
      !dateValid ||
      !ledger.data ||
      query.trim() !== debounced
    )
      return;
    const controller = new AbortController();
    exportAbort.current = controller;
    setExporting(true);
    try {
      const all: Ticket[] = [];
      let expectedTotal: number | undefined;
      let expectedAmount: number | undefined;
      let exportPage = 1;
      let hasNext = true;
      while (hasNext) {
        const parameters = new URLSearchParams({
          query: debounced,
          from,
          to,
          channel,
          receivedBy: cashier,
          page: String(exportPage),
          pageSize: "100",
        });
        const data = await treasuryRequest<PaymentPage>(
          `payments?${parameters}`,
          { signal: controller.signal },
        );
        if (expectedTotal === undefined) {
          expectedTotal = data.total;
          expectedAmount = data.totalAmount;
        }
        if (data.total !== expectedTotal || data.totalAmount !== expectedAmount)
          throw new Error(
            "Payments changed during export. Refresh the report and export again.",
          );
        all.push(...data.tickets);
        hasNext = all.length < data.total;
        if (hasNext && data.tickets.length === 0)
          throw new Error(
            "The complete report could not be loaded. Please retry.",
          );
        exportPage++;
      }
      const totalAmount = all.reduce(
        (sum, ticket) => sum + (ticket.payment?.amount ?? 0),
        0,
      );
      if (
        new Set(all.map((ticket) => ticket.payment?.id)).size !== all.length ||
        all.length !== expectedTotal ||
        Math.abs(totalAmount - (expectedAmount ?? 0)) > 0.01
      )
        throw new Error(
          "The report changed during export. Refresh and try again.",
        );
      downloadCsv(
        `treasury-collections-${from || "all"}-${to || treasuryDateKey()}.csv`,
        [
          "OR / provider reference",
          "Citation",
          "Plate",
          "Violator",
          "Paid at (Philippine time)",
          "Channel",
          "Cashier",
          "Amount",
          "Payment reference",
        ],
        all.map((ticket) => [
          ticket.payment!.orNumber,
          ticket.id,
          ticket.plateNo,
          ticket.violatorName,
          receiptDate(ticket.payment!.paidAt),
          ticket.payment!.channel,
          ticket.payment!.receivedBy,
          ticket.payment!.amount,
          ticket.payment!.id,
        ]),
      );
      toast.success(
        `Exported ${all.length} payment records totaling ${peso(totalAmount)}.`,
      );
    } catch (error) {
      if (!controller.signal.aborted)
        toast.error(
          error instanceof Error ? error.message : "Unable to export payments.",
        );
    } finally {
      exportAbort.current = null;
      if (!controller.signal.aborted) setExporting(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">
            {report ? "Collection reports" : "Transactions & receipts"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {report
              ? "Review recorded collections with matching totals and exports."
              : "Find an existing payment, view its details, and reprint its receipt."}
          </p>
        </div>
        <button
          disabled={
            exporting ||
            ledger.isFetching ||
            !ledger.data?.total ||
            !dateValid ||
            query.trim() !== debounced
          }
          onClick={() => void exportCsv()}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground disabled:opacity-40"
        >
          {exporting ? (
            <LoaderCircle className="size-4 animate-spin" />
          ) : (
            <Download className="size-4" />
          )}
          {exporting ? "Preparing CSV…" : "Export filtered CSV"}
        </button>
      </div>
      {!report && (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setShowExceptions(false)}
            className={`min-h-10 rounded-full px-4 text-sm font-semibold ${!showExceptions ? "bg-primary text-primary-foreground" : "border border-border bg-card"}`}
          >
            Payments
          </button>
          <button
            onClick={() => setShowExceptions(true)}
            className={`inline-flex min-h-10 items-center gap-2 rounded-full px-4 text-sm font-semibold ${showExceptions ? "bg-primary text-primary-foreground" : "border border-border bg-card"}`}
          >
            <TriangleAlert className="size-4" />
            Payment exceptions{" "}
            {exceptions.data && (
              <span className="rounded-full bg-background/20 px-2 text-xs">
                {exceptions.data.total}
              </span>
            )}
          </button>
        </div>
      )}
      {showExceptions && !report ? (
        <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-panel">
          <div className="border-b border-border p-5">
            <h2 className="font-bold">Payments that need attention</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Verify the payment reference and citation before accepting another
              payment. Refer unresolved online payments to the administrator.
            </p>
          </div>
          {exceptions.isLoading ? (
            <p
              role="status"
              className="p-10 text-center text-sm text-muted-foreground"
            >
              Loading exceptions…
            </p>
          ) : exceptions.isError ? (
            <div role="alert" className="p-5 text-sm">
              <p>{exceptions.error.message}</p>
              <button
                onClick={() => void exceptions.refetch()}
                className="mt-2 font-bold text-primary"
              >
                Retry
              </button>
            </div>
          ) : (
            <>
              <div className="divide-y divide-border">
                {openExceptions.map((item) => (
                  <div
                    key={item.id}
                    className="flex flex-wrap items-start justify-between gap-4 p-5"
                  >
                    <div>
                      <p className="font-mono text-sm font-bold">
                        {item.ticketId || "Unmatched payment"}
                      </p>
                      <p className="mt-1 text-sm">{item.reason}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {receiptDate(item.createdAt)}
                        {item.providerReference
                          ? ` · Reference ${item.providerReference}`
                          : ""}
                      </p>
                      {providerMessage?.id === item.id && (
                        <p
                          role="status"
                          className="mt-3 max-w-xl rounded-lg bg-amber-50 p-3 text-sm text-amber-900"
                        >
                          {providerMessage.message}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {item.providerReference?.startsWith("link_") &&
                        item.ticketId && (
                          <button
                            disabled={Boolean(checking)}
                            onClick={() => void checkProvider(item)}
                            className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-primary/5 px-4 text-sm font-semibold text-primary disabled:opacity-40"
                          >
                            {checking === item.id ? (
                              <LoaderCircle className="size-4 animate-spin" />
                            ) : (
                              <RefreshCw className="size-4" />
                            )}
                            {checking === item.id
                              ? "Checking…"
                              : "Check provider"}
                          </button>
                        )}
                      {item.ticketId && (
                        <Link
                          to="/treasury/cashier"
                          search={{ ticket: item.ticketId }}
                          className="inline-flex min-h-10 items-center rounded-xl border border-border px-4 text-sm font-semibold text-primary"
                        >
                          Review citation
                        </Link>
                      )}
                    </div>
                  </div>
                ))}
                {openExceptions.length === 0 && (
                  <div className="p-12 text-center">
                    <ReceiptText className="mx-auto mb-3 size-8 text-primary/50" />
                    <p className="font-semibold">No open payment exceptions</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Payment reconciliation issues will appear here for review.
                    </p>
                  </div>
                )}
              </div>
              <RecordPager
                page={exceptionPage}
                pageSize={25}
                total={exceptions.data?.total ?? 0}
                loading={exceptions.isFetching}
                onPage={setExceptionPage}
              />
            </>
          )}
        </section>
      ) : (
        <>
          <section
            aria-label="Payment filters"
            className="rounded-2xl border border-border bg-card p-4 shadow-panel"
          >
            <fieldset
              disabled={exporting}
              className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"
            >
              <div className="sm:col-span-2 xl:col-span-1">
                <label
                  htmlFor="ledger-query"
                  className="mb-1.5 block text-xs font-semibold"
                >
                  Search payments
                </label>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-3.5 size-4 text-muted-foreground" />
                  <input
                    id="ledger-query"
                    value={query}
                    onChange={(e) => update(setQuery, e.target.value)}
                    placeholder="OR, citation, plate, or name"
                    className={`${fieldClass} pl-9`}
                  />
                </div>
              </div>
              <div>
                <label
                  htmlFor="ledger-from"
                  className="mb-1.5 block text-xs font-semibold"
                >
                  Paid from (Philippine time)
                </label>
                <input
                  id="ledger-from"
                  type="date"
                  value={from}
                  onChange={(e) => update(setFrom, e.target.value)}
                  max={to || undefined}
                  className={fieldClass}
                />
              </div>
              <div>
                <label
                  htmlFor="ledger-to"
                  className="mb-1.5 block text-xs font-semibold"
                >
                  Paid through
                </label>
                <input
                  id="ledger-to"
                  type="date"
                  value={to}
                  onChange={(e) => update(setTo, e.target.value)}
                  min={from || undefined}
                  className={fieldClass}
                />
              </div>
              <div>
                <label
                  htmlFor="ledger-channel"
                  className="mb-1.5 block text-xs font-semibold"
                >
                  Channel
                </label>
                <select
                  id="ledger-channel"
                  value={channel}
                  onChange={(e) => update(setChannel, e.target.value)}
                  className={fieldClass}
                >
                  <option value="">All channels</option>
                  {channels.map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </select>
              </div>
              <div>
                <label
                  htmlFor="ledger-cashier"
                  className="mb-1.5 block text-xs font-semibold"
                >
                  Cashier / received by
                </label>
                <input
                  id="ledger-cashier"
                  list="ledger-cashiers"
                  value={cashier}
                  onChange={(e) => update(setCashier, e.target.value)}
                  placeholder="All cashiers"
                  className={fieldClass}
                />
                <datalist id="ledger-cashiers">
                  {ledger.data?.cashiers.map((name) => (
                    <option value={name} key={name} />
                  ))}
                </datalist>
              </div>
              <div className="flex items-end gap-2">
                <button
                  onClick={clear}
                  className="min-h-11 rounded-xl border border-border px-4 text-sm font-semibold"
                >
                  Reset filters
                </button>
                <button
                  aria-label="Refresh payments"
                  disabled={ledger.isFetching}
                  onClick={() => void ledger.refetch()}
                  className="flex size-11 items-center justify-center rounded-xl border border-border disabled:opacity-40"
                >
                  <RefreshCw
                    className={`size-4 ${ledger.isFetching ? "animate-spin" : ""}`}
                  />
                </button>
              </div>
            </fieldset>
            {!dateValid && (
              <p role="alert" className="mt-3 text-sm text-destructive">
                The end date must be on or after the start date.
              </p>
            )}
          </section>
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              ["Total collections", ledger.data?.totalAmount],
              ["Cash collections", ledger.data?.cashAmount],
              ["Online collections", ledger.data?.onlineAmount],
            ].map(([label, amount]) => (
              <div
                key={String(label)}
                className="rounded-2xl border border-border bg-card p-5 shadow-panel"
              >
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="mt-2 text-2xl font-bold text-primary">
                  {dateValid && amount !== undefined
                    ? peso(Number(amount))
                    : "—"}
                </p>
              </div>
            ))}
          </div>
          <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-panel">
            <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
              <h2 className="text-sm font-bold">
                {ledger.data?.total ?? 0} matching payments
              </h2>
              {ledger.isFetching && (
                <span role="status" className="text-xs text-muted-foreground">
                  Updating…
                </span>
              )}
            </div>
            {ledger.isError ? (
              <div role="alert" className="p-6 text-sm">
                <p>{ledger.error.message}</p>
                <button
                  onClick={() => void ledger.refetch()}
                  className="mt-2 font-bold text-primary"
                >
                  Retry payments
                </button>
              </div>
            ) : !dateValid ? (
              <p className="p-10 text-center text-sm text-muted-foreground">
                Choose a valid date range to view collections.
              </p>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-muted/20 text-xs text-muted-foreground">
                      <tr>
                        {[
                          "Receipt / citation",
                          "Violator / plate",
                          "Channel / cashier",
                          "Paid",
                          "Amount",
                          "",
                        ].map((heading, index) => (
                          <th key={index} className="px-4 py-3 font-semibold">
                            {heading}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {rows.map((ticket) => (
                        <tr key={ticket.id} className="hover:bg-muted/20">
                          <td className="px-4 py-4">
                            <p className="font-mono text-xs font-bold">
                              {ticket.payment!.orNumber}
                            </p>
                            <p className="mt-1 font-mono text-xs text-muted-foreground">
                              {ticket.id}
                            </p>
                          </td>
                          <td className="px-4 py-4">
                            <p className="font-semibold">
                              {ticket.violatorName}
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {ticket.plateNo}
                            </p>
                          </td>
                          <td className="px-4 py-4">
                            <p className="text-xs">{ticket.payment!.channel}</p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {ticket.payment!.receivedBy}
                            </p>
                          </td>
                          <td className="px-4 py-4 text-xs text-muted-foreground">
                            {receiptDate(ticket.payment!.paidAt)}
                          </td>
                          <td className="whitespace-nowrap px-4 py-4 font-semibold">
                            {peso(ticket.payment!.amount)}
                          </td>
                          <td className="px-4 py-4">
                            <Link
                              to="/treasury/receipts"
                              search={{ ticket: ticket.id }}
                              className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-primary/5 px-3 text-xs font-bold text-primary"
                            >
                              <ReceiptText className="size-4" />
                              Receipt
                            </Link>
                          </td>
                        </tr>
                      ))}
                      {!rows.length && (
                        <tr>
                          <td
                            colSpan={6}
                            className="p-12 text-center text-muted-foreground"
                          >
                            {ledger.isLoading
                              ? "Loading payment records…"
                              : "No payments match these filters."}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-4 text-sm">
                  <span className="text-muted-foreground">
                    Page {page} of{" "}
                    {Math.max(1, Math.ceil((ledger.data?.total ?? 0) / 25))}
                  </span>
                  <div className="flex gap-2">
                    <button
                      disabled={page === 1 || ledger.isFetching}
                      onClick={() => setPage((value) => value - 1)}
                      className="min-h-10 rounded-xl border border-border px-4 font-semibold disabled:opacity-40"
                    >
                      Previous
                    </button>
                    <button
                      disabled={
                        !ledger.data ||
                        page * 25 >= ledger.data.total ||
                        ledger.isFetching
                      }
                      onClick={() => setPage((value) => value + 1)}
                      className="min-h-10 rounded-xl border border-border px-4 font-semibold disabled:opacity-40"
                    >
                      Next
                    </button>
                  </div>
                </div>
              </>
            )}
          </section>
        </>
      )}
    </div>
  );
}
