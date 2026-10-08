import { Link } from "@tanstack/react-router";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  type ComponentType,
  type ReactNode,
} from "react";
import { ArrowDownRight, ArrowUpRight, Minus, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

/* ─── PageHeader ─────────────────────────────────────────────────── */

export function PageHeader({
  eyebrow,
  title,
  description,
  icon: Icon,
  actions,
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  icon?: ComponentType<{ className?: string }>;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between",
        className,
      )}
    >
      <div className="flex min-w-0 items-start gap-3.5">
        {Icon && (
          <span className="hidden size-12 shrink-0 items-center justify-center rounded-2xl bg-authority text-sidebar-primary shadow-lift sm:flex">
            <Icon className="size-5" />
          </span>
        )}
        <div className="min-w-0">
          {eyebrow && (
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
              {eyebrow}
            </p>
          )}
          <h1 className="mt-0.5 font-display text-2xl font-bold tracking-tight text-foreground sm:text-[1.75rem]">
            {title}
          </h1>
          {description && (
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              {description}
            </p>
          )}
        </div>
      </div>
      {actions && (
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      )}
    </div>
  );
}

/* ─── StatCard ───────────────────────────────────────────────────── */

const toneStyles = {
  primary: "bg-primary/10 text-primary",
  success: "bg-paid text-paid-foreground",
  warning: "bg-unpaid text-unpaid-foreground",
  danger: "bg-overdue text-overdue-foreground",
  info: "bg-contested text-contested-foreground",
} as const;

const toneBars = {
  primary: "from-primary/70",
  success: "from-paid-foreground/70",
  warning: "from-unpaid-foreground/70",
  danger: "from-overdue-foreground/70",
  info: "from-contested-foreground/70",
} as const;

export type Tone = keyof typeof toneStyles;

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "primary",
  trend,
  to,
  onClick,
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ComponentType<{ className?: string }>;
  tone?: Tone;
  /** Percentage change; null renders a neutral "no baseline" marker. */
  trend?: number | null;
  to?: string;
  onClick?: () => void;
  className?: string;
}) {
  const body = (
    <>
      <span
        className={cn(
          "pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100",
          toneBars[tone],
        )}
      />
      <div className="flex items-start justify-between gap-3">
        <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
          {label}
        </p>
        {Icon && (
          <span
            className={cn(
              "flex size-9 shrink-0 items-center justify-center rounded-xl transition-transform duration-300 group-hover:scale-110",
              toneStyles[tone],
            )}
          >
            <Icon className="size-[18px]" />
          </span>
        )}
      </div>
      <p className="mt-2 font-display text-[1.65rem] font-bold leading-tight tabular text-card-foreground">
        {value}
      </p>
      {(hint || trend !== undefined) && (
        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {trend !== undefined && <TrendPill value={trend} />}
          {hint && <span>{hint}</span>}
        </div>
      )}
    </>
  );

  const base = cn(
    "group relative block overflow-hidden card-surface p-4 text-left transition-lift sm:p-5",
    (to || onClick) &&
      "hover-lift cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
    className,
  );

  if (to)
    return (
      <Link to={to} className={base}>
        {body}
      </Link>
    );
  if (onClick)
    return (
      <button type="button" onClick={onClick} className={cn(base, "w-full")}>
        {body}
      </button>
    );
  return <div className={base}>{body}</div>;
}

export function TrendPill({ value }: { value: number | null }) {
  if (value === null)
    return (
      <span className="inline-flex items-center gap-0.5 rounded-md bg-muted px-1.5 py-0.5 font-semibold">
        <Minus className="size-3" /> no data yesterday
      </span>
    );
  const up = value > 0;
  const flat = value === 0;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 font-semibold",
        flat
          ? "bg-muted text-muted-foreground"
          : up
            ? "bg-paid text-paid-foreground"
            : "bg-overdue text-overdue-foreground",
      )}
    >
      {flat ? (
        <Minus className="size-3" />
      ) : up ? (
        <ArrowUpRight className="size-3" />
      ) : (
        <ArrowDownRight className="size-3" />
      )}
      {up ? "+" : ""}
      {value}% vs yesterday
    </span>
  );
}

