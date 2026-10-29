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
import {
  readPaymentRecovery,
  savePaymentRecovery,
  clearPaymentRecovery,
} from "@/lib/public-payment-recovery";
import { StatusBadge } from "@/components/StatusBadge";
import { peso, dateTime, shortDate, daysUntil } from "@/lib/format";
import type { Ticket } from "@/types";
import { toast } from "sonner";

export const Route = createFileRoute("/portal")({
  head: () => ({
    meta: [
      { title: "Online Pay | Citation Ticket & Payment System" },
      { name: "referrer", content: "no-referrer" },
      {
        name: "description",
        content:
          "Look up your traffic citation ticket by ID, pay securely online via QRPh, and download your payment record.",
      },
      {
        property: "og:title",
        content: "Online Pay — Pay Your Citation Online",
      },
      {
        property: "og:description",
        content:
          "Look up your traffic citation, pay via QRPh, and download your payment record.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PortalPage,
});

type Stage = "lookup" | "pay" | "receipt";

type PublicVerification = { accessToken?: string; licenseNo?: string };

async function publicRequest<T>(
  path: string,
  body: object,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    ...(signal ? { signal } : {}),
    referrerPolicy: "no-referrer",
  });
  const result = await response.json().catch(() => null);
  if (!response.ok)
    throw new Error(
      result?.error ||
        "Unable to verify this citation. Check the details and try again.",
    );
  if (!result)
    throw new Error(
      "The server returned an unreadable response. Please retry.",
    );
  return result as T;
}

function PortalPage() {
  const [query, setQuery] = useState("");
  const [officeInformation, setOfficeInformation] = useState("");
  const [licenseNo, setLicenseNo] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [verification, setVerification] = useState<PublicVerification>({});
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [recoveryTicket, setRecoveryTicket] = useState("");
  const [stage, setStage] = useState<Stage>("lookup");
  const lookupRequest = useRef<AbortController | null>(null);
  const showReceipt = useCallback(() => setStage("receipt"), []);

  const lookup = useCallback(
    async (ticketId: string, credentials: PublicVerification) => {
      lookupRequest.current?.abort();
      const controller = new AbortController();
      lookupRequest.current = controller;
      setLoading(true);
      setError("");
      setTicket(null);
      setStage("lookup");
      try {
        const result = await publicRequest<{ ticket: Ticket }>(
          "/api/public/ticket",
          { ticketId, ...credentials },
          controller.signal,
        );
        if (controller.signal.aborted) return;
        setTicket(result.ticket);
        setQuery(result.ticket.id);
        setVerification(credentials);
        const saved = readPaymentRecovery();
        if (
          saved?.ticketId === result.ticket.id &&
          result.ticket.status !== "Paid"
        )
          setStage("pay");
        if (
          result.ticket.status === "Paid" &&
          saved?.ticketId === result.ticket.id
        )
          clearPaymentRecovery();
      } catch (failure) {
        if (!controller.signal.aborted)
          setError(
            failure instanceof Error
              ? failure.message
              : "Unable to connect. Please retry.",
          );
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ticketId = params.get("ticket")?.trim().toUpperCase() || "";
    const token = params.get("access") || "";
    const recovery = readPaymentRecovery();
    setQuery(ticketId || recovery?.ticketId || "");
    setAccessToken(token);
    setRecoveryTicket(recovery?.ticketId || "");
    if (ticketId && token) void lookup(ticketId, { accessToken: token });
    return () => lookupRequest.current?.abort();
  }, [lookup]);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/public/information", {
      signal: controller.signal,
      referrerPolicy: "no-referrer",
    })
      .then(async (response) => (response.ok ? response.json() : null))
      .then((result) => {
        if (
          !controller.signal.aborted &&
          typeof result?.officeInformation === "string"
        )
          setOfficeInformation(result.officeInformation);
      })
      .catch(() => {
        /* Standard Treasury guidance remains available while office information is unavailable. */
      });
    return () => controller.abort();
  }, []);

  const search = (event: React.FormEvent) => {
    event.preventDefault();
    if (!query.trim()) {
      setError("Enter your citation ticket number.");
      return;
    }
    if (!accessToken && !licenseNo.trim()) {
      setError(
        "Enter the license or plate number printed on this citation, or scan its secure QR code.",
      );
      return;
    }
    const creds: PublicVerification = accessToken
      ? { accessToken }
      : licenseNo.trim()
        ? { licenseNo: licenseNo.trim() }
        : {};
    void lookup(query.trim().toUpperCase(), creds);
  };
  const paymentDone = useCallback(async () => {
    if (!ticket) return;
    const result = await publicRequest<{ ticket: Ticket }>(
      "/api/public/ticket",
      { ticketId: ticket.id, ...verification },
    );
    if (!result.ticket.payment)
      throw new Error(
        "Payment confirmed. Your receipt is still syncing; please do not pay again.",
      );
    setTicket(result.ticket);
    setStage("receipt");
    clearPaymentRecovery();
    setRecoveryTicket("");
  }, [ticket, verification]);
  const reset = () => {
    lookupRequest.current?.abort();
    setLoading(false);
    setTicket(null);
    setError("");
    setQuery("");
    setLicenseNo("");
    setAccessToken("");
    setVerification({});
    setStage("lookup");
    window.history.replaceState(null, "", "/portal");
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
            <p className="text-[11px] text-primary-foreground/80 sm:text-xs">
              Public access — look up and settle your citation
            </p>
          </div>
          <span className="rounded-full border border-sidebar-primary/30 bg-sidebar-primary/15 px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest text-sidebar-primary sm:px-2.5 sm:py-1 sm:text-[10px]">
            Public
          </span>
        </div>
      </header>

      <main className="on-brand mx-auto max-w-3xl px-3 py-5 sm:px-6 sm:py-8 print:m-0 print:max-w-none print:p-0">
        {officeInformation && (
          <aside className="no-print mb-5 rounded-xl border border-border bg-card p-4 text-sm">
            <h2 className="font-semibold">Municipal Treasury information</h2>
            <p className="mt-2 whitespace-pre-wrap text-muted-foreground">
              {officeInformation}
            </p>
          </aside>
        )}
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
              required
              value={query}
              onChange={(e) => {
                lookupRequest.current?.abort();
                setLoading(false);
                setQuery(e.target.value);
                setTicket(null);
                setAccessToken("");
                setVerification({});
                setStage("lookup");
                setError("");
              }}
              placeholder="CTN-2026-0000"
              className="h-12 min-w-0 flex-1 rounded-xl border border-input bg-background px-4 font-mono text-sm uppercase tracking-wide text-foreground outline-none ring-ring transition-all focus:border-ring focus:ring-2 focus:ring-ring/20"
            />
            <button
              type="submit"
              disabled={loading}
              className="flex h-12 items-center justify-center gap-2 rounded-xl bg-primary px-6 text-sm font-bold text-primary-foreground shadow-sm transition-all hover:brightness-110 active:scale-[0.98]"
            >
              <Search className="size-4" />
              {loading ? "Verifying…" : "Verify citation"}
            </button>
          </div>
          {!accessToken && (
            <label className="mt-4 block text-sm font-semibold">
              License or plate number on citation
              <input
                id="citation-verification"
                required
                value={licenseNo}
                onChange={(event) => {
                  lookupRequest.current?.abort();
                  setLoading(false);
                  setTicket(null);
                  setStage("lookup");
                  setLicenseNo(event.target.value);
                  setVerification({});
                  setError("");
                }}
                autoComplete="off"
                aria-describedby="citation-verification-help"
                placeholder="License number or vehicle plate (e.g. 123ABC)"
                className="mt-2 h-12 w-full rounded-xl border border-input bg-background px-4 font-mono text-sm outline-none focus:ring-2 focus:ring-ring/30"
              />
              <span
                id="citation-verification-help"
                className="mt-2 block text-xs font-normal text-muted-foreground"
              >
                Enter either number exactly as printed on the citation. A ticket
                number alone cannot verify your record. You can also scan the
                secure QR code on your slip.
              </span>
            </label>
          )}
          {accessToken && (
            <div className="mt-3 space-y-2 text-xs text-muted-foreground">
              <p>Secure citation link detected. Keep this link private.</p>
              <button
                type="button"
                className="min-h-10 font-semibold text-primary-text underline underline-offset-4"
                onClick={() => {
                  lookupRequest.current?.abort();
                  setLoading(false);
                  setTicket(null);
                  setStage("lookup");
                  setAccessToken("");
                  setVerification({});
                  setError("");
                  const url = new URL(window.location.href);
                  url.searchParams.delete("access");
                  window.history.replaceState(
                    null,
                    "",
                    url.pathname + url.search,
                  );
                }}
              >
                Use license or plate instead
              </button>
            </div>
          )}
          {recoveryTicket && !ticket && (
            <p className="mt-3 rounded-xl border border-border bg-muted/40 p-3 text-sm">
              A previous online payment for <strong>{recoveryTicket}</strong>{" "}
              can be recovered after verification. Check its status before
              paying again.
            </p>
          )}
          {error && (
            <p
              role="alert"
              className="mt-3 flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
            >
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              {error}
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
            verification={verification}
            onDone={paymentDone}
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

      {ticket.status === "Paid" ? (
        <div className="mt-5 space-y-3">
          <p className="flex items-center gap-2 rounded-xl bg-paid border border-paid px-4 py-3 text-sm font-medium text-paid-foreground">
            <CheckCircle2 className="size-4 shrink-0" />
            This citation has been settled.
            {ticket.payment &&
              ` ${ticket.payment.channel === "Cash (Over-the-counter)" ? "OR" : "Provider reference"} ${ticket.payment.orNumber}.`}
          </p>
          {ticket.payment ? (
            <>
              <button
                type="button"
                onClick={onViewReceipt}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-bold text-primary-foreground shadow-sm transition-all hover:brightness-110 active:scale-[0.98]"
              >
                <ReceiptText className="size-4" />
                View payment record
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
        <p className="mt-5 flex items-center gap-2 rounded-xl bg-contested border border-contested px-4 py-3 text-sm font-medium text-contested-foreground">
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
  verification,
  onBack,
  onDone,
}: {
  ticket: Ticket;
  verification: PublicVerification;
  onBack: () => void;
  onDone: () => Promise<void>;
}) {
  const [processing, setProcessing] = useState(false);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const [linkId, setLinkId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [checkVersion, setCheckVersion] = useState(0);
  const linkRequest = useRef<AbortController | null>(null);
  const ready = useRef(false);
  const generateLink = useCallback(async () => {
    linkRequest.current?.abort();
    const controller = new AbortController();
    linkRequest.current = controller;
    setProcessing(true);
    setError(null);
    try {
      const data = await publicRequest<{ checkoutUrl: string; linkId: string }>(
        "/api/payments/link",
        { ticketId: ticket.id, ...verification },
        controller.signal,
      );
      if (!data.checkoutUrl || !data.linkId)
        throw new Error("The payment service returned an invalid link.");
      const checkout = new URL(data.checkoutUrl);
      if (checkout.protocol !== "https:")
        throw new Error("The payment service returned an insecure link.");
      if (!controller.signal.aborted) {
        setCheckoutUrl(checkout.href);
        setLinkId(data.linkId);
        savePaymentRecovery({
          ticketId: ticket.id,
          linkId: data.linkId,
          savedAt: Date.now(),
        });
      }
    } catch (failure) {
      if (!controller.signal.aborted)
        setError(
          failure instanceof Error
            ? failure.message
            : "Unable to connect to the payment service. Please retry.",
        );
    } finally {
      if (!controller.signal.aborted) setProcessing(false);
    }
  }, [ticket.id, verification]);

  useEffect(() => {
    // Recover the existing provider session before considering a new checkout.
    if (!ready.current) {
      const saved = readPaymentRecovery();
      if (saved?.ticketId === ticket.id) setLinkId(saved.linkId);
      ready.current = true;
    }
    return () => linkRequest.current?.abort();
  }, [ticket.id]);

  useEffect(() => {
    if (!linkId) return;
    const controller = new AbortController();
    let checking = false;
    let completed = false;
    const check = async () => {
      if (checking || completed || controller.signal.aborted) return;
      checking = true;
      try {
        const data = await publicRequest<{
          paid: boolean;
          checkoutUrl?: string;
        }>(
          "/api/payments/status",
          { ticketId: ticket.id, linkId, ...verification },
          controller.signal,
        );
        if (controller.signal.aborted) return;
        if (data.paid) {
          setConfirmed(true);
          setCheckoutUrl(null);
          await onDone();
          completed = true;
          clearPaymentRecovery();
          toast.success("Payment confirmed. Your receipt is ready.");
        } else if (data.checkoutUrl) {
          const checkout = new URL(data.checkoutUrl);
          if (checkout.protocol === "https:") setCheckoutUrl(checkout.href);
        }
        if (!controller.signal.aborted) setError(null);
      } catch (failure) {
        if (!controller.signal.aborted)
          setError(
            failure instanceof Error
              ? failure.message
              : "Unable to check payment status. Retrying automatically.",
          );
      } finally {
        checking = false;
      }
    };
    void check();
    const interval = setInterval(() => void check(), 5000);
    return () => {
      controller.abort();
      clearInterval(interval);
    };
  }, [linkId, ticket.id, verification, onDone, checkVersion]);

  return (
    <section className="mt-6 rounded-2xl border border-border bg-card p-5 text-center shadow-panel sm:p-6">
      <h2 className="font-display text-lg font-bold">
        {confirmed
          ? "Payment confirmed · receipt syncing"
          : linkId
            ? "Waiting for payment confirmation"
            : "Secure online payment"}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        PayMongo · QRPh, GCash, Maya and cards
      </p>
      <div className="mt-5 rounded-xl bg-muted/30 p-6">
        <p className="font-display text-3xl font-bold tabular">
          {peso(ticket.totalFine)}
        </p>
        <p className="mt-1 font-mono text-sm text-muted-foreground">
          {ticket.id}
        </p>
        {error && (
          <p
            role="alert"
            className="mt-4 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive"
          >
            {error}
          </p>
        )}
        {!linkId && (
          <button
            type="button"
            onClick={() => void generateLink()}
            disabled={processing}
            className="mt-5 min-h-12 w-full rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground disabled:opacity-50"
          >
            {processing ? "Preparing checkout…" : "Continue to secure checkout"}
          </button>
        )}
        {checkoutUrl && !confirmed && (
          <a
            href={checkoutUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-5 flex min-h-14 items-center justify-center rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground"
          >
            Open existing payment page
          </a>
        )}
        {linkId && (
          <>
            <p role="status" className="mt-4 text-sm text-muted-foreground">
              {confirmed
                ? "Your payment is confirmed. Please do not pay again while the receipt is retrieved."
                : "Your checkout is saved. Complete payment in the secure tab, then return here. If you close this page, verify the citation again to recover payment status."}
            </p>
            <button
              type="button"
              onClick={() => setCheckVersion((value) => value + 1)}
              className="mt-3 min-h-11 rounded-lg border border-border px-4 text-sm font-semibold"
            >
              Check payment status now
            </button>
          </>
        )}
      </div>
      <p className="mt-4 text-xs text-muted-foreground">
        You may also settle at the Municipal Treasury. Tell the cashier about
        any payment already submitted online so its status can be checked first.
      </p>
      <button
        type="button"
        onClick={onBack}
        className="mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-border text-sm font-semibold"
      >
        <ArrowLeft className="size-4" />
        Back to citation
      </button>
    </section>
  );
}

function Receipt({ ticket, onReset }: { ticket: Ticket; onReset: () => void }) {
  const p = ticket.payment;
  if (!p) return null;
  return (
    <section className="mt-6 animate-fade-in-up rounded-2xl border border-border bg-card p-5 shadow-panel sm:p-6 print:m-0 print:animate-none print:border-0 print:p-0 print:shadow-none">
      <div className="no-print flex items-center gap-2 text-emerald-200">
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
          Municipal Treasury — Payment record copy
        </p>
        <div className="my-3 border-t border-dashed border-border" />
        <dl className="space-y-1.5">
          <Row
            k={
              p.channel === "Cash (Over-the-counter)"
                ? "OR Number"
                : "Provider reference"
            }
            v={p.orNumber}
          />
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

      <p className="mt-4 text-center text-xs text-muted-foreground">
        {p.channel === "Cash (Over-the-counter)"
          ? "Refer to the original Official Receipt issued by Municipal Treasury."
          : "The provider reference identifies the confirmed online payment. Contact Municipal Treasury for Official Receipt assistance."}
      </p>
      <p className="no-print mt-4 text-center text-xs text-muted-foreground">
        Choose “Save as PDF” in the print dialog to download your receipt. You
        can retrieve it later using your secure citation link or verified
        lookup.
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
