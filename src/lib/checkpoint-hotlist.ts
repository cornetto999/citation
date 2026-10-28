import type { Ticket } from "@/types";
import { dateTime, peso, shortDate } from "@/lib/format";
import { daysOverdue, isFlaggedToPnp } from "@/lib/overdue";

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

/** A printable snapshot of every active endorsement, independent of list filters. */
export function buildCheckpointHotlistHtml(
  tickets: Ticket[],
  generatedAt = new Date(),
) {
  const flagged = tickets.filter(isFlaggedToPnp);
  const total = flagged.reduce((sum, ticket) => sum + ticket.totalFine, 0);
  const rows = flagged
    .map(
      (ticket) => `<tr>
        <td><strong>${escapeHtml(ticket.plateNo)}</strong><br>${escapeHtml(ticket.vehicleType)}</td>
        <td><strong>${escapeHtml(ticket.id)}</strong><br>${escapeHtml(ticket.violatorName)}<br>License: ${escapeHtml(ticket.licenseNo || "Not recorded")}</td>
        <td>${ticket.violations.map((violation) => escapeHtml(violation.label)).join("<br>")}</td>
        <td>${escapeHtml(shortDate(ticket.dueDate))}<br>${daysOverdue(ticket) > 0 ? `${daysOverdue(ticket)} days late` : "Not past due"}<br>${escapeHtml(peso(ticket.totalFine))}<br>${escapeHtml(ticket.status)}</td>
        <td>${escapeHtml(ticket.endorsedBy || "Not recorded")}<br>${escapeHtml(dateTime(ticket.endorsedAt!))}${ticket.endorsementNote ? `<p class="notes">${escapeHtml(ticket.endorsementNote)}</p>` : ""}</td>
      </tr>`,
    )
    .join("");

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>PNP Checkpoint Hotlist</title>
<style>
  @page { size: A4 landscape; margin: 12mm; }
  body { color: #111827; font: 12px/1.4 system-ui, sans-serif; margin: 24px; }
  h1 { font-size: 24px; margin: 0 0 6px; }
  p { margin: 6px 0; }
  .summary { border: 1px solid #9f1239; background: #fff1f2; padding: 12px; margin: 16px 0; }
  table { border-collapse: collapse; width: 100%; table-layout: fixed; }
  th, td { border: 1px solid #d1d5db; padding: 8px; text-align: left; vertical-align: top; overflow-wrap: anywhere; }
  th { background: #f3f4f6; font-size: 11px; text-transform: uppercase; }
  thead { display: table-header-group; }
  tr { break-inside: avoid; }
  .notes { white-space: pre-wrap; }
  .toolbar { margin-bottom: 20px; }
  button { border: 0; border-radius: 6px; padding: 10px 16px; background: #9f1239; color: white; cursor: pointer; }
  footer { margin-top: 16px; font-size: 11px; }
  @media print { body { margin: 0; } .toolbar { display: none; } }
</style></head><body>
<div class="toolbar"><button id="print-hotlist" type="button">Print hotlist</button></div>
<h1>PNP Checkpoint Hotlist</h1>
<p>Generated ${escapeHtml(dateTime(generatedAt.toISOString()))}</p>
<div class="summary"><strong>${flagged.length} active flagged citation${flagged.length === 1 ? "" : "s"} · ${escapeHtml(peso(total))} outstanding</strong><br>Scope: all active citations flagged to PNP. Search, aging, and overdue-list filters do not limit this hotlist. Paid citations are excluded.</div>
<table><thead><tr><th>Plate / vehicle &amp; color</th><th>Citation / violator</th><th>Recorded violations</th><th>Due / amount / status</th><th>Endorsed by / at / notes</th></tr></thead><tbody>${rows || '<tr><td colspan="5">No active flagged citations.</td></tr>'}</tbody></table>
<footer>Official checkpoint briefing · Verify the current citation and endorsement status before taking action. Direct payments to the Municipal Treasury; PNP personnel do not collect cash.</footer>
</body></html>`;
}

/** Keep the print preview open so the officer can retry or save it as a PDF. */
export function printCheckpointHotlist(
  tickets: Ticket[],
  openedPreview?: Window,
) {
  const preview = openedPreview ?? window.open("", "_blank");
  if (!preview) return false;
  preview.opener = null;
  preview.document.open();
  preview.document.write(buildCheckpointHotlistHtml(tickets));
  preview.document.close();
  const print = () => {
    preview.focus();
    preview.print();
  };
  preview.document
    .getElementById("print-hotlist")
    ?.addEventListener("click", print);
  // Allow the new document to finish layout before opening the print dialog.
  preview.requestAnimationFrame(() => preview.requestAnimationFrame(print));
  return true;
}
