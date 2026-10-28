import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuthStore } from "@/store/useAuthStore";
import { AppShell } from "@/components/AppShell";
import { TreasurySidebar } from "@/components/TreasurySidebar";
import { useDashboardMetrics } from "@/hooks/useDashboardMetrics";
import { peso } from "@/lib/format";

import { ClientOnly } from "@/components/ClientOnly";

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
  return (
    <ClientOnly>
      <ProtectedTreasury />
    </ClientOnly>
  );
}

function ProtectedTreasury() {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const metrics = useDashboardMetrics();

  useEffect(() => {
    if (!user || user.role !== "treasury") {
      navigate({ to: "/login" });
    }
  }, [user, navigate]);

  if (!user || user.role !== "treasury") return null;

  return (
    <AppShell
      title="Municipal Treasury"
      subtitle={
        metrics.error
          ? "Collection summary unavailable"
          : metrics.loading
            ? "Loading municipal collections…"
            : `Municipal collections today: ${peso(metrics.revenueToday)}`
      }
      operator={user.name}
      unit={user.unit}
      accessLabel="Treasury"
      sidebar={<TreasurySidebar />}
    >
      <Outlet />
    </AppShell>
  );
}
