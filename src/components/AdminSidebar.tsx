import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import {
  Activity,
  AlarmClock,
  ShieldCheck,
  LogOut,
  Users,
  BarChart3,
  FileText,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/useAuthStore";
import { useTicketStore } from "@/store/useTicketStore";
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
  { to: "/admin/overdue", label: "Overdue", icon: AlarmClock },
  { to: "/admin/reports", label: "Reports", icon: BarChart3 },
] as const;

export function AdminSidebar() {
  const pathname = useLocation({ select: (location) => location.pathname });
  const currentPage = pathname.replace(/\/+$/, "") || "/";
  const signOut = useAuthStore((s) => s.signOut);
  const navigate = useNavigate();
  const overdueCount = useTicketStore(
    (s) => s.tickets.filter((t) => t.status === "Overdue").length,
  );

  const handleSignOut = async () => {
    try {
      await signOut();
      await navigate({ to: "/login" });
      toast.success("Signed out successfully.");
    } catch {
      toast.error("Unable to sign out. Check your connection and try again.");
    }
  };

  return (
    <nav
      aria-label="Admin navigation"
      className="sticky top-6 flex min-h-[calc(100vh-9rem)] flex-col overflow-hidden rounded-2xl glass-dark p-2 shadow-lift md:min-h-[calc(100vh-8rem)]"
    >
      <div className="flex items-center gap-2.5 px-3 py-3 text-primary-foreground">
        <span className="flex size-8 items-center justify-center rounded-xl bg-sidebar-primary/15 text-sidebar-primary shadow-sm">
          <ShieldCheck className="size-4" />
        </span>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-sidebar-primary">
            Admin Portal
          </p>
          <p className="text-xs font-medium text-primary-foreground/60">
            System Administration
          </p>
        </div>
      </div>
      <div className="flex-1 space-y-1 mt-1">
        {navigation.map(({ to, label, icon: Icon }) => (
          <Link
            key={to}
            to={to}
            activeOptions={{ exact: true, includeSearch: false }}
            activeProps={{}}
            aria-current={currentPage === to ? "page" : undefined}
            className={cn(
              "flex min-h-11 items-center gap-2.5 rounded-xl px-3 text-sm font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-primary",
              currentPage === to
                ? "bg-white/[0.12] text-primary-foreground shadow-sm border-l-2 border-sidebar-primary"
                : "text-primary-foreground/50 border-l-2 border-transparent hover:bg-white/[0.06] hover:text-primary-foreground/80",
            )}
          >
            <Icon className="size-4" />
            {label}
            {to === "/admin/overdue" && overdueCount > 0 && (
              <span className="ml-auto rounded-full bg-destructive px-1.5 py-px text-[10px] font-bold tabular text-destructive-foreground">
                {overdueCount}
              </span>
            )}
          </Link>
        ))}
        <a
          href="#citations"
          className="flex min-h-11 items-center gap-2.5 rounded-xl px-3 text-sm font-semibold text-primary-foreground/50 border-l-2 border-transparent transition-all duration-200 hover:bg-white/[0.06] hover:text-primary-foreground/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-primary"
        >
          <FileText className="size-4" />
          Citations
        </a>
      </div>

      <div className="mt-4 border-t border-white/[0.06] pt-2">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <button className="flex w-full min-h-11 items-center gap-2.5 rounded-xl px-3 text-sm font-semibold text-primary-foreground/40 hover:bg-white/[0.06] hover:text-primary-foreground/70 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-primary">
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