/* ─── EmptyState ─────────────────────────────────────────────────── */

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center px-6 py-12 text-center animate-fade-in",
        className,
      )}
    >
      <div className="relative">
        <div className="absolute inset-0 rounded-2xl bg-primary/10 blur-xl" />
        <div className="relative flex size-14 items-center justify-center rounded-2xl border border-border bg-muted/60 text-muted-foreground">
          <Icon className="size-6" />
        </div>
      </div>
      <p className="mt-4 font-display text-base font-semibold text-foreground">
        {title}
      </p>
      {description && (
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          {description}
        </p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/* ─── SearchInput ────────────────────────────────────────────────── */

export const SearchInput = forwardRef<
  HTMLInputElement,
  {
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;
    className?: string;
    inputClassName?: string;
    /** Press "/" anywhere to focus this input. */
    hotkey?: boolean;
    autoFocus?: boolean;
    onEnter?: () => void;
    id?: string;
    "aria-label"?: string;
  }
>(function SearchInput(
  {
    value,
    onChange,
    placeholder = "Search…",
    className,
    inputClassName,
    hotkey = false,
    autoFocus,
    onEnter,
    id,
    "aria-label": ariaLabel,
  },
  ref,
) {
  const inner = useRef<HTMLInputElement>(null);
  useImperativeHandle(ref, () => inner.current as HTMLInputElement);

  useEffect(() => {
    if (!hotkey) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing =
        t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.isContentEditable);
      if (e.key === "/" && !typing) {
        e.preventDefault();
        inner.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hotkey]);

  return (
    <div className={cn("relative", className)}>
      <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <input
        ref={inner}
        id={id}
        type="search"
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onEnter?.();
          if (e.key === "Escape" && value) {
            e.preventDefault();
            onChange("");
          }
        }}
        placeholder={placeholder}
        aria-label={ariaLabel ?? placeholder}
        className={cn(
          "h-11 w-full rounded-xl border border-input bg-card pl-10 pr-16 text-sm shadow-sm outline-none transition-all placeholder:text-muted-foreground/70 focus:border-ring focus:ring-2 focus:ring-ring/15 [&::-webkit-search-cancel-button]:hidden",
          inputClassName,
        )}
      />
      <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
        {value ? (
          <button
            type="button"
            onClick={() => {
              onChange("");
              inner.current?.focus();
            }}
            className="flex size-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Clear search"
          >
            <X className="size-4" />
          </button>
        ) : (
          hotkey && (
            <kbd className="hidden h-6 items-center rounded-md border border-border bg-muted px-1.5 font-mono text-[11px] font-semibold text-muted-foreground sm:inline-flex">
              /
            </kbd>
          )
        )}
      </div>
    </div>
  );
});

/* ─── FilterChips ────────────────────────────────────────────────── */

export function FilterChips<T extends string>({
  options,
  value,
  onChange,
  counts,
  className,
}: {
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
  counts?: Partial<Record<T, number>>;
  className?: string;
}) {
  return (
    <div role="tablist" className={cn("flex flex-wrap gap-1.5", className)}>
      {options.map((o) => {
        const active = o === value;
        const count = counts?.[o];
        return (
          <button
            key={o}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o)}
            className={cn(
              "inline-flex h-9 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active
                ? "bg-primary text-primary-foreground shadow-sm"
                : "bg-muted text-muted-foreground hover:bg-secondary hover:text-foreground",
            )}
          >
            {o}
            {count !== undefined && (
              <span
                className={cn(
                  "rounded-md px-1.5 py-px text-[11px] tabular",
                  active ? "bg-white/20" : "bg-card text-muted-foreground",
                )}
              >
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/* ─── Skeletons ──────────────────────────────────────────────────── */

export function SkeletonBlock({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "animate-shimmer rounded-xl bg-gradient-to-r from-muted via-secondary to-muted",
        className,
      )}
    />
  );
}

export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3 p-4" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <SkeletonBlock className="size-10 shrink-0" />
          <div className="flex-1 space-y-2">
            <SkeletonBlock className="h-3.5 w-1/3" />
            <SkeletonBlock className="h-3 w-2/3" />
          </div>
          <SkeletonBlock className="h-6 w-16" />
        </div>
      ))}
    </div>
  );
}

/* ─── Section card ───────────────────────────────────────────────── */

export function SectionCard({
  title,
  description,
  icon: Icon,
  actions,
  children,
  className,
  bodyClassName,
  id,
}: {
  title?: ReactNode;
  description?: ReactNode;
  icon?: ComponentType<{ className?: string }>;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  id?: string;
}) {
  return (
    <section id={id} className={cn("card-surface overflow-hidden", className)}>
      {(title || actions) && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
          <div className="flex min-w-0 items-center gap-2.5">
            {Icon && (
              <span className="flex size-8 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                <Icon className="size-4" />
              </span>
            )}
            <div className="min-w-0">
              {title && (
                <h2 className="font-display text-base font-semibold text-foreground">
                  {title}
                </h2>
              )}
              {description && (
                <p className="text-xs text-muted-foreground">{description}</p>
              )}
            </div>
          </div>
          {actions && (
            <div className="flex flex-wrap items-center gap-2">{actions}</div>
          )}
        </div>
      )}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}
