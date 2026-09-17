import { Link, useNavigate } from "@tanstack/react-router";
import {
  Activity,
  ShieldCheck,
  LogOut,
  Users,
  BarChart3,
  FileText,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/useAuthStore";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const navigation = [
  { to: "/admin", label: "Monitoring", icon: Activity },
  { to: "/admin/manage", label: "Manage Users", icon: Users },
  { to: "/admin/reports", label: "Reports", icon: BarChart3 },
] as const;

export function AdminSidebar() {
  const signOut = useAuthStore((s) => s.signOut);
  const navigate = useNavigate();

  const handleSignOut = () => {
    signOut();
    navigate({ to: "/login" });
  };

  return (
    <nav
      aria-label="Admin navigation"
      className="sticky top-6 flex min-h-[calc(100vh-9rem)] flex-col overflow-hidden rounded-2xl border border-sidebar-border/60 bg-authority p-2 shadow-lift md:min-h-[calc(100vh-8rem)]"
    >
      <div className="flex items-center gap-2 px-2.5 py-3 text-primary-foreground">
        <span className="flex size-7 items-center justify-center rounded-lg bg-sidebar-primary/15 text-sidebar-primary">
          <ShieldCheck className="size-4" />
        </span>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-sidebar-primary">
            Admin Portal
          </p>
          <p className="text-xs font-medium text-primary-foreground/80">
            System Administration
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
        <a
          href="#citations"
          className="flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-semibold text-primary-foreground/70 transition-colors hover:bg-white/10 hover:text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-primary"
        >
          <FileText className="size-4" />
          Citations
        </a>
      </div>

      <div className="mt-4 border-t border-sidebar-border/30 pt-2">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <button className="flex w-full min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-semibold text-primary-foreground/70 hover:bg-white/10 hover:text-primary-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-primary">
              <LogOut className="size-4" />
              Sign out
            </button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                Are you sure you want to sign out?
              </AlertDialogTitle>
              <AlertDialogDescription>
                You will need to log in again to access the admin portal.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleSignOut}>
                Sign out
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </nav>
  );
}
