import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useDashboardMetrics } from "@/hooks/useDashboardMetrics";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CircleDollarSign,
  ClipboardCheck,
  FileSearch,
  ShieldAlert,
  Users,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import {
  PageHeader,
  SectionCard,
  StatCard,
  ListSkeleton,
  EmptyState,
} from "@/components/kit";
import { WorkflowFeedback } from "@/components/WorkflowFeedback";
import { StatusBadge } from "@/components/StatusBadge";
import { TicketDetailsDialog } from "@/components/TicketDetailsDialog";
import { peso, shortDate } from "@/lib/format";

export const Route = createFileRoute("/admin/")({ component: AdminDashboard });

function AdminDashboard() {
  const metrics = useDashboardMetrics();
  const [selected, setSelected] = useState<string | null>(null);
  const known = !metrics.loading && !metrics.error;
  const count = (value: number | null | undefined) =>
    known && value != null ? value.toLocaleString() : "—";
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        title="Municipal overview"
        eyebrow="Administration"
        description="Review what needs attention, track collections, and find citation records."
        icon={Activity}
        actions={
          <Link
            to="/admin/citations"
            search={{}}
            className="flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground"
          >
            <FileSearch className="size-4" />
            Find a citation
          </Link>
        }
      />
      <WorkflowFeedback
        error={metrics.error}
        loading={metrics.loading}
        updatedAt={metrics.updatedAt}
        onRetry={() => void metrics.refresh()}
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Citations today"
          value={count(metrics.todayCount)}
          hint="Issued today · Philippine time"
          icon={Activity}
        />
        <StatCard
          label="Collected today"
          value={known ? peso(metrics.revenueToday) : "—"}
          hint="Recorded settlements today"
          icon={CircleDollarSign}
          tone="success"
        />
        <StatCard
          label="Outstanding fines"
          value={known ? peso(metrics.pendingAmount) : "—"}
          hint={`${count(metrics.pendingCount)} unpaid or contested citations`}
          icon={AlertTriangle}
          tone="warning"
        />
        <StatCard
          label="Collection rate"
          value={known ? `${metrics.collectionRate}%` : "—"}
          hint={`${count(metrics.totalTickets)} total citations`}
          icon={ClipboardCheck}
          tone="info"
        />
      </div>
      <SectionCard
        title="Needs attention"
        description="Open the matching queue to review the next action."
        bodyClassName="grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-4"
      >
        <Link
          to="/admin/citations"
          search={{ status: "Overdue", flagged: "no" }}
          className="rounded-xl border border-border p-4 transition-colors hover:bg-muted"
        >
          <AlertTriangle className="size-5 text-amber-200" />
          <p className="mt-3 text-2xl font-bold">
            {count(metrics.unflaggedOverdueCount)}
          </p>
          <p className="mt-1 text-sm font-semibold">Overdue for review</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Still under administrative follow-up
          </p>
          <ArrowRight className="mt-3 size-4 text-muted-foreground" />
        </Link>
        <Link
          to="/admin/cases"
          search={{ view: "contested" }}
          className="rounded-xl border border-border p-4 transition-colors hover:bg-muted"
        >
          <ClipboardCheck className="size-5 text-indigo-200" />
          <p className="mt-3 text-2xl font-bold">
            {count(metrics.contestedCount)}
          </p>
          <p className="mt-1 text-sm font-semibold">Contested citations</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Record reasons and review follow-up
          </p>
          <ArrowRight className="mt-3 size-4 text-muted-foreground" />
        </Link>
        <Link
          to="/admin/manage"
          search={{ verification: "pending" }}
          className="rounded-xl border border-border p-4 transition-colors hover:bg-muted"
        >
          <Users className="size-5 text-blue-200" />
          <p className="mt-3 text-2xl font-bold">
            {count(metrics.pendingInvitations)}
          </p>
          <p className="mt-1 text-sm font-semibold">Pending invitations</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Staff awaiting email verification
          </p>
          <ArrowRight className="mt-3 size-4 text-muted-foreground" />
        </Link>
        <Link
          to="/admin/cases"
          search={{ view: "exceptions" }}
          className="rounded-xl border border-border p-4 transition-colors hover:bg-muted"
        >
          <ShieldAlert className="size-5 text-rose-200" />
          <p className="mt-3 text-2xl font-bold">
            {count(metrics.paymentExceptions)}
          </p>
          <p className="mt-1 text-sm font-semibold">Payment exceptions</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Unconfirmed or inconsistent records
          </p>
          <ArrowRight className="mt-3 size-4 text-muted-foreground" />
        </Link>
      </SectionCard>
      <div className="grid gap-6 xl:grid-cols-3">
        <SectionCard
          title="Issuance and settlement"
          description="Daily citation counts for the last seven days."
          bodyClassName="p-5"
          className="xl:col-span-2"
        >
          {metrics.loading ? (
            <ListSkeleton rows={4} />
          ) : known ? (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={metrics.trendData}>
                  <CartesianGrid
                    stroke="var(--border)"
                    strokeDasharray="3 3"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="name"
                    tickLine={false}
                    axisLine={false}
                    fontSize={12}
                    tick={{ fill: "var(--muted-foreground)" }}
                  />
                  <YAxis
                    allowDecimals={false}
                    tickLine={false}
                    axisLine={false}
                    fontSize={12}
                    tick={{ fill: "var(--muted-foreground)" }}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "var(--popover)",
                      borderColor: "var(--border)",
                      borderRadius: 12,
                    }}
                    labelStyle={{ color: "var(--foreground)" }}
                    itemStyle={{ color: "var(--foreground)" }}
                  />
                  <Legend />
                  <Line
                    type="monotone"
                    name="Issued"
                    dataKey="issued"
                    stroke="var(--primary-text)"
                    strokeWidth={2}
                  />
                  <Line
                    type="monotone"
                    name="Paid"
                    dataKey="paid"
                    stroke="var(--paid)"
                    strokeWidth={2}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="py-20 text-center text-sm text-muted-foreground">
              Chart unavailable until records refresh.
            </p>
          )}
        </SectionCard>
        <SectionCard title="Quick access" bodyClassName="space-y-3 p-5">
          <Link
            to="/admin/overdue"
            className="block rounded-xl bg-muted p-4 text-sm"
          >
            <span className="font-semibold">
              Overdue and police endorsements
            </span>
            <p className="mt-1 text-xs text-muted-foreground">
              {count(metrics.flaggedCount)} active flags · review and document
              follow-up.
            </p>
          </Link>
          <Link
            to="/admin/reports"
            className="block rounded-xl bg-muted p-4 text-sm"
          >
            <span className="font-semibold">Operational reports</span>
            <p className="mt-1 text-xs text-muted-foreground">
              Filter by issue or payment date and export matching records.
            </p>
          </Link>
          <Link
            to="/admin/audit"
            className="block rounded-xl bg-muted p-4 text-sm"
          >
            <span className="font-semibold">Activity history</span>
            <p className="mt-1 text-xs text-muted-foreground">
              See who changed a record, when, and why.
            </p>
          </Link>
          <p className="text-xs text-muted-foreground">
            Treasury manages collection and official receipts. Admin oversees
            records and follow-up.
          </p>
        </SectionCard>
      </div>
      <SectionCard
        title="Recent citations"
        actions={
          <Link
            to="/admin/citations"
            search={{}}
            className="text-sm font-semibold text-primary-text hover:underline"
          >
            Open register
          </Link>
        }
      >
        {metrics.loading ? (
          <ListSkeleton rows={4} />
        ) : !known ? (
          <p className="p-8 text-center text-sm text-muted-foreground">
            Recent records are unavailable.
          </p>
        ) : metrics.recentTickets.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
                <tr>
                  {[
                    "Citation / plate",
                    "Violator",
                    "Officer",
                    "Issued",
                    "Status",
                    "Fine",
                  ].map((label) => (
                    <th key={label} className="px-5 py-3 font-semibold">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {metrics.recentTickets.map((ticket) => (
                  <tr key={ticket.id} className="hover:bg-muted/40">
                    <td className="px-5 py-3">
                      <button
                        onClick={() => setSelected(ticket.id)}
                        className="min-h-11 text-left font-semibold text-primary-text hover:underline"
                      >
                        <span className="block font-mono text-xs">
                          {ticket.id}
                        </span>
                        <span className="mt-1 block text-foreground">
                          {ticket.plateNo}
                        </span>
                      </button>
                    </td>
                    <td className="px-5 py-3">{ticket.violatorName}</td>
                    <td className="px-5 py-3 text-muted-foreground">
                      {ticket.issuedBy}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3 text-muted-foreground">
                      {shortDate(ticket.issuedAt)}
                    </td>
                    <td className="px-5 py-3">
                      <StatusBadge status={ticket.status} />
                    </td>
                    <td className="whitespace-nowrap px-5 py-3 tabular-nums">
                      {peso(ticket.totalFine)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            icon={FileSearch}
            title="No citations yet"
            description="Issued citations will appear here."
          />
        )}
      </SectionCard>
      <TicketDetailsDialog
        ticketId={selected}
        onClose={() => setSelected(null)}
      />
    </div>
  );
}
