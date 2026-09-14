import { Link, useLocation } from "@tanstack/react-router";
import { useState, useEffect, type ReactNode } from "react";
import { ShieldCheck, Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface AppShellProps {
  title: string;
  subtitle: string;
  operator: string;
  unit: string;
  accessLabel: string;
  children: ReactNode;
  className?: string;
  sidebar?: ReactNode;
}

export function AppShell({
  title,
  subtitle,
  operator,
  unit,
  accessLabel,
  children,
  className,
  sidebar,
}: AppShellProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b border-sidebar-border/70 bg-authority text-primary-foreground shadow-panel">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-3.5 sm:px-6">
          {sidebar && (
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/10 shadow-sm transition-colors hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-primary md:hidden"
              aria-label="Open menu"
            >
              <Menu className="size-5" />
            </button>
          )}
          <Link
            to="/"
            className={cn(
              "flex size-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/10 shadow-sm transition-colors hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-primary",
              sidebar && "hidden sm:flex"
            )}
            aria-label="Back to role selection"
          >
            <ShieldCheck
              className="size-5 text-sidebar-primary"
              strokeWidth={2.25}
            />
          </Link>
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-base font-bold leading-tight tracking-tight">
              {title}
            </p>
            <p className="truncate text-xs text-primary-foreground/70">
              {subtitle}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="rounded-full border border-sidebar-primary/30 bg-sidebar-primary/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-sidebar-primary">
              {accessLabel}
            </span>
            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium leading-tight">{operator}</p>
              <p className="text-xs text-primary-foreground/70">{unit}</p>
            </div>
          </div>
        </div>
      </header>
      
      {/* Mobile Drawer */}
      {sidebar && (
        <>
          {mobileMenuOpen && (
            <div
              className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm md:hidden"
              onClick={() => setMobileMenuOpen(false)}
            />
          )}
          <div
            className={cn(
              "fixed inset-y-0 left-0 z-50 w-72 max-w-[80vw] transform bg-background shadow-2xl transition-transform duration-300 ease-in-out md:hidden",
              mobileMenuOpen ? "translate-x-0" : "-translate-x-full"
            )}
          >
            <div className="flex h-16 items-center justify-between border-b border-border px-4">
              <span className="font-display text-lg font-bold">Menu</span>
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="flex size-10 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                aria-label="Close menu"
              >
                <X className="size-5" />
              </button>
            </div>
            <div className="p-4">{sidebar}</div>
          </div>
        </>
      )}

      <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 sm:py-7">
        <div className="flex gap-6 lg:gap-8">
          {sidebar && (
            <aside className="hidden w-52 shrink-0 self-start md:sticky md:top-24 md:block">{sidebar}</aside>
          )}
          <main className={cn("min-w-0 flex-1", className)}>{children}</main>
        </div>
      </div>
    </div>
  );
}
