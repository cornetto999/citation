import { createFileRoute } from "@tanstack/react-router";
import { TreasuryLedger } from "@/components/TreasuryLedger";

export const Route = createFileRoute("/treasury/transactions")({
  head: () => ({ meta: [{ title: "Transactions | Municipal Treasury" }] }),
  validateSearch: (
    search: Record<string, unknown>,
  ): { exceptions?: boolean | undefined } => ({
    exceptions:
      search["exceptions"] === true || search["exceptions"] === "true"
        ? true
        : undefined,
  }),
  component: TreasuryTransactionsPage,
});

function TreasuryTransactionsPage() {
  const { exceptions } = Route.useSearch();
  return (
    <TreasuryLedger
      key={String(exceptions)}
      exceptionsInitially={Boolean(exceptions)}
    />
  );
}
