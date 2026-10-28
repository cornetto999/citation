import { useQuery } from "@tanstack/react-query";
import { ShieldAlert, FileText, Clock3 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { StatusBadge } from "@/components/StatusBadge";
import { ListSkeleton } from "@/components/kit";
import { WorkflowFeedback } from "@/components/WorkflowFeedback";
import { workflowRequest } from "@/lib/workflow-client";
import { peso, shortDate } from "@/lib/format";
import type { Ticket, WorkflowEvent } from "@/types";

export function WorkflowTimeline({ events }: { events: WorkflowEvent[] }) {
  return events.length ? (
    <ol className="space-y-4 border-l-2 border-border pl-4">
      {events.map((event) => (
        <li key={event.id} className="relative text-sm">
          <span className="absolute -left-[22px] top-1.5 size-2.5 rounded-full bg-primary" />
          <p className="font-semibold capitalize">
            {event.action.replace(/[_.]/g, " ")}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {event.actorName || "System"} ·{" "}
            {new Date(event.createdAt).toLocaleString("en-PH", {
              timeZone: "Asia/Manila",
              dateStyle: "medium",
              timeStyle: "short",
            })}
          </p>
          {event.reason && (
            <p className="mt-1 whitespace-pre-wrap break-words text-muted-foreground">
              {event.reason}
            </p>
          )}
        </li>
      ))}
    </ol>
  ) : (
    <p className="text-sm text-muted-foreground">
      No recorded activity is available for this citation.
    </p>
  );
}

export function TicketDetailsDialog({
  ticketId,
  onClose,
}: {
  ticketId: string | null;
  onClose: () => void;
}) {
  const result = useQuery({
    queryKey: ["workflow", "ticket", ticketId],
    queryFn: ({ signal }) =>
      workflowRequest<{ ticket: Ticket; events: WorkflowEvent[] }>(
        `/api/workflow/tickets/${encodeURIComponent(ticketId!)}`,
        { signal },
      ),
    enabled: !!ticketId,
    staleTime: 0,
  });
  const ticket = result.data?.ticket;
  return (
    <Dialog
      open={!!ticketId}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-h-[90dvh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="size-5" />
            Citation details
          </DialogTitle>
          <DialogDescription className="break-all font-mono">
            {ticketId}
          </DialogDescription>
        </DialogHeader>
        <WorkflowFeedback
          error={result.error}
          loading={result.isFetching}
          updatedAt={result.dataUpdatedAt}
          onRetry={() => void result.refetch()}
        />
        {result.isPending ? (
          <ListSkeleton rows={5} />
        ) : ticket ? (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={ticket.status} />
              {ticket.endorsedAt && ticket.status !== "Paid" && (
                <span className="flex items-center gap-1.5 rounded-full bg-rose-100 px-3 py-1 text-xs font-bold text-rose-700">
                  <ShieldAlert className="size-3.5" />
                  Flagged to PNP
                </span>
              )}
            </div>
            <dl className="grid gap-4 text-sm sm:grid-cols-2">
              {[
                ["Plate", ticket.plateNo],
                ["Violator", ticket.violatorName],
                ["License", ticket.licenseNo],
                ["Vehicle", ticket.vehicleType],
                ["Issued by", ticket.issuedBy],
                ["Issued", shortDate(ticket.issuedAt)],
                ["Due", shortDate(ticket.dueDate)],
                ["Location", ticket.location],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs text-muted-foreground">{label}</dt>
                  <dd className="mt-1 break-words font-medium">
                    {value || "Not recorded"}
                  </dd>
                </div>
              ))}
            </dl>
            <div className="space-y-3 rounded-xl border border-border bg-muted/30 p-4">
              <h3 className="text-sm font-semibold">Violations and fine</h3>
              {ticket.violations.map((violation) => (
                <div
                  key={violation.code}
                  className="flex items-start justify-between gap-4 text-sm"
                >
                  <span>
                    {violation.label}{" "}
                    <span className="font-mono text-xs text-muted-foreground">
                      ({violation.code})
                    </span>
                  </span>
                  <span className="shrink-0 tabular-nums">
                    {peso(violation.fine)}
                  </span>
                </div>
              ))}
              <div className="flex items-center justify-between border-t border-border pt-3 font-bold">
                <span>Total fine</span>
                <span>{peso(ticket.totalFine)}</span>
              </div>
            </div>
            {ticket.payment ? (
              <section className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 text-sm text-emerald-950">
                <h3 className="font-semibold">Recorded payment</h3>
                <p className="mt-2">
                  Receipt {ticket.payment.orNumber} ·{" "}
                  {peso(ticket.payment.amount)}
                </p>
                <p className="mt-1">
                  {ticket.payment.channel} · {shortDate(ticket.payment.paidAt)}
                </p>
                <p className="mt-1 text-xs">
                  Received by {ticket.payment.receivedBy}
                </p>
              </section>
            ) : (
              <p className="rounded-xl bg-muted p-4 text-sm text-muted-foreground">
                Payment collection and official receipt issuance are handled by
                Municipal Treasury. Quote citation <strong>{ticket.id}</strong>{" "}
                when referring this record.
              </p>
            )}
            {ticket.endorsedAt && (
              <section className="text-sm">
                <h3 className="font-semibold">Police endorsement</h3>
                <p className="mt-1 text-muted-foreground">
                  {ticket.endorsedBy} · {shortDate(ticket.endorsedAt)}
                </p>
                <p className="mt-2 whitespace-pre-wrap break-words">
                  {ticket.endorsementNote || "No endorsement note recorded."}
                </p>
                {ticket.status === "Paid" && (
                  <p className="mt-2 font-medium text-emerald-200">
                    Cleared from the active hotlist after payment.
                  </p>
                )}
              </section>
            )}
            {ticket.remarks && (
              <section className="text-sm">
                <h3 className="font-semibold">Remarks</h3>
                <p className="mt-1 whitespace-pre-wrap break-words text-muted-foreground">
                  {ticket.remarks}
                </p>
              </section>
            )}
            {ticket.photoData && (
              <details className="rounded-xl border border-border p-4">
                <summary className="cursor-pointer text-sm font-semibold">
                  View evidence photo
                </summary>
                <img
                  src={ticket.photoData}
                  alt={`Evidence for citation ${ticket.id}`}
                  className="mt-3 max-h-80 w-full rounded-lg object-contain"
                  loading="lazy"
                />
              </details>
            )}
            <section className="border-t border-border pt-5">
              <h3 className="mb-4 flex items-center gap-2 font-semibold">
                <Clock3 className="size-4" />
                Activity timeline
              </h3>
              <WorkflowTimeline events={result.data?.events || []} />
            </section>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
