import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuthStore } from "@/store/useAuthStore";
import { AppShell } from "@/components/AppShell";
import { PnpSidebar } from "@/components/PnpSidebar";
import { ClientOnly } from "@/components/ClientOnly";

export const Route = createFileRoute("/pnp")({
  head: () => ({
    meta: [
      { title: "Citation Monitoring | PNP Command View" },
      {
        name: "description",
        content:
          "Read-only police monitoring of all traffic citations with status filters, due-date tracking, and collection totals.",
      },
      {
        property: "og:title",
        content: "Citation Monitoring | PNP Command View",
      },
      {
        property: "og:description",
        content: "Monitor every issued citation, its status, and its due date.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PnpLayout,
});

function PnpLayout() {
  return (
    <ClientOnly>
      <ProtectedPnp />
    </ClientOnly>
  );
}

function ProtectedPnp() {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();

  useEffect(() => {
    if (!user || user.role !== "pnp") {
      navigate({ to: "/login" });
    }
  }, [user, navigate]);

  if (!user || user.role !== "pnp") return null;

  return (
    <AppShell
      title="Citation Monitoring"
      subtitle="Read-only command view · live feed from field units"
      operator={user.name}
      unit={user.unit}
      accessLabel="PNP"
      sidebar={<PnpSidebar />}
    >
      <Outlet />
    </AppShell>
  );
}
