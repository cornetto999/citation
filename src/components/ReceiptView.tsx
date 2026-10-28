import { Printer, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { peso } from "@/lib/format";
import { printReceipt, receiptDate } from "@/lib/receipt";
import type { Ticket } from "@/types";

export function ReceiptView({ ticket }: { ticket: Ticket }) {
  const payment = ticket.payment;
  if (!payment || ticket.status !== "Paid") {
    return (
      <p className="rounded-xl border border-border bg-muted/30 p-5 text-sm">
        No posted payment is available for this citation. Check the payment
        exception queue if this citation is marked paid.
      </p>
    );
  }
  const isCash = payment.channel === "Cash (Over-the-counter)";
  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-panel sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-5">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-foreground">
            Municipal Treasury · Gitagum
          </p>
          <h2 className="mt-2 text-2xl font-bold">Payment record</h2>
          <p className="mt-1 font-mono text-sm">
            {isCash ? "OR" : "Provider reference"} {payment.orNumber}
          </p>
        </div>
        <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-sm font-semibold text-emerald-700">
          <CheckCircle2 className="size-4" /> Posted
        </span>
      </div>
      <dl className="my-6 grid gap-4 text-sm sm:grid-cols-2">
        {[
          ["Citation", ticket.id],
          ["Paid by", ticket.violatorName],
          ["Plate / vehicle", `${ticket.plateNo} · ${ticket.vehicleType}`],
          ["Posted (Philippine time)", receiptDate(payment.paidAt)],
          ["Channel", payment.channel],
          ["Received by", payment.receivedBy],
          ["Payment reference", payment.id],
        ].map(([label, value]) => (
          <div key={label}>
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="mt-1 break-words font-semibold">{value}</dd>
          </div>
        ))}
      </dl>
      <div className="divide-y divide-border rounded-xl border border-border">
        {ticket.violations.map((v) => (
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
            <span className="shrink-0 tabular">{peso(v.fine)}</span>
          </div>
        ))}
        <div className="flex items-center justify-between gap-4 bg-primary/5 p-4 font-bold">
          <span>Amount received</span>
          <span className="text-2xl text-foreground">
            {peso(payment.amount)}
          </span>
        </div>
      </div>
      <p className="mt-5 text-xs leading-relaxed text-muted-foreground">
        This is a copy of the existing payment record.{" "}
        {isCash
          ? "Refer to the original Official Receipt issued by Municipal Treasury."
          : "The provider reference identifies the confirmed online payment. Contact Municipal Treasury for Official Receipt assistance."}{" "}
        Reprinting keeps the original payment date and reference.
      </p>
      <button
        type="button"
        onClick={() => {
          if (!printReceipt(ticket))
            toast.error("Allow pop-ups to open the receipt print preview.");
        }}
        className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground"
      >
        <Printer className="size-4" /> Print / Save PDF
      </button>
    </section>
  );
}
