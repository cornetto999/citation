import { createFileRoute, Outlet } from "@tanstack/react-router";
import { useAuthStore } from "@/store/useAuthStore";
import { AppShell } from "@/components/AppShell";
import { PnpSidebar } from "@/components/PnpSidebar";
import { RequireRole } from "@/components/RequireRole";

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
    <RequireRole role="pnp">
      <ProtectedPnp />
    </RequireRole>
  );
}

function ProtectedPnp() {
  const user = useAuthStore((s) => s.user);

  if (!user || user.role !== "pnp") return null;

  return (
    <AppShell
      title="Citation Monitoring"
      subtitle="Read-only citation and endorsement monitoring"
      operator={user.name}
      unit={user.unit}
      accessLabel="PNP"
      sidebar={<PnpSidebar />}
    >
      <Outlet />
    </AppShell>
  );
}
