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

  // Lock body scroll when drawer is open
  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileMenuOpen]);

  return (
    <div className="min-h-screen bg-background">
      {/* ── Header ─────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 bg-authority shadow-lift">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImciIHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PGNpcmNsZSBjeD0iMzAiIGN5PSIzMCIgcj0iMC41IiBmaWxsPSJyZ2JhKDI1NSwyNTUsMjU1LDAuMDUpIi8+PC9wYXR0ZXJuPjwvZGVmcz48cmVjdCBmaWxsPSJ1cmwoI2cpIiB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIi8+PC9zdmc+')] opacity-60" />
        <div className="relative mx-auto flex max-w-7xl items-center gap-2 px-3 py-3 sm:gap-3 sm:px-6">
          {/* Hamburger — mobile only when sidebar exists */}
          {sidebar && (
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/10 shadow-sm backdrop-blur-sm transition-all hover:bg-white/20 hover:shadow-glow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-primary md:hidden"
              aria-label="Open menu"
            >
              <Menu className="size-4 text-primary-foreground" />
            </button>
          )}

          {/* Home icon */}
          <Link
            to="/"
            className={cn(
              "flex size-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/10 shadow-sm backdrop-blur-sm transition-all hover:bg-white/20 hover:shadow-glow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-primary sm:size-10",
              sidebar && "hidden sm:flex",
            )}
            aria-label="Back to role selection"
          >
            <ShieldCheck
              className="size-4 text-sidebar-primary sm:size-5"
              strokeWidth={2.25}
            />
          </Link>

          {/* Title block */}
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-sm font-bold leading-tight tracking-tight text-primary-foreground sm:text-base">
              {title}
            </p>
            <p className="truncate text-[11px] text-primary-foreground/60 sm:text-xs">
              {subtitle}
            </p>
          </div>

          {/* Right: access badge + operator */}
          <div className="flex items-center gap-2 sm:gap-3">
            <span className="rounded-full border border-sidebar-primary/30 bg-sidebar-primary/15 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.16em] text-sidebar-primary shadow-sm backdrop-blur-sm sm:px-2.5 sm:py-1 sm:text-[10px]">
              {accessLabel}
            </span>
            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium leading-tight text-primary-foreground">
                {operator}
              </p>
              <p className="text-xs text-primary-foreground/60">{unit}</p>
            </div>
          </div>
        </div>
      </header>

      {/* ── Mobile Drawer ───────────────────────────────────────── */}
      {sidebar && (
        <>
          {/* Backdrop */}
          <div
            className={cn(
              "fixed inset-0 z-50 bg-black/50 backdrop-blur-sm transition-opacity duration-300 md:hidden",
              mobileMenuOpen
                ? "opacity-100 pointer-events-auto"
                : "opacity-0 pointer-events-none",
            )}
            onClick={() => setMobileMenuOpen(false)}
            aria-hidden="true"
          />

          {/* Drawer panel */}
          <div
            className={cn(
              "fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] transform shadow-2xl transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] md:hidden",
              mobileMenuOpen ? "translate-x-0" : "-translate-x-full",
            )}
            role="dialog"
            aria-modal="true"
            aria-label="Navigation menu"
          >
            <div className="flex h-full flex-col bg-authority">
              <div className="flex h-14 items-center justify-between border-b border-white/10 px-4">
                <span className="font-display text-base font-bold text-primary-foreground">
                  Menu
                </span>
                <button
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex size-9 items-center justify-center rounded-xl text-primary-foreground/70 transition-colors hover:bg-white/10 hover:text-primary-foreground"
                  aria-label="Close menu"
                >
                  <X className="size-5" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-3">{sidebar}</div>
            </div>
          </div>
        </>
      )}

      {/* ── Main Content ────────────────────────────────────────── */}
      <div className="mx-auto max-w-7xl px-3 py-4 sm:px-6 sm:py-6 lg:py-8">
        <div className="flex gap-5 lg:gap-8">
          {/* Desktop sidebar */}
          {sidebar && (
            <aside className="hidden w-52 shrink-0 self-start md:sticky md:top-[4.5rem] md:block lg:w-56 animate-slide-in-left">
              {sidebar}
            </aside>
          )}
          <main className={cn("min-w-0 flex-1 animate-fade-in", className)}>
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
