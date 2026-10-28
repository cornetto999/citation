import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { ReceiptView } from "@/components/ReceiptView";
import { treasuryRequest } from "@/lib/treasury-client";
import type { Ticket } from "@/types";

export const Route = createFileRoute("/treasury/receipts")({
  head: () => ({ meta: [{ title: "Payment Receipt | Municipal Treasury" }] }),
  validateSearch: (
    search: Record<string, unknown>,
  ): { ticket?: string | undefined } => ({
    ticket: typeof search["ticket"] === "string" ? search["ticket"] : undefined,
  }),
  component: TreasuryReceiptsPage,
});

function TreasuryReceiptsPage() {
  const { ticket } = Route.useSearch();
  const details = useQuery({
    queryKey: ["treasury", "ticket", ticket],
    queryFn: ({ signal }) =>
      treasuryRequest<{ ticket: Ticket }>(
        `tickets/${encodeURIComponent(ticket!)}`,
        { signal },
      ),
    enabled: Boolean(ticket),
  });
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Link
        to="/treasury/transactions"
        className="inline-flex min-h-10 items-center gap-2 text-sm font-semibold text-foreground hover:underline"
      >
        <ArrowLeft className="size-4" /> All transactions
      </Link>
      {!ticket ? (
        <div className="rounded-xl border border-border bg-card p-8 text-center text-sm">
          Select a payment from Transactions to view its receipt.
        </div>
      ) : details.isLoading ? (
        <p role="status" className="p-12 text-center text-muted-foreground">
          Loading payment record…
        </p>
      ) : details.isError ? (
        <div
          role="alert"
          className="rounded-xl border border-destructive/30 p-5"
        >
          <p>{details.error.message}</p>
          <button
            onClick={() => void details.refetch()}
            className="mt-3 font-bold text-foreground"
          >
            Retry
          </button>
        </div>
      ) : details.data ? (
        <ReceiptView ticket={details.data.ticket} />
      ) : null}
    </div>
  );
}
