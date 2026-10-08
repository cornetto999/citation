import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useDashboardMetrics } from "@/hooks/useDashboardMetrics";
import { useTicketStore } from "@/store/useTicketStore";
import { useAuthStore } from "@/store/useAuthStore";
import {
  Activity,
  PhilippinePeso,
  CheckCircle2,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Trophy,
  Clock,
  Search,
  X,
  CreditCard,
  FileText,
} from "lucide-react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { peso, shortDate } from "@/lib/format";
import type { Ticket, PaymentChannel } from "@/types";

export const Route = createFileRoute("/admin/")({
  component: AdminDashboard,
});

const PIE_COLORS = ["#6366f1", "#10b981"];

function AdminDashboard() {
  const metrics = useDashboardMetrics();
  const { tickets, payTicket } = useTicketStore();
  const { user } = useAuthStore();

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [settleModalOpen, setSettleModalOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentChannel>(
    "Cash (Over-the-counter)",
  );
  const [orNumber, setOrNumber] = useState("");

  // Live Command Feed detail modal
  const [feedTicket, setFeedTicket] = useState<Ticket | null>(null);
  const [feedModalOpen, setFeedModalOpen] = useState(false);

  const handleFeedRowClick = (ticket: Ticket) => {
    setFeedTicket(ticket);
    setFeedModalOpen(true);
  };

  const searchResults = searchQuery.trim()
    ? tickets.filter(
        (t) =>
          t.id.toLowerCase().includes(searchQuery.trim().toLowerCase()) ||
          t.plateNo.toLowerCase().includes(searchQuery.trim().toLowerCase()),
      )
    : tickets.slice(0, 5); // Default show 5 recent

  const handleSettleClick = (ticket: Ticket) => {
    setSelectedTicket(ticket);
    setPaymentMethod("Cash (Over-the-counter)");
    setOrNumber("");
    setSettleModalOpen(true);
  };

  const handleConfirmSettle = async () => {
    if (!selectedTicket || !user) return;
    try {
      await payTicket(
        selectedTicket.id,
        paymentMethod as Exclude<PaymentChannel, "Unpaid">,
        user.name,
        orNumber || undefined,
      );
      toast.success("Citation settled successfully!");
      setSettleModalOpen(false);
      setSelectedTicket(null);
    } catch (e) {
      toast.error("Failed to settle citation");
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-foreground">
          Dashboard Overview
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Monitor your municipality's real-time apprehension and revenue
          metrics.
        </p>
      </div>

      {/* A. Executive KPI Cards (Top Row - 4 columns) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {/* Total Apprehensions */}
        <div className="bg-card p-5 rounded-2xl border border-border shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-muted-foreground">
              Total Apprehensions
            </h3>
            <div className="bg-blue-50 p-2 rounded-lg text-blue-600">
              <Activity className="size-5" />
            </div>
          </div>
          <div>
            <p className="text-2xl font-bold text-foreground">
              {metrics.todayCount}
            </p>
            <div className="flex items-center gap-1.5 mt-2">
              <span className="flex items-center text-xs font-medium text-emerald-600">
                <TrendingUp className="size-3.5 mr-1" />+
                {(metrics.apprehensionsTrend ?? 0) >= 0
                  ? (metrics.apprehensionsTrend ?? 0)
                  : 0}
                % vs yesterday
              </span>
            </div>
          </div>
        </div>

        {/* Collection Rate */}
        <div className="bg-card p-5 rounded-2xl border border-border shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-muted-foreground">
              Collection Rate
            </h3>
            <div className="bg-emerald-50 p-2 rounded-lg text-emerald-600">
              <CheckCircle2 className="size-5" />
            </div>
          </div>
          <div>
            <p className="text-2xl font-bold text-foreground">
              {metrics.collectionRate}%
            </p>
            <p className="text-xs text-muted-foreground mt-2">
              Percentage paid vs. pending
            </p>
          </div>
        </div>

        {/* Total Revenue */}
        <div className="bg-card p-5 rounded-2xl border border-border shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-muted-foreground">
              Total Revenue
            </h3>
            <div className="bg-indigo-50 p-2 rounded-lg text-indigo-600">
              <PhilippinePeso className="size-5" />
            </div>
          </div>
          <div>
            <p className="text-2xl font-bold text-foreground">
              ₱{metrics.totalRevenue.toLocaleString()}
            </p>
            <p className="text-xs text-muted-foreground mt-2">
              Across all payment channels
            </p>
          </div>
        </div>

        {/* Pending Payments */}
        <div className="bg-card p-5 rounded-2xl border border-border shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-muted-foreground">
              Pending Payments
            </h3>
            <div className="bg-amber-100 text-amber-700 px-2.5 py-1 rounded-md text-xs font-bold">
              {tickets.filter((t) => t.status !== "Paid").length}
            </div>
          </div>
          <div>
            <p className="text-2xl font-bold text-foreground">
              ₱
              {tickets
                .filter((t) => t.status !== "Paid")
                .reduce((s, t) => s + t.totalFine, 0)
                .toLocaleString()}
            </p>
            <p className="text-xs text-muted-foreground mt-2">Total Pending</p>
          </div>
        </div>
      </div>

      {/* B. Revenue & Ticket Trends (Middle Row - 2 columns) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Ticket Trends (7 Days) */}
        <div className="bg-card p-6 rounded-2xl border border-border shadow-sm">
          <h2 className="text-lg font-semibold text-foreground mb-6">
            Tickets Issued vs Paid (7 Days)
          </h2>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={metrics.trendData}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="#e2e8f0"
                />
                <XAxis
                  dataKey="name"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "#64748b", fontSize: 12 }}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "#64748b", fontSize: 12 }}
                />
                <Tooltip
                  cursor={{ fill: "#f1f5f9" }}
                  contentStyle={{
                    borderRadius: "8px",
                    border: "none",
                    boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                  }}
                />
                <Legend iconType="circle" wrapperStyle={{ fontSize: "12px" }} />
                <Line
                  type="monotone"
                  name="Issued"
                  dataKey="issued"
                  stroke="#64748b"
                  strokeWidth={3}
                  dot={{ r: 4 }}
                  activeDot={{ r: 6 }}
                />
                <Line
                  type="monotone"
                  name="Paid"
                  dataKey="paid"
                  stroke="#10b981"
                  strokeWidth={3}
                  dot={{ r: 4 }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Payment Methods */}
        <div className="bg-card p-6 rounded-2xl border border-border shadow-sm">
          <h2 className="text-lg font-semibold text-foreground mb-6">
            Payment Methods
          </h2>
          <div className="h-72 flex items-center justify-center">
            {metrics.paymentMethodData.reduce((a, b) => a + b.value, 0) > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={metrics.paymentMethodData}
                    cx="50%"
                    cy="50%"
                    innerRadius={70}
                    outerRadius={100}
                    paddingAngle={5}
                    dataKey="value"
                    stroke="none"
                  >
                    {metrics.paymentMethodData.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={PIE_COLORS[index % PIE_COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      borderRadius: "8px",
                      border: "none",
                      boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                    }}
                  />
                  <Legend
                    iconType="circle"
                    layout="vertical"
                    verticalAlign="middle"
                    align="right"
                    wrapperStyle={{ fontSize: "14px" }}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-muted-foreground text-sm">
                No payment data available yet.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Search & Settle Citations */}
      <div
        id="citations"
        className="bg-card p-6 rounded-2xl border border-border shadow-sm"
      >
        <h2 className="text-lg font-semibold text-foreground mb-4">
          Search & Settle Citations
        </h2>

        <div className="flex items-center gap-2 mb-6">
          <div className="relative flex-1 max-w-xl">
            <input
              type="text"
              placeholder="Search by Ticket ID or Plate Number"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-border bg-card pl-4 pr-10 py-2 text-sm text-foreground outline-none focus:border-slate-400 transition-colors"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-muted-foreground"
              >
                <X className="size-4" />
              </button>
            )}
          </div>
          <button className="h-9 px-6 bg-slate-800 text-white text-sm font-medium rounded-lg hover:bg-slate-700 transition-colors">
            Search
          </button>
        </div>

        <div className="overflow-x-auto border border-border rounded-xl">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-muted text-muted-foreground border-b border-border">
              <tr>
                <th className="px-4 py-3 font-medium">Ticket ID</th>
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Driver</th>
                <th className="px-4 py-3 font-medium">Violation</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium text-right">Amount Due</th>
                <th className="px-4 py-3 font-medium text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {searchResults.map((ticket) => (
                <tr
                  key={ticket.id}
                  onClick={() => handleFeedRowClick(ticket)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      handleFeedRowClick(ticket);
                    }
                  }}
                  tabIndex={0}
                  className={`cursor-pointer transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-600 ${selectedTicket?.id === ticket.id ? "bg-indigo-50/50 border-l-4 border-indigo-600" : "border-l-4 border-transparent"}`}
                >
                  <td className="px-4 py-3 font-medium text-foreground">
                    {ticket.id.slice(0, 8).toUpperCase()}...
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {shortDate(ticket.issuedAt)}
                  </td>
                  <td className="px-4 py-3 text-foreground">{ticket.plateNo}</td>
                  <td
                    className="px-4 py-3 text-muted-foreground max-w-[200px] truncate"
                    title={ticket.violations.map((v) => v.label).join(", ")}
                  >
                    {ticket.violations[0]?.label || "Unknown"}{" "}
                    {ticket.violations.length > 1 &&
                      `(+${ticket.violations.length - 1})`}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                        ticket.status === "Paid"
                          ? "bg-emerald-100 text-emerald-700"
                          : ticket.status === "Overdue"
                            ? "bg-rose-100 text-rose-700"
                            : ticket.status === "Contested"
                              ? "bg-amber-100 text-amber-700"
                              : "bg-muted text-foreground"
                      }`}
                    >
                      {ticket.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-medium text-right tabular-nums">
                    {ticket.status === "Paid"
                      ? "P0"
                      : ticket.totalFine.toString()}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {ticket.status !== "Paid" ? (
                      <button
                        onClick={(event) => {
                          event.stopPropagation();
                          handleSettleClick(ticket);
                        }}
                        className={`inline-flex items-center justify-center rounded-lg px-4 py-1.5 text-xs font-bold transition-colors ${
                          selectedTicket?.id === ticket.id
                            ? "bg-slate-900 text-white hover:bg-slate-800"
                            : "border border-border text-foreground hover:bg-muted bg-card"
                        }`}
                      >
                        Settle
                      </button>
                    ) : (
                      <span className="text-muted-foreground text-xl font-bold leading-none">
                        ...
                      </span>
                    )}
                  </td>
                </tr>
              ))}
              {searchResults.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-8 text-center text-muted-foreground"
                  >
                    No citations found matching your search.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* C. Operational Feeds (Bottom Row - 2 columns) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Live Command Feed */}
        <div className="bg-card p-6 rounded-2xl border border-border shadow-sm lg:col-span-2">
          <div className="flex items-center gap-2 mb-4">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-rose-500"></span>
            </span>
            <h2 className="text-lg font-semibold text-foreground">
              Live Command Feed
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="text-muted-foreground border-b border-border">
                <tr>
                  <th className="px-4 py-3 font-medium">Time</th>
                  <th className="px-4 py-3 font-medium">Plate No</th>
                  <th className="px-4 py-3 font-medium">Enforcer</th>
                  <th className="px-4 py-3 font-medium">Violation</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {metrics.recentTickets.map((ticket) => (
                  <tr
                    key={ticket.id}
                    onClick={() => handleFeedRowClick(ticket)}
                    className="hover:bg-muted transition-colors cursor-pointer group"
                  >
                    <td className="px-4 py-3 text-muted-foreground">
                      {new Date(ticket.issuedAt).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="px-4 py-3 font-medium text-foreground group-hover:text-blue-600 transition-colors">
                      {ticket.plateNo}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {ticket.issuedBy}
                    </td>
                    <td
                      className="px-4 py-3 text-muted-foreground max-w-[200px] truncate"
                      title={ticket.violations.map((v) => v.label).join(", ")}
                    >
                      {ticket.violations[0]?.label || "Unknown"}{" "}
                      {ticket.violations.length > 1 &&
                        `(+${ticket.violations.length - 1} more)`}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                          ticket.status === "Paid"
                            ? "bg-green-100 text-green-700"
                            : ticket.status === "Overdue"
                              ? "bg-red-100 text-red-700"
                              : ticket.status === "Contested"
                                ? "bg-orange-100 text-orange-700"
                                : "bg-yellow-100 text-yellow-700"
                        }`}
                      >
                        {ticket.status}
                      </span>
                    </td>
                  </tr>
                ))}
                {metrics.recentTickets.length === 0 && (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-4 py-8 text-center text-muted-foreground"
                    >
                      No live activity.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Enforcer Leaderboard */}
        <div className="bg-card p-6 rounded-2xl border border-border shadow-sm">
          <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
            <Trophy className="size-5 text-amber-500" />
            Top Enforcers Today
          </h2>
          <div className="space-y-4 mt-6">
            {metrics.leaderboard.length > 0 ? (
              metrics.leaderboard.map((enforcer, index) => (
                <div
                  key={enforcer.name}
                  className="flex items-center justify-between p-3 rounded-xl bg-muted border border-border"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`flex size-8 items-center justify-center rounded-full font-bold text-sm ${
                        index === 0
                          ? "bg-amber-100 text-amber-600"
                          : index === 1
                            ? "bg-slate-200 text-muted-foreground"
                            : "bg-orange-100 text-orange-600"
                      }`}
                    >
                      #{index + 1}
                    </div>
                    <span className="font-medium text-foreground">
                      {enforcer.name}
                    </span>
                  </div>
                  <div className="text-sm font-semibold text-muted-foreground bg-card px-2 py-1 rounded shadow-sm border border-border">
                    {enforcer.count} tickets
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-8 text-muted-foreground flex flex-col items-center gap-2">
                <Clock className="size-8 text-slate-300" />
                <p>No apprehensions yet today.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Live Command Feed — Ticket Detail Modal */}
      <Dialog open={feedModalOpen} onOpenChange={setFeedModalOpen}>
        <DialogContent className="max-w-md bg-card">
          <DialogHeader>
            <DialogTitle className="font-mono text-base">
              {feedTicket?.id}
            </DialogTitle>
          </DialogHeader>
          {feedTicket && (
            <div className="space-y-4 text-sm">
              {/* Status badge */}
              <span
                className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${
                  feedTicket.status === "Paid"
                    ? "bg-green-100 text-green-700"
                    : feedTicket.status === "Overdue"
                      ? "bg-red-100 text-red-700"
                      : feedTicket.status === "Contested"
                        ? "bg-orange-100 text-orange-700"
                        : "bg-yellow-100 text-yellow-700"
                }`}
              >
                {feedTicket.status}
              </span>

              {/* Details grid */}
              <dl className="grid grid-cols-2 gap-x-6 gap-y-3">
                <div>
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground font-medium">
                    Violator
                  </dt>
                  <dd className="mt-0.5 font-semibold text-foreground">
                    {feedTicket.violatorName}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground font-medium">
                    Plate No.
                  </dt>
                  <dd className="mt-0.5 font-semibold text-foreground">
                    {feedTicket.plateNo}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground font-medium">
                    License No.
                  </dt>
                  <dd className="mt-0.5 font-semibold text-foreground">
                    {feedTicket.licenseNo}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground font-medium">
                    Vehicle
                  </dt>
                  <dd className="mt-0.5 font-semibold text-foreground">
                    {feedTicket.vehicleType}
                  </dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground font-medium">
                    Location
                  </dt>
                  <dd className="mt-0.5 font-semibold text-foreground">
                    {feedTicket.location}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground font-medium">
                    Issued By
                  </dt>
                  <dd className="mt-0.5 font-semibold text-foreground">
                    {feedTicket.issuedBy}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground font-medium">
                    Issued At
                  </dt>
                  <dd className="mt-0.5 font-semibold text-foreground">
                    {new Date(feedTicket.issuedAt).toLocaleString([], {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground font-medium">
                    Due Date
                  </dt>
                  <dd className="mt-0.5 font-semibold text-foreground">
                    {shortDate(feedTicket.dueDate)}
                  </dd>
                </div>
              </dl>

              {/* Violations breakdown */}
              <div className="rounded-lg bg-muted border border-border p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                  Violations
                </p>
                <ul className="space-y-1.5">
                  {feedTicket.violations.map((v) => (
                    <li
                      key={v.code}
                      className="flex items-center justify-between"
                    >
                      <span className="text-muted-foreground">
                        <span className="font-mono text-xs text-muted-foreground mr-1">
                          {v.code}
                        </span>
                        {v.label}
                      </span>
                      <span className="font-semibold text-foreground tabular-nums">
                        {peso(v.fine)}
                      </span>
                    </li>
                  ))}
                </ul>
                <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
                  <span className="font-bold text-foreground">Total Fine</span>
                  <span className="text-lg font-bold text-foreground tabular-nums">
                    {peso(feedTicket.totalFine)}
                  </span>
                </div>
              </div>

              {feedTicket.remarks && (
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground font-medium mb-1">
                    Remarks
                  </p>
                  <p className="text-foreground">{feedTicket.remarks}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Settlement Slide-out Panel */}
      <Sheet open={settleModalOpen} onOpenChange={setSettleModalOpen}>
        <SheetContent
          side="right"
          className="w-[400px] sm:max-w-md p-0 flex flex-col h-full bg-card border-l border-border"
        >
          {selectedTicket && (
            <div className="flex flex-col h-full">
              <div className="px-6 py-5 border-b border-border bg-card">
                <h2 className="text-xs font-bold text-muted-foreground tracking-wider uppercase mb-2">
                  PROCESS SETTLEMENT:
                </h2>
                <p className="text-sm font-semibold text-foreground">
                  Ticket #{selectedTicket.id.slice(0, 8).toUpperCase()} (Plate:{" "}
                  {selectedTicket.plateNo})
                </p>
              </div>

              <div className="flex-1 overflow-y-auto px-6 py-6 space-y-8">
                <div>
                  <h3 className="text-sm font-semibold text-foreground mb-4">
                    Violation Summary
                  </h3>
                  <div className="space-y-3">
                    {selectedTicket.violations.map((v) => (
                      <div
                        key={v.code}
                        className="flex justify-between text-sm"
                      >
                        <span className="text-foreground">{v.label}</span>
                        <span className="font-medium text-foreground">
                          {v.fine}
                        </span>
                      </div>
                    ))}
                    <div className="flex justify-between text-sm font-bold pt-3 border-t border-border">
                      <span>Subtotal</span>
                      <span>
                        {selectedTicket.violations.reduce(
                          (s, v) => s + v.fine,
                          0,
                        )}
                      </span>
                    </div>
                  </div>
                </div>

                {selectedTicket.status === "Overdue" && (
                  <div>
                    <h3 className="text-sm font-semibold text-foreground mb-4">
                      Penalties & Surcharges
                    </h3>
                    <div className="flex justify-between text-sm">
                      <span className="text-foreground">
                        Overdue Surcharge (15 days)
                      </span>
                      <span className="font-medium text-foreground">
                        {selectedTicket.totalFine -
                          selectedTicket.violations.reduce(
                            (s, v) => s + v.fine,
                            0,
                          )}
                      </span>
                    </div>
                  </div>
                )}

                <div className="flex justify-between items-center bg-muted p-4 rounded-xl border border-border">
                  <span className="font-bold text-foreground">
                    Total Amount Due:
                  </span>
                  <span className="text-2xl font-bold text-foreground tabular-nums">
                    PHP {selectedTicket.totalFine.toLocaleString()}
                  </span>
                </div>

                <div>
                  <h3 className="text-sm font-semibold text-foreground mb-3">
                    Select Payment Method
                  </h3>
                  <div className="flex gap-2">
                    <button
                      onClick={() =>
                        setPaymentMethod("Cash (Over-the-counter)")
                      }
                      className={`flex-1 py-2 text-sm font-semibold rounded-lg border transition-all ${
                        paymentMethod === "Cash (Over-the-counter)"
                          ? "bg-muted border-border text-foreground"
                          : "bg-card border-border text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      Cash (OTC)
                    </button>
                    <button
                      onClick={() => setPaymentMethod("GCash")} // GCash as fallback channel
                      className={`flex-1 py-2 text-sm font-semibold rounded-lg border transition-all ${
                        paymentMethod === "GCash"
                          ? "bg-muted border-border text-foreground"
                          : "bg-card border-border text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      GCash
                    </button>
                    <button
                      onClick={() => setPaymentMethod("QRPh")}
                      className={`flex-1 py-2 text-sm font-semibold rounded-lg border transition-all ${
                        paymentMethod === "QRPh"
                          ? "bg-muted border-border text-foreground"
                          : "bg-card border-border text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      Maya
                    </button>
                  </div>
                </div>

                <div>
                  <input
                    type="text"
                    value={orNumber}
                    onChange={(e) => setOrNumber(e.target.value)}
                    placeholder="Enter Official Receipt (OR) Number"
                    className="w-full rounded-lg border border-border bg-card px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="p-6 border-t border-border bg-card space-y-3">
                <button
                  onClick={handleConfirmSettle}
                  className="w-full flex items-center justify-center rounded-xl bg-blue-600 px-4 py-3.5 text-sm font-semibold text-white hover:bg-blue-700 transition-colors shadow-sm"
                >
                  Confirm & Mark as Paid
                </button>
                <button className="w-full rounded-xl border border-border bg-card px-4 py-3.5 text-sm font-bold text-foreground hover:bg-muted transition-colors">
                  Generate Statement
                </button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
