import { Link, useNavigate } from "@tanstack/react-router";
import {
  Activity,
  Banknote,
  LineChart,
  Wallet,
  LogOut,
  List,
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
  { to: "/treasury", label: "Dashboard", icon: Activity },
  { to: "/treasury/cashier", label: "Cashier Window", icon: Banknote },
  { to: "/treasury/transactions", label: "Transactions", icon: List },
  { to: "/treasury/reports", label: "Reports", icon: LineChart },
] as const;

export function TreasurySidebar() {
  const signOut = useAuthStore((s) => s.signOut);
  const navigate = useNavigate();

  const handleSignOut = () => {
    signOut();
    navigate({ to: "/login" });
  };

  return (
    <nav
      aria-label="Treasury navigation"
      className="sticky top-6 flex min-h-[calc(100vh-9rem)] flex-col overflow-hidden rounded-2xl glass-dark p-2 shadow-lift md:min-h-[calc(100vh-8rem)]"
    >
      <div className="flex items-center gap-2.5 px-3 py-3 text-primary-foreground">
        <span className="flex size-8 items-center justify-center rounded-xl bg-sidebar-primary/15 text-sidebar-primary shadow-sm">
          <Wallet className="size-4" />
        </span>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-sidebar-primary">
            Revenue Desk
          </p>
          <p className="text-xs font-medium text-primary-foreground/60">
            Treasury workspace
          </p>
        </div>
      </div>
      <div className="flex-1 space-y-1 mt-1">
        {navigation.map(({ to, label, icon: Icon }) => (
          <Link
            key={to}
            to={to}
            activeOptions={{ exact: true }}
            activeProps={{
              className:
                "bg-white/[0.12] text-primary-foreground shadow-sm border-l-2 border-sidebar-primary",
            }}
            inactiveProps={{
              className:
                "text-primary-foreground/50 border-l-2 border-transparent hover:bg-white/[0.06] hover:text-primary-foreground/80",
            }}
            className={cn(
              "flex min-h-11 items-center gap-2.5 rounded-xl px-3 text-sm font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-primary",
            )}
          >
            <Icon className="size-4" />
            {label}
          </Link>
        ))}
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
              <AlertDialogTitle>Are you sure you want to sign out?</AlertDialogTitle>
              <AlertDialogDescription>
                You will need to log in again to access the treasury portal.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleSignOut}>Sign out</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </nav>
  );
}
