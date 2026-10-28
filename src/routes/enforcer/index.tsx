import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowUpRight, ClipboardList } from "lucide-react";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { workflowRequest, workflowParams } from "@/lib/workflow-client";
import { WorkflowFeedback } from "@/components/WorkflowFeedback";
import { AppShell } from "@/components/AppShell";
import { EnforcerSidebar } from "@/components/EnforcerSidebar";
import { localDateKey } from "@/lib/format";
import { useAuthStore } from "@/store/useAuthStore";

export const Route = createFileRoute("/enforcer/")({
  head: () => ({
    meta: [{ title: "Dashboard | Traffic Enforcer" }],
  }),
  component: EnforcerDashboardPage,
});

function Metric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-panel transition-lift hover-lift">
      <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-1.5 font-display text-2xl font-bold tabular text-card-foreground">
        {value}
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

function EnforcerDashboardPage() {
  const user = useAuthStore((s) => s.user);

  const navigate = useNavigate();

  useEffect(() => {
    if (!user || user.role !== "enforcer") {
      navigate({ to: "/login" });
    }
  }, [navigate, user]);

  const today = localDateKey(new Date());
  const result = useQuery({
    queryKey: ["workflow", "enforcer-overview", user?.key, today],
    queryFn: async ({ signal }) => {
      const counts = await Promise.all(
        [
          { pageSize: 1 },
          { pageSize: 1, from: today, to: today },
          { pageSize: 1, status: "Overdue" },
        ].map((filter) =>
          workflowRequest<{ total: number }>(
            `/api/workflow/tickets?${workflowParams(filter)}`,
            { signal },
          ),
        ),
      );
      return {
        all: counts[0]!.total,
        today: counts[1]!.total,
        overdue: counts[2]!.total,
      };
    },
    enabled: user?.role === "enforcer",
    staleTime: 15_000,
  });

  if (!user || user.role !== "enforcer") return null;

  return (
    <AppShell
      title="Dashboard"
      subtitle="Overview"
      operator={user.name}
      unit={`Badge ${user.credential}`}
      accessLabel="Enforcer"
      sidebar={<EnforcerSidebar />}
      className="max-w-3xl pb-10"
    >
      <div className="space-y-6">
        <section className="rounded-2xl border border-border bg-card p-5 shadow-panel sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary-text">
                <ClipboardList className="size-5" />
              </span>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                  Citation register
                </p>
                <h1 className="mt-1 font-display text-2xl font-bold tracking-tight sm:text-3xl">
                  My citations
                </h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  Review citations issued from your field desk.
                </p>
              </div>
            </div>
            <Link
              to="/enforcer/new"
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground shadow-sm transition-all hover:brightness-110 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              New citation <ArrowUpRight className="size-4" />
            </Link>
          </div>
          <div className="mt-4">
            <WorkflowFeedback
              error={result.error}
              loading={result.isFetching}
              updatedAt={result.dataUpdatedAt}
              onRetry={() => void result.refetch()}
            />
          </div>
          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3 stagger-children">
            <Metric
              label="Issued"
              value={result.data ? String(result.data.all) : "—"}
              detail="all time"
            />
            <Metric
              label="Issued today"
              value={result.data ? String(result.data.today) : "—"}
              detail="Philippine time"
            />
            <Metric
              label="Overdue"
              value={result.data ? String(result.data.overdue) : "—"}
              detail="awaiting settlement"
            />
          </div>
          <Link
            to="/enforcer/citations"
            search={{}}
            className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-4 text-sm font-semibold"
          >
            Open my citation register <ArrowUpRight className="size-4" />
          </Link>
        </section>
      </div>
    </AppShell>
  );
}
