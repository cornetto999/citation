import { createFileRoute, Outlet } from "@tanstack/react-router";
import { RequireRole } from "@/components/RequireRole";

export const Route = createFileRoute("/enforcer")({
  component: EnforcerLayout,
});

function EnforcerLayout() {
  return (
    <RequireRole role="enforcer">
      <Outlet />
    </RequireRole>
  );
}
