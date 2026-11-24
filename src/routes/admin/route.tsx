import { createFileRoute, Outlet } from "@tanstack/react-router";
import { AdminSidebar } from "@/components/AdminSidebar";
import { AppShell } from "@/components/AppShell";
import { useAuthStore } from "@/store/useAuthStore";
import { RequireRole } from "@/components/RequireRole";

export const Route = createFileRoute("/admin")({
  component: AdminLayout,
});

function AdminLayout() {
  return (
    <RequireRole role="admin">
      <AdminDashboard />
    </RequireRole>
  );
}

function AdminDashboard() {
  const { user } = useAuthStore();
  return (
    <AppShell
      title="Admin Portal"
      subtitle="System Administration"
      operator={user?.name || "Administrator"}
      unit={user?.unit || "LGU"}
      accessLabel="ADMIN ACCESS"
      sidebar={<AdminSidebar />}
    >
      <Outlet />
    </AppShell>
  );
}
