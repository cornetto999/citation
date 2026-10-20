import { createFileRoute } from "@tanstack/react-router";
import { useAuthStore } from "@/store/useAuthStore";
import { OverdueBoard } from "@/components/OverdueBoard";

export const Route = createFileRoute("/treasury/overdue")({
  head: () => ({
    meta: [
      { title: "Overdue Citations | Municipal Treasury" },
      {
        name: "description",
        content:
          "Overdue traffic citations awaiting collection, with one-click cashier hand-off and PNP endorsement.",
      },
    ],
  }),
  component: TreasuryOverduePage,
});

function TreasuryOverduePage() {
  const user = useAuthStore((s) => s.user);
  if (!user || user.role !== "treasury") return null;
  return <OverdueBoard role="treasury" />;
}
