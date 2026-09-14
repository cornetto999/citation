import { Link, useNavigate } from "@tanstack/react-router";
import {
  ClipboardList,
  PlusCircle,
  ShieldCheck,
  LayoutDashboard,
  LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/useAuthStore";

const navigation = [
  { to: "/enforcer", label: "Dashboard", icon: LayoutDashboard },
  { to: "/enforcer/new", label: "New citation", icon: PlusCircle },
  { to: "/enforcer/citations", label: "My citations", icon: ClipboardList },
] as const;

export function EnforcerSidebar() {
  const signOut = useAuthStore((s) => s.signOut);
  const navigate = useNavigate();

  const handleSignOut = () => {
    signOut();
    navigate({ to: "/login" });
  };

  return (
    <nav
      aria-label="Enforcer navigation"
      className="sticky top-6 flex min-h-[calc(100vh-9rem)] flex-col overflow-hidden rounded-2xl border border-sidebar-border/60 bg-authority p-2 shadow-lift md:min-h-[calc(100vh-8rem)]"
    >
      <div className="flex items-center gap-2 px-2.5 py-3 text-primary-foreground">
        <span className="flex size-7 items-center justify-center rounded-lg bg-sidebar-primary/15 text-sidebar-primary">
          <ShieldCheck className="size-4" />
        </span>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-sidebar-primary">
            Field desk
          </p>
          <p className="text-xs font-medium text-primary-foreground/80">
            Enforcer workspace
          </p>
        </div>
      </div>
      <div className="flex-1 space-y-1">
        {navigation.map(({ to, label, icon: Icon }) => (
          <Link
            key={to}
            to={to}
            activeProps={{
              className: "bg-white text-surface-strong shadow-sm",
            }}
            inactiveProps={{
              className:
                "text-primary-foreground/70 hover:bg-white/10 hover:text-primary-foreground",
            }}
            className={cn(
              "flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-primary",
            )}
          >
            <Icon className="size-4" />
            {label}
          </Link>
        ))}
      </div>

      <div className="mt-4 border-t border-sidebar-border/30 pt-2">
        <button
          onClick={handleSignOut}
          className="flex w-full min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-semibold text-primary-foreground/70 hover:bg-white/10 hover:text-primary-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-primary"
        >
          <LogOut className="size-4" />
          Sign out
        </button>
      </div>
    </nav>
  );
}
