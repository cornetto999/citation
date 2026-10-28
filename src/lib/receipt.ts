import type { Ticket } from "@/types";
import { peso } from "@/lib/format";

const escapeHtml = (value: string | number) =>
  String(value).replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character] ?? character;
  });

export function receiptDate(value: string) {
  return new Date(value).toLocaleString("en-PH", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Render an existing payment only. Reprinting never posts or renumbers payments. */
export function buildReceiptHtml(ticket: Ticket) {
  const payment = ticket.payment;
  if (!payment || ticket.status !== "Paid") {
    throw new Error("A posted payment is required to print a payment record.");
  }
  const referenceLabel =
    payment.channel === "Cash (Over-the-counter)" ? "OR" : "Provider reference";
  const referenceNote =
    payment.channel === "Cash (Over-the-counter)"
      ? "Refer to the original Official Receipt issued by Municipal Treasury."
      : "The provider reference identifies the confirmed online payment. Contact Municipal Treasury for Official Receipt assistance.";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>Payment record ${escapeHtml(payment.orNumber)}</title>
<style>
@page { size:A4; margin:20mm; }
body{font:14px/1.5 system-ui,sans-serif;color:#111827;max-width:680px;margin:32px auto;padding:20px}
h1{font-size:25px;margin:0}h2{font-size:18px;margin:4px 0}.muted{color:#4b5563}.header{border-bottom:3px solid #6d28d9;padding-bottom:18px}
dl{display:grid;grid-template-columns:160px 1fr;gap:8px;margin:24px 0}dt{color:#4b5563}dd{margin:0;overflow-wrap:anywhere}
table{border-collapse:collapse;width:100%}th,td{padding:12px 8px;border-bottom:1px solid #d1d5db;text-align:left}.amount{text-align:right;white-space:nowrap}
.total{font-size:20px;font-weight:bold}.foot{margin-top:28px;font-size:12px}.toolbar{margin-bottom:24px}button{padding:12px 18px;border:0;border-radius:8px;background:#6d28d9;color:white;cursor:pointer}
@media print{body{margin:0;padding:0;max-width:none}.toolbar{display:none}tr{break-inside:avoid}}
</style></head><body><div class="toolbar"><button id="print-receipt" type="button">Print / Save PDF</button></div>
<div class="header"><p class="muted">MUNICIPAL TREASURY · GITAGUM</p><h1>Payment record copy</h1><h2>${referenceLabel} ${escapeHtml(payment.orNumber)}</h2></div>
<dl><dt>Citation number</dt><dd>${escapeHtml(ticket.id)}</dd><dt>Paid by</dt><dd>${escapeHtml(ticket.violatorName)}</dd><dt>Plate / vehicle</dt><dd>${escapeHtml(ticket.plateNo)} · ${escapeHtml(ticket.vehicleType)}</dd><dt>Payment posted</dt><dd>${escapeHtml(receiptDate(payment.paidAt))} (Philippine time)</dd><dt>Payment channel</dt><dd>${escapeHtml(payment.channel)}</dd><dt>Received by</dt><dd>${escapeHtml(payment.receivedBy)}</dd><dt>Payment reference</dt><dd>${escapeHtml(payment.id)}</dd></dl>
<table><thead><tr><th>Recorded violation</th><th class="amount">Fine</th></tr></thead><tbody>
${ticket.violations.map((v) => `<tr><td>${escapeHtml(v.code)} · ${escapeHtml(v.label)}</td><td class="amount">${escapeHtml(peso(v.fine))}</td></tr>`).join("")}
<tr class="total"><td>Amount received</td><td class="amount">${escapeHtml(peso(payment.amount))}</td></tr></tbody></table>
<p class="foot">Copy of the existing payment record. ${referenceNote} Reprinting does not create a new payment or Official Receipt number.</p></body></html>`;
}

export function printReceipt(ticket: Ticket) {
  const html = buildReceiptHtml(ticket);
  const preview = window.open("", "_blank");
  if (!preview) return false;
  preview.opener = null;
  preview.document.open();
  preview.document.write(html);
  preview.document.close();
  const print = () => {
    preview.focus();
    preview.print();
  };
  preview.document
    .getElementById("print-receipt")
    ?.addEventListener("click", print);
  preview.requestAnimationFrame(() => preview.requestAnimationFrame(print));
  return true;
}
