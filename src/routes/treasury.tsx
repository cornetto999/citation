import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuthStore } from "@/store/useAuthStore";
import { AppShell } from "@/components/AppShell";
import { TreasurySidebar } from "@/components/TreasurySidebar";
import { useTicketStore } from "@/store/useTicketStore";
import { peso } from "@/lib/format";

export const Route = createFileRoute("/treasury")({
  head: () => ({
    meta: [
      { title: "Cashier Window | Municipal Treasury" },
      {
        name: "description",
        content:
          "Treasury point-of-sale for traffic citations: search a ticket, tender cash, compute change, and issue the official receipt.",
      },
      { property: "og:title", content: "Cashier Window | Municipal Treasury" },
      {
        property: "og:description",
        content:
          "Settle traffic citations over the counter and post payments instantly.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: TreasuryLayout,
});

function TreasuryLayout() {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const tickets = useTicketStore((s) => s.tickets);

  useEffect(() => {
    if (!user || user.role !== "treasury") {
      navigate({ to: "/login" });
    }
  }, [user, navigate]);

  const collectedToday = tickets
    .filter(
      (t) =>
        t.status === "Paid" &&
        t.payment &&
        new Date(t.payment.paidAt).toDateString() === new Date().toDateString(),
    )
    .reduce((s, t) => s + t.payment!.amount, 0);

  if (!user || user.role !== "treasury") return null;

  return (
    <AppShell
      title="Cashier Window 3"
      subtitle={`Shift collection today: ${peso(collectedToday)}`}
      operator={user.name}
      unit={user.unit}
      accessLabel="Treasury"
      sidebar={<TreasurySidebar />}
    >
      <Outlet />
    </AppShell>
  );
}
