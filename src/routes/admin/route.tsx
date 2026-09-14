import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { AdminSidebar } from "@/components/AdminSidebar";
import { AppShell } from "@/components/AppShell";
import { useAuthStore } from "@/store/useAuthStore";

export const Route = createFileRoute("/admin")({
  beforeLoad: () => {
    const auth = useAuthStore.getState();
    if (!auth.user || auth.user.role !== "admin") {
      throw redirect({
        to: "/login",
      });
    }
  },
  component: AdminLayout,
});

function AdminLayout() {
  return (
    <AppShell sidebar={<AdminSidebar />}>
      <Outlet />
    </AppShell>
  );
}
