import type { Ticket } from "@/types";

const escapeHtml = (value: string | number) =>
  String(value).replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ]!,
  );
const formatDate = (value: string) =>
  new Date(value).toLocaleString("en-PH", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
const formatAmount = (value: number) =>
  new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(
    value,
  );

export function citationPortalUrl(ticket: Ticket, origin: string) {
  const url = new URL("/portal", origin);
  url.searchParams.set("ticket", ticket.id);
  if (ticket.accessToken) url.searchParams.set("access", ticket.accessToken);
  return url.href;
}

export function buildCitationSlipHtml(
  ticket: Ticket,
  portalUrl: string,
  qrSvg = "",
) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="referrer" content="no-referrer"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Citation ${escapeHtml(ticket.id)}</title>
  <style>@page{size:A5;margin:12mm}*{box-sizing:border-box}body{max-width:620px;margin:28px auto;color:#111827;font:14px/1.5 system-ui,sans-serif;padding:0 20px}h1{font-size:25px;margin:4px 0}h2{font-size:16px;margin:20px 0 8px}.muted{color:#4b5563;font-size:12px}header{text-align:center;border-bottom:2px solid #111827;padding-bottom:16px}dl{display:grid;grid-template-columns:105px 1fr;gap:6px 16px}dt{color:#4b5563}dd{margin:0;overflow-wrap:anywhere}table{width:100%;border-collapse:collapse}td,th{text-align:left;padding:8px 0;border-bottom:1px solid #d1d5db}td:last-child,th:last-child{text-align:right;white-space:nowrap}.total{font-size:18px;font-weight:700}.payment{border:1px solid #d1d5db;border-radius:8px;padding:14px;margin:18px 0}.qr{text-align:center}.qr svg{width:180px;height:180px}.url{overflow-wrap:anywhere;font-size:10px}.toolbar button{padding:12px 20px;background:#174b3a;color:white;border:0;border-radius:8px;cursor:pointer}.toolbar{margin-bottom:20px}@media print{body{margin:0;padding:0}.toolbar{display:none}}</style></head><body>
  <div class="toolbar"><button id="print-citation" type="button">Print / save PDF</button></div>
  <header><div class="muted">Republic of the Philippines · Municipality of Gitagum</div><h1>Traffic Citation</h1><strong>${escapeHtml(ticket.id)}</strong><div class="muted">Citation slip · Not a payment receipt</div></header>
  <dl><dt>Plate</dt><dd><strong>${escapeHtml(ticket.plateNo)}</strong></dd><dt>Vehicle</dt><dd>${escapeHtml(ticket.vehicleType)}</dd><dt>Driver</dt><dd>${escapeHtml(ticket.violatorName)}</dd><dt>License</dt><dd>${escapeHtml(ticket.licenseNo)}</dd><dt>Location</dt><dd>${escapeHtml(ticket.location || "Not recorded")}</dd><dt>Issued</dt><dd>${escapeHtml(formatDate(ticket.issuedAt))}</dd><dt>Officer</dt><dd>${escapeHtml(ticket.issuedBy)}</dd></dl>
  <h2>Recorded violations</h2><table><thead><tr><th>Violation</th><th>Fine</th></tr></thead><tbody>${ticket.violations.map((violation) => `<tr><td>${escapeHtml(violation.code)} · ${escapeHtml(violation.label)}</td><td>${escapeHtml(formatAmount(violation.fine))}</td></tr>`).join("")}<tr class="total"><td>Total fine</td><td>${escapeHtml(formatAmount(ticket.totalFine))}</td></tr></tbody></table>
  <div class="payment"><strong>Due ${escapeHtml(formatDate(ticket.dueDate))}</strong><p>Settle at the Municipal Treasury or use the secure online payment portal. Keep this slip and request your official receipt after payment.</p><p class="muted">For payment or citation assistance, bring this slip to the Municipal Treasury or Traffic Management Office. Enforcers and PNP officers do not collect cash.</p></div>
  ${qrSvg ? `<div class="qr">${qrSvg}<p>Scan to view this citation and payment status.</p></div>` : ""}
  <p class="url"><a rel="noreferrer" href="${escapeHtml(portalUrl)}">${escapeHtml(portalUrl)}</a></p>
  <p class="muted">${ticket.accessToken ? "Keep this slip private. Its secure link grants access to this citation." : "Enter the exact license number recorded on the citation to verify access. If no license was recorded, ask Treasury for assistance."}</p>
  </body></html>`;
}

/** QR rendering is entirely local. Secure citation links never leave this application. */
export async function prepareCitationSlip(ticket: Ticket, origin: string) {
  const url = citationPortalUrl(ticket, origin);
  const { default: qrcode } = await import("qrcode-generator");
  const qr = qrcode(0, "M");
  qr.addData(url);
  qr.make();
  return buildCitationSlipHtml(
    ticket,
    url,
    qr.createSvgTag({ cellSize: 4, margin: 16 }),
  );
}

export function showCitationSlip(preview: Window, html: string) {
  preview.opener = null;
  preview.document.open();
  preview.document.write(html);
  preview.document.close();
  const print = () => {
    preview.focus();
    preview.print();
  };
  preview.document
    .getElementById("print-citation")
    ?.addEventListener("click", print);
  preview.requestAnimationFrame(() => preview.requestAnimationFrame(print));
}
