import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuthStore } from "@/store/useAuthStore";
import { ClientOnly } from "@/components/ClientOnly";

export const Route = createFileRoute("/enforcer")({
  component: EnforcerLayout,
});

function EnforcerLayout() {
  return (
    <ClientOnly>
      <ProtectedEnforcer />
    </ClientOnly>
  );
}

function ProtectedEnforcer() {
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
