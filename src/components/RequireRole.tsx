import { Navigate } from "@tanstack/react-router";
import { Loader2, RefreshCw } from "lucide-react";
import type { ReactNode } from "react";
import { useAuthStore } from "@/store/useAuthStore";
import type { Role } from "@/types";

/** Hold every staff dashboard until the server has restored its cookie session. */
export function RequireRole({
  role,
  children,
}: {
  role: Role;
  children: ReactNode;
}) {
  const user = useAuthStore((state) => state.user);
  const status = useAuthStore((state) => state.status);
  const error = useAuthStore((state) => state.sessionError);
  const restoreSession = useAuthStore((state) => state.restoreSession);

  if (status === "loading") {
    return (
      <div
        role="status"
        className="flex min-h-screen items-center justify-center gap-3 px-4 text-foreground"
      >
        <Loader2 className="size-5 animate-spin" aria-hidden="true" />
        Restoring your session…
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="max-w-md rounded-2xl border border-border bg-card p-6 text-center text-card-foreground">
          <p role="alert">{error}</p>
          <button
            type="button"
            onClick={() => void restoreSession()}
            className="mt-5 inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 font-semibold text-primary-foreground"
          >
            <RefreshCw className="size-4" aria-hidden="true" />
            Try again
          </button>
        </div>
      </div>
    );
  }

  if (status !== "authenticated" || user?.role !== role)
    return <Navigate to="/login" replace />;

  return <>{children}</>;
}
