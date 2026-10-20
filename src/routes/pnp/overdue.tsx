import { createFileRoute } from "@tanstack/react-router";
import { useAuthStore } from "@/store/useAuthStore";
import { OverdueBoard } from "@/components/OverdueBoard";

export const Route = createFileRoute("/pnp/overdue")({
  head: () => ({
    meta: [
      { title: "Overdue Citations | PNP Command View" },
      {
        name: "description",
        content:
          "Overdue traffic citations, including cases endorsed by the LGU and Treasury for police enforcement.",
      },
    ],
  }),
  component: PnpOverduePage,
});

function PnpOverduePage() {
  const user = useAuthStore((s) => s.user);
  if (!user || user.role !== "pnp") return null;
  return <OverdueBoard role="pnp" />;
}
