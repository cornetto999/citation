import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import {
  Search,
  ShieldCheck,
  QrCode,
  CheckCircle2,
  Download,
  ArrowLeft,
  AlertTriangle,
} from "lucide-react";
import { useTicketStore } from "@/store/useTicketStore";
import { StatusBadge } from "@/components/StatusBadge";
import { peso, dateTime, shortDate, daysUntil } from "@/lib/format";
import type { Ticket } from "@/types";

export const Route = createFileRoute("/portal")({
  head: () => ({
    meta: [
      { title: "Violator Portal | Citation Ticket & Payment System" },
      {
        name: "description",
        content:
          "Look up your traffic citation ticket by ID, pay securely online via QRPh, and download your official e-receipt.",
      },
      {
        property: "og:title",
        content: "Violator Portal — Pay Your Citation Online",
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
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [stage, setStage] = useState<Stage>("lookup");

  const search = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!query.trim()) return;
    const found = getTicket(query);
    setTicket(found ?? null);
    setNotFound(!found);
    setStage("lookup");
  };

  const reset = () => {
    setTicket(null);
    setNotFound(false);
    setQuery("");
    setStage("lookup");
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-authority text-primary-foreground">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-4 sm:px-6">
          <Link
            to="/"
            className="flex size-9 shrink-0 items-center justify-center rounded-md bg-sidebar-accent/60 transition-colors hover:bg-sidebar-accent"
            aria-label="Back to role selection"
          >
            <ShieldCheck className="size-5 text-sidebar-primary" />
          </Link>
          <div>
            <p className="font-display text-base font-semibold leading-tight">
              Violator Portal
            </p>
            <p className="text-xs text-primary-foreground/70">
              Public access — look up and settle your citation
            </p>
          </div>
          <span className="ml-auto rounded-full border border-sidebar-border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-widest text-sidebar-primary">
            Public
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        {/* Lookup */}
        <form
          onSubmit={search}
          className="rounded-xl border border-border bg-surface p-5 shadow-lift"
        >
          <label
            htmlFor="ticket-id"
            className="text-sm font-semibold text-card-foreground"
          >
            Citation Ticket Number
          </label>
          <p className="mt-1 text-xs text-muted-foreground">
            Found on the top of your printed citation (e.g. CTN-2026-0001).
          </p>
          <div className="mt-3 flex gap-2">
            <input
              id="ticket-id"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="CTN-2026-0000"
              className="h-12 min-w-0 flex-1 rounded-lg border border-input bg-background px-4 font-mono text-sm uppercase tracking-wide text-foreground outline-none ring-ring focus:ring-2"
            />
            <button
              type="submit"
              className="flex h-12 items-center gap-2 rounded-lg bg-authority px-5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
            >
              <Search className="size-4" />
              Look up
            </button>
          </div>
          {notFound && (
            <p className="mt-3 flex items-center gap-2 text-sm font-medium text-overdue">
              <AlertTriangle className="size-4" />
              No citation found with that number. Check the ticket and try
              again.
            </p>
          )}
        </form>

        {ticket && stage === "lookup" && (
          <TicketCard ticket={ticket} onPay={() => setStage("pay")} />
        )}
        {ticket && stage === "pay" && (
          <QrphPayment
            ticket={ticket}
            onBack={() => setStage("lookup")}
            onDone={() => {
              setTicket(
                useTicketStore.getState().getTicket(ticket.id) ?? ticket,
              );
              setStage("receipt");
            }}
          />
        )}
        {ticket && stage === "receipt" && (
          <Receipt ticket={ticket} onReset={reset} />
        )}
      </main>
    </div>
  );
}

function TicketCard({ ticket, onPay }: { ticket: Ticket; onPay: () => void }) {
  const days = daysUntil(ticket.dueDate);
  return (
    <section className="mt-6 rounded-xl border border-border bg-surface p-5 shadow-lift">
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

      <div className="mt-5 rounded-lg bg-muted p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Violations
        </p>
        <ul className="mt-2 space-y-1.5">
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
              <span className="tabular font-medium">{peso(v.fine)}</span>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
          <span className="text-sm font-semibold text-card-foreground">
            Total fine
          </span>
          <span className="font-display text-xl font-bold tabular text-card-foreground">
            {peso(ticket.totalFine)}
          </span>
        </div>
      </div>

      {ticket.status === "Paid" ? (
        <p className="mt-4 flex items-center gap-2 rounded-lg bg-paid/15 px-4 py-3 text-sm font-medium text-paid">
          <CheckCircle2 className="size-4" />
          This citation has been settled. OR {ticket.payment?.orNumber}.
        </p>
      ) : ticket.status === "Contested" ? (
        <p className="mt-4 flex items-center gap-2 rounded-lg bg-contested/15 px-4 py-3 text-sm font-medium text-contested">
          <AlertTriangle className="size-4" />
          This citation is under contest. Please appear at the Traffic
          Management Office.
        </p>
      ) : (
        <button
          onClick={onPay}
          className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-authority text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
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
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">
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
  const payTicket = useTicketStore((s) => s.payTicket);
  const [processing, setProcessing] = useState(false);

  const confirm = () => {
    setProcessing(true);
    setTimeout(async () => {
      try {
        await payTicket(ticket.id, "QRPh", "QRPh Online Settlement");
        onDone();
      } catch (e) {
        console.error(e);
        setProcessing(false);
      }
    }, 1500);
  };

  return (
    <section className="mt-6 rounded-xl border border-border bg-surface p-5 text-center shadow-lift">
      <h2 className="font-display text-lg font-semibold text-card-foreground">
        Scan to pay with QRPh
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Open any participating banking or e-wallet app and scan the code.
      </p>

      <div className="mx-auto mt-5 grid size-52 grid-cols-7 gap-0 overflow-hidden rounded-lg border border-border p-3">
        {Array.from({ length: 49 }).map((_, i) => (
          <span
            key={i}
            className={
              (i * 7 + ((i * 13) % 5) + ticket.id.length) % 3 === 0
                ? "bg-authority"
                : "bg-transparent"
            }
          />
        ))}
      </div>

      <p className="mt-4 font-display text-2xl font-bold tabular text-card-foreground">
        {peso(ticket.totalFine)}
      </p>
      <p className="font-mono text-xs text-muted-foreground">{ticket.id}</p>

      <div className="mt-5 flex gap-2">
        <button
          onClick={onBack}
          disabled={processing}
          className="flex h-12 flex-1 items-center justify-center gap-2 rounded-lg border border-border text-sm font-semibold text-card-foreground transition-colors hover:bg-muted disabled:opacity-50"
        >
          <ArrowLeft className="size-4" />
          Back
        </button>
        <button
          onClick={confirm}
          disabled={processing}
          className="h-12 flex-[2] rounded-lg bg-authority text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {processing
            ? "Verifying payment…"
            : "I've scanned — simulate payment"}
        </button>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Demo only — no real payment is processed.
      </p>
    </section>
  );
}

function Receipt({ ticket, onReset }: { ticket: Ticket; onReset: () => void }) {
  const p = ticket.payment;
  if (!p) return null;
  return (
    <section className="mt-6 rounded-xl border border-border bg-surface p-5 shadow-lift">
      <div className="flex items-center gap-2 text-paid">
        <CheckCircle2 className="size-6" />
        <h2 className="font-display text-lg font-semibold">
          Payment successful
        </h2>
      </div>

      <div className="mt-4 rounded-lg border border-dashed border-border bg-muted/50 p-5 font-mono text-sm text-card-foreground">
        <p className="text-center text-xs uppercase tracking-widest text-muted-foreground">
          Republic of the Philippines
        </p>
        <p className="text-center text-xs uppercase tracking-widest text-muted-foreground">
          Municipal Treasury — Official e-Receipt
        </p>
        <div className="my-3 border-t border-dashed border-border" />
        <dl className="space-y-1.5">
          <Row k="OR Number" v={p.orNumber} />
          <Row k="Citation" v={ticket.id} />
          <Row k="Paid by" v={ticket.violatorName} />
          <Row k="Plate No." v={ticket.plateNo} />
          <Row k="Channel" v={p.channel} />
          <Row k="Date paid" v={dateTime(p.paidAt)} />
          <Row k="Received by" v={p.receivedBy} />
        </dl>
        <div className="my-3 border-t border-dashed border-border" />
        <div className="flex items-center justify-between">
          <span className="font-semibold">AMOUNT PAID</span>
          <span className="font-display text-xl font-bold tabular">
            {peso(p.amount)}
          </span>
        </div>
      </div>

      <div className="mt-4 flex gap-2">
        <button
          onClick={() => window.print()}
          className="flex h-12 flex-1 items-center justify-center gap-2 rounded-lg bg-authority text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
        >
          <Download className="size-4" />
          Download / print e-receipt
        </button>
        <button
          onClick={onReset}
          className="h-12 rounded-lg border border-border px-5 text-sm font-semibold text-card-foreground transition-colors hover:bg-muted"
        >
          New lookup
        </button>
      </div>
    </section>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="text-right font-medium">{v}</dd>
    </div>
  );
}
