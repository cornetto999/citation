import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { AdminAppShell } from "@/components/AdminAppShell";
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
    <AdminAppShell>
      <Outlet />
    </AdminAppShell>
  );
}
