import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuthStore } from "@/store/useAuthStore";

export const Route = createFileRoute("/enforcer")({
  component: EnforcerLayout,
});

function EnforcerLayout() {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();

  useEffect(() => {
    if (!user || user.role !== "enforcer") {
      navigate({ to: "/login" });
    }
  }, [user, navigate]);

  if (!user || user.role !== "enforcer") return null;

  return <Outlet />;
}
