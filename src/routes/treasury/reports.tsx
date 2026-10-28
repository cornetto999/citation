import { createFileRoute } from "@tanstack/react-router";
import { TreasuryLedger } from "@/components/TreasuryLedger";

export const Route = createFileRoute("/treasury/reports")({
  head: () => ({
    meta: [{ title: "Collection Reports | Municipal Treasury" }],
  }),
  component: TreasuryReportsPage,
});

function TreasuryReportsPage() {
  return <TreasuryLedger report />;
}
