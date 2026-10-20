import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect, useCallback, useRef } from "react";
import {
  Search,
  ShieldCheck,
  QrCode,
  CheckCircle2,
  Printer,
  ReceiptText,
  ArrowLeft,
  AlertTriangle,
} from "lucide-react";
import { useTicketStore } from "@/store/useTicketStore";
import { StatusBadge } from "@/components/StatusBadge";
import { peso, dateTime, shortDate, daysUntil } from "@/lib/format";
import type { Ticket } from "@/types";
import { toast } from "sonner";

export const Route = createFileRoute("/portal")({
  head: () => ({
    meta: [
      { title: "Online Pay | Citation Ticket & Payment System" },
      {
        name: "description",
        content:
          "Look up your traffic citation ticket by ID, pay securely online via QRPh, and download your official e-receipt.",
      },
      {
        property: "og:title",
        content: "Online Pay — Pay Your Citation Online",
      },
      {
        property: "og:description",
        content:
          "Look up your traffic citation, pay via QRPh, and download your e-receipt.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PortalPage,
});

type Stage = "lookup" | "pay" | "receipt";

function PortalPage() {
  const getTicket = useTicketStore((s) => s.getTicket);
  const [query, setQuery] = useState("");
  const [ticketId, setTicketId] = useState<string | null>(null);
  const ticket = useTicketStore((s) =>
    s.tickets.find((ticket) => ticket.id === ticketId),
  );
  const [notFound, setNotFound] = useState(false);
  const [stage, setStage] = useState<Stage>("lookup");
  const showReceipt = useCallback(() => setStage("receipt"), []);

  const search = (e?: React.FormEvent) => {
    e?.preventDefault();
    const lookupToastId = "citation-lookup";
    if (!query.trim()) {
      toast.error("Enter a citation ticket number", { id: lookupToastId });
      return;
    }
    const state = useTicketStore.getState();
    if (state.loading || !state.loaded) {
      toast.info("Citation records are still loading", {
        id: lookupToastId,
        description: "Please try your lookup again in a moment.",
      });
      return;
    }
    if (state.error) {
      toast.error("Unable to look up your citation", {
        id: lookupToastId,
        description: "Check your connection and refresh the page to try again.",
      });
      return;
    }
    const found = getTicket(query);
    setTicketId(found?.id ?? null);
    setNotFound(!found);
    setStage("lookup");
    if (found) {
      toast.success("Citation found", {
        id: lookupToastId,
        description: `${found.id} · ${found.status}`,
      });
    } else {
      toast.error("Citation not found", {
        id: lookupToastId,
        description: "Check your ticket number and try again.",
      });
    }
  };

  const reset = () => {
    setTicketId(null);
    setNotFound(false);
    setQuery("");
    setStage("lookup");
  };

  return (
    <div className="min-h-screen print:min-h-0">
      <header className="no-print bg-authority shadow-lift">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImciIHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PGNpcmNsZSBjeD0iMzAiIGN5PSIzMCIgcj0iMC41IiBmaWxsPSJyZ2JhKDI1NSwyNTUsMjU1LDAuMDUpIi8+PC9wYXR0ZXJuPjwvZGVmcz48cmVjdCBmaWxsPSJ1cmwoI2cpIiB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIi8+PC9zdmc+')] opacity-60" />
        <div className="relative mx-auto flex max-w-3xl flex-wrap items-center gap-2 px-3 py-3 sm:gap-3 sm:px-6 sm:py-4">
          <Link
            to="/"
            className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-white/10 border border-white/10 backdrop-blur-sm transition-all hover:bg-white/20 hover:shadow-glow"
            aria-label="Back to role selection"
          >
            <ShieldCheck className="size-4 text-sidebar-primary sm:size-5" />
          </Link>
          <div className="min-w-0 flex-1">
            <p className="font-display text-sm font-bold leading-tight text-primary-foreground sm:text-base">
              Online Pay
            </p>
            <p className="text-[11px] text-primary-foreground/60 sm:text-xs">
              Public access — look up and settle your citation
            </p>
          </div>
          <span className="rounded-full border border-sidebar-primary/30 bg-sidebar-primary/15 px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest text-sidebar-primary sm:px-2.5 sm:py-1 sm:text-[10px]">
            Public
          </span>
        </div>
      </header>

      <main className="on-brand mx-auto max-w-3xl px-3 py-5 sm:px-6 sm:py-8 print:m-0 print:max-w-none print:p-0">
        {/* Lookup */}
        <form
          onSubmit={search}
          className="no-print animate-fade-in-up rounded-2xl border border-border bg-card p-5 shadow-panel sm:p-6"
        >
          <label
            htmlFor="ticket-id"
            className="text-sm font-bold text-card-foreground"
          >
            Citation Ticket Number
          </label>
          <p className="mt-1 text-xs text-muted-foreground">
            Found on the top of your printed citation (e.g. CTN-2026-0001).
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <input
              id="ticket-id"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="CTN-2026-0000"
              className="h-12 min-w-0 flex-1 rounded-xl border border-input bg-background px-4 font-mono text-sm uppercase tracking-wide text-foreground outline-none ring-ring transition-all focus:border-ring focus:ring-2 focus:ring-ring/20"
            />
            <button
              type="submit"
              className="flex h-12 items-center justify-center gap-2 rounded-xl bg-primary px-6 text-sm font-bold text-primary-foreground shadow-sm transition-all hover:brightness-110 active:scale-[0.98]"
            >
              <Search className="size-4" />
              Look up
            </button>
          </div>
          {notFound && (
            <p className="mt-3 flex items-center gap-2 rounded-xl bg-overdue/20 border border-overdue/30 px-4 py-2.5 text-sm font-medium text-overdue-foreground animate-scale-in">
              <AlertTriangle className="size-4 shrink-0" />
              No citation found with that number. Check the ticket and try
              again.
            </p>
          )}
        </form>

        {ticket && stage === "lookup" && (
          <TicketCard
            ticket={ticket}
            onPay={() => setStage("pay")}
            onViewReceipt={showReceipt}
          />
        )}
        {ticket && stage === "pay" && (
          <QrphPayment
            ticket={ticket}
            onBack={() => setStage("lookup")}
            onDone={showReceipt}
          />
        )}
        {ticket && stage === "receipt" && (
          <Receipt ticket={ticket} onReset={reset} />
        )}
      </main>
    </div>
  );
}

function TicketCard({
  ticket,
  onPay,
  onViewReceipt,
}: {
  ticket: Ticket;
  onPay: () => void;
  onViewReceipt: () => void;
}) {
  const days = daysUntil(ticket.dueDate);
  return (
    <section className="mt-6 animate-fade-in-up rounded-2xl border border-border bg-card p-5 shadow-panel sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-mono text-lg font-bold text-card-foreground">
            {ticket.id}
          </p>
          <p className="text-xs text-muted-foreground">
            Issued {dateTime(ticket.issuedAt)} by {ticket.issuedBy}
          </p>
        </div>
        <StatusBadge status={ticket.status} />
      </div>

      <dl className="mt-5 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
        <Field label="Violator" value={ticket.violatorName} />
        <Field label="License No." value={ticket.licenseNo} />
        <Field label="Plate No." value={ticket.plateNo} />
        <Field label="Vehicle" value={ticket.vehicleType} />
        <Field label="Issued By" value={ticket.issuedBy} />
        <Field label="Location" value={ticket.location} />
        <Field
          label="Due date"
          value={`${shortDate(ticket.dueDate)}${
            ticket.status !== "Paid"
              ? days >= 0
                ? ` (${days} day${days === 1 ? "" : "s"} left)`
                : ` (${-days} day${days === -1 ? "" : "s"} overdue)`
              : ""
          }`}
        />
      </dl>

      <div className="mt-5 rounded-xl bg-muted/60 p-4">
        <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Violations
        </p>
        <ul className="mt-2 space-y-2">
          {ticket.violations.map((v) => (
            <li
              key={v.code}
              className="flex items-center justify-between gap-3 text-sm text-card-foreground"
            >
              <span>
                <span className="font-mono text-xs text-muted-foreground">
                  {v.code}
                </span>{" "}
                {v.label}
              </span>
              <span className="tabular font-semibold">{peso(v.fine)}</span>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
          <span className="text-sm font-bold text-card-foreground">
            Total fine
          </span>
          <span className="font-display text-xl font-bold tabular text-card-foreground">
            {peso(ticket.totalFine)}
          </span>
        </div>
      </div>

      {ticket.photoData && (
        <div className="mt-5">
          <p className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Evidence Photo
          </p>
          <div className="overflow-hidden rounded-xl border border-border bg-black/5">
            <img
              src={ticket.photoData}
              alt="Evidence"
              className="max-h-64 w-full object-contain"
            />
          </div>
        </div>
      )}

      {ticket.status === "Paid" ? (
        <div className="mt-5 space-y-3">
          <p className="flex items-center gap-2 rounded-xl bg-paid/20 border border-paid/30 px-4 py-3 text-sm font-medium text-paid-foreground">
            <CheckCircle2 className="size-4 shrink-0" />
            This citation has been settled.
            {ticket.payment && ` OR ${ticket.payment.orNumber}.`}
          </p>
          {ticket.payment ? (
            <>
              <button
                type="button"
                onClick={onViewReceipt}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-bold text-primary-foreground shadow-sm transition-all hover:brightness-110 active:scale-[0.98]"
              >
                <ReceiptText className="size-4" />
                View e-receipt
              </button>
              <p className="text-center text-xs text-muted-foreground">
                View, print, or save a copy of your payment receipt anytime.
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground" role="status">
              Receipt details are not available yet. Please try again later or
              contact the Municipal Treasury. Do not pay again.
            </p>
          )}
        </div>
      ) : ticket.status === "Contested" ? (
        <p className="mt-5 flex items-center gap-2 rounded-xl bg-contested/20 border border-contested/30 px-4 py-3 text-sm font-medium text-contested-foreground">
          <AlertTriangle className="size-4 shrink-0" />
          This citation is under contest. Please appear at the Traffic
          Management Office.
        </p>
      ) : (
        <button
          onClick={onPay}
          className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-bold text-primary-foreground shadow-sm transition-all hover:brightness-110 active:scale-[0.98]"
        >
          <QrCode className="size-4" />
          Pay {peso(ticket.totalFine)} via QRPh
        </button>
      )}
    </section>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-0.5 font-medium text-card-foreground">{value}</dd>
    </div>
  );
}

function QrphPayment({
  ticket,
  onBack,
  onDone,
}: {
  ticket: Ticket;
  onBack: () => void;
  onDone: () => void;
}) {
  const fetchTickets = useTicketStore((s) => s.fetchTickets);
  const [processing, setProcessing] = useState(false);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const [linkId, setLinkId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const linkRequest = useRef<AbortController | null>(null);

  const generateLink = useCallback(async () => {
    linkRequest.current?.abort();
    const controller = new AbortController();
    linkRequest.current = controller;
    const { signal } = controller;
    const toastId = `payment-link-${ticket.id}`;
    setProcessing(true);
    setError(null);
    setCheckoutUrl(null);
    setLinkId(null);
    try {
      const res = await fetch("/api/payments/link", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ticketId: ticket.id }),
        signal,
      });
      const data = await res.json();
      if (!res.ok)
        throw new Error(
          data.error || "Unable to create payment link. Please try again.",
        );
      if (!data.checkoutUrl || !data.linkId)
        throw new Error("The payment service returned an invalid link.");
      if (!signal.aborted) {
        setCheckoutUrl(data.checkoutUrl);
        setLinkId(data.linkId);
        toast.success("Payment page ready", {
          id: toastId,
          description: "Open the secure payment page to complete your payment.",
        });
      }
    } catch (e: unknown) {
      if (!signal.aborted) {
        const message =
          e instanceof Error && e.message !== "Failed to fetch"
            ? e.message
            : "Unable to connect to the payment service. Check your connection and try again.";
        setError(message);
        toast.error("Unable to start online payment", {
          id: toastId,
          description: message,
        });
      }
    } finally {
      if (!signal.aborted) setProcessing(false);
      if (linkRequest.current === controller) linkRequest.current = null;
    }
  }, [ticket.id]);

  useEffect(() => {
    void generateLink();
    return () => linkRequest.current?.abort();
  }, [generateLink]);

  useEffect(() => {
    if (!linkId) return;
    const controller = new AbortController();
    let checking = false;
    let completed = false;
    let paymentConfirmed = false;
    let lastError: string | null = null;
    const toastId = `payment-status-${ticket.id}`;
    const checkStatus = async () => {
      if (checking || completed || controller.signal.aborted) return;
      checking = true;
      try {
        const res = await fetch("/api/payments/status", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ticketId: ticket.id, linkId }),
          signal: controller.signal,
        });
        const data = await res.json();
        if (!res.ok)
          throw new Error(
            data.error ||
              "Unable to check payment status. Retrying automatically.",
          );
        if (controller.signal.aborted) return;
        if (data.paid === true) {
          paymentConfirmed = true;
          await fetchTickets();
          if (controller.signal.aborted) return;
          const state = useTicketStore.getState();
          if (state.error || !state.getTicket(ticket.id)?.payment) {
            throw new Error(
              "Payment confirmed. Retrying receipt sync; please do not pay again.",
            );
          }
          completed = true;
          toast.dismiss(`payment-link-${ticket.id}`);
          toast.success("Payment successful", {
            id: toastId,
            description: `Your payment for ${ticket.id} is confirmed. Your e-receipt is ready.`,
          });
          onDone();
        } else if (lastError) {
          toast.dismiss(toastId);
        }
        setError(null);
        lastError = null;
      } catch (e: unknown) {
        if (!controller.signal.aborted) {
          const message =
            e instanceof Error && e.message !== "Failed to fetch"
              ? e.message
              : "Unable to check payment status. Retrying automatically.";
          setError(message);
          if (message !== lastError) {
            if (paymentConfirmed) {
              toast.warning("Payment confirmed; receipt pending", {
                id: toastId,
                description: message,
              });
            } else {
              toast.error("Unable to check payment status", {
                id: toastId,
                description: message,
              });
            }
            lastError = message;
          }
        }
      } finally {
        checking = false;
      }
    };
    void checkStatus();
    const interval = setInterval(() => void checkStatus(), 3000);
    return () => {
      controller.abort();
      clearInterval(interval);
      if (!completed) toast.dismiss(toastId);
    };
  }, [linkId, ticket.id, onDone, fetchTickets]);

  return (
    <section className="mt-6 animate-scale-in rounded-2xl border border-border bg-card p-5 text-center shadow-panel sm:p-6">
      <h2 className="font-display text-lg font-bold text-card-foreground">
        Secure Online Payment
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Powered by PayMongo (QRPh, GCash, Maya, Cards)
      </p>

      <div className="mt-5 rounded-xl bg-muted/30 p-6 flex flex-col items-center">
        <p className="font-display text-3xl font-bold tabular text-card-foreground">
          {peso(ticket.totalFine)}
        </p>
        <p className="font-mono text-sm text-muted-foreground mt-1">
          Ticket {ticket.id}
        </p>

        {error && (
          <div className="mt-4 p-3 bg-destructive/10 text-destructive text-sm rounded-lg border border-destructive/20">
            {error}
          </div>
        )}

        {error && !checkoutUrl && (
          <button
            type="button"
            onClick={() => void generateLink()}
            disabled={processing}
            className="mt-4 rounded-xl border border-border px-5 py-3 text-sm font-semibold text-foreground transition-colors hover:bg-muted disabled:opacity-50"
          >
            Try again
          </button>
        )}

        {!checkoutUrl && !error && (
          <div className="mt-6 flex flex-col items-center gap-3">
            <div className="size-6 animate-spin rounded-full border-2 border-primary border-t-transparent"></div>
            <p className="text-sm text-muted-foreground">
              Generating secure payment link...
            </p>
          </div>
        )}

        {checkoutUrl && (
          <div className="mt-6 w-full">
            <a
              href={checkoutUrl}
              target="_blank"
              rel="noreferrer"
              className="flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-primary text-base font-bold text-primary-foreground shadow-sm transition-all hover:brightness-110 active:scale-[0.98]"
            >
              Open Payment Page
            </a>
            <p className="mt-4 text-xs text-muted-foreground max-w-xs mx-auto">
              Please complete the payment in the secure tab that opens. This
              page will automatically show your e-receipt once the payment is
              confirmed. You can also look up this citation later to view it.
            </p>
          </div>
        )}
      </div>

      <div className="mt-5 flex flex-col gap-2 sm:flex-row">
        <button
          onClick={onBack}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-border text-sm font-bold text-card-foreground transition-all hover:bg-muted active:scale-[0.98]"
        >
          <ArrowLeft className="size-4" />
          Cancel and go back
        </button>
      </div>
    </section>
  );
}

function Receipt({ ticket, onReset }: { ticket: Ticket; onReset: () => void }) {
  const p = ticket.payment;
  if (!p) return null;
  return (
    <section className="mt-6 animate-fade-in-up rounded-2xl border border-border bg-card p-5 shadow-panel sm:p-6 print:m-0 print:animate-none print:border-0 print:p-0 print:shadow-none">
      <div className="no-print flex items-center gap-2 text-paid-foreground">
        <CheckCircle2 className="size-6" />
        <h2 className="font-display text-lg font-bold">Payment successful</h2>
      </div>

      <div className="print-area mt-4 rounded-xl border-2 border-dashed border-border bg-muted/30 p-5 font-mono text-sm text-card-foreground print:mt-0">
        <p className="text-center text-xs uppercase tracking-widest text-muted-foreground">
          Republic of the Philippines
        </p>
        <p className="text-center text-xs uppercase tracking-widest text-muted-foreground">
          Municipality of Gitagum
        </p>
        <p className="mt-1 text-center text-xs uppercase tracking-widest text-muted-foreground">
          Municipal Treasury — Official e-Receipt
        </p>
        <div className="my-3 border-t border-dashed border-border" />
        <dl className="space-y-1.5">
          <Row k="OR Number" v={p.orNumber} />
          <Row k="Transaction ID" v={p.id} />
          <Row k="Citation" v={ticket.id} />
          <Row k="Paid by" v={ticket.violatorName} />
          <Row k="Plate No." v={ticket.plateNo} />
          <Row k="Channel" v={p.channel} />
          <Row k="Date paid" v={dateTime(p.paidAt)} />
          <Row k="Received by" v={p.receivedBy} />
        </dl>
        <div className="my-3 border-t border-dashed border-border" />
        <div className="flex items-center justify-between">
          <span className="font-bold">AMOUNT PAID</span>
          <span className="font-display text-xl font-bold tabular">
            {peso(p.amount)}
          </span>
        </div>
      </div>

      <p className="no-print mt-4 text-center text-xs text-muted-foreground">
        Choose “Save as PDF” in the print dialog to download your receipt. You
        can retrieve it later using your citation ticket number.
      </p>
      <div className="no-print mt-5 flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          onClick={() => window.print()}
          className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-primary text-sm font-bold text-primary-foreground shadow-sm transition-all hover:brightness-110 active:scale-[0.98]"
        >
          <Printer className="size-4" />
          Print / save PDF
        </button>
        <button
          onClick={onReset}
          className="h-12 rounded-xl border border-border px-5 text-sm font-bold text-card-foreground transition-all hover:bg-muted active:scale-[0.98]"
        >
          New lookup
        </button>
      </div>
    </section>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="shrink-0 text-muted-foreground">{k}</dt>
      <dd className="min-w-0 break-words text-right font-medium">{v}</dd>
    </div>
  );
}
