import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { ShieldCheck } from "lucide-react";
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
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-sidebar-border/70 bg-authority text-primary-foreground shadow-panel">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-3.5 sm:px-6">
          <Link
            to="/"
            className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/10 shadow-sm transition-colors hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-primary"
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
      <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 sm:py-7">
        {sidebar && <div className="mb-4 md:hidden">{sidebar}</div>}
        <div className="flex gap-6 lg:gap-8">
          {sidebar && (
            <aside className="hidden w-52 shrink-0 md:block">{sidebar}</aside>
          )}
          <main className={cn("min-w-0 flex-1", className)}>{children}</main>
        </div>
      </div>
    </div>
  );
}
