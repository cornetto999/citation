import { createFileRoute } from "@tanstack/react-router";
import { useDashboardMetrics } from "@/hooks/useDashboardMetrics";
import { 
  Activity, 
  PhilippinePeso, 
  CheckCircle2, 
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Trophy,
  Clock
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
  Legend
} from "recharts";

export const Route = createFileRoute("/admin/")({
  component: AdminDashboard,
});

const PIE_COLORS = ['#6366f1', '#10b981'];

function AdminDashboard() {
  const metrics = useDashboardMetrics();

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Dashboard Overview</h1>
        <p className="text-sm text-slate-500 mt-1">
          Monitor your municipality's real-time apprehension and revenue metrics.
        </p>
      </div>

      {/* A. Executive KPI Cards (Top Row - 4 columns) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {/* Total Apprehensions */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-slate-500">Total Apprehensions</h3>
            <div className="bg-blue-50 p-2 rounded-lg text-blue-600">
              <Activity className="size-5" />
            </div>
          </div>
          <div>
            <p className="text-2xl font-bold text-slate-900">{metrics.todayCount}</p>
            <div className="flex items-center gap-1.5 mt-2">
              {metrics.apprehensionsTrend >= 0 ? (
                <span className="flex items-center text-xs font-medium text-emerald-600">
                  <TrendingUp className="size-3.5 mr-1" />
                  +{metrics.apprehensionsTrend}%
                </span>
              ) : (
                <span className="flex items-center text-xs font-medium text-rose-600">
                  <TrendingDown className="size-3.5 mr-1" />
                  {metrics.apprehensionsTrend}%
                </span>
              )}
              <span className="text-xs text-slate-400">vs yesterday</span>
            </div>
          </div>
        </div>
        
        {/* Collection Rate */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-slate-500">Collection Rate</h3>
            <div className="bg-emerald-50 p-2 rounded-lg text-emerald-600">
              <CheckCircle2 className="size-5" />
            </div>
          </div>
          <div>
            <p className="text-2xl font-bold text-slate-900">{metrics.collectionRate}%</p>
            <p className="text-xs text-slate-400 mt-2">Percentage paid vs. pending</p>
          </div>
        </div>

        {/* Total Revenue */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-slate-500">Total Revenue</h3>
            <div className="bg-indigo-50 p-2 rounded-lg text-indigo-600">
              <PhilippinePeso className="size-5" />
            </div>
          </div>
          <div>
            <p className="text-2xl font-bold text-slate-900">₱{metrics.totalRevenue.toLocaleString()}</p>
            <p className="text-xs text-slate-400 mt-2">Across all payment channels</p>
          </div>
        </div>

        {/* Most Frequent Violation */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-slate-500">Top Violation</h3>
            <div className="bg-amber-50 p-2 rounded-lg text-amber-600">
              <AlertTriangle className="size-5" />
            </div>
          </div>
          <div>
            <p className="text-lg font-bold text-slate-900 leading-tight line-clamp-1" title={metrics.mostFrequentViolation.name}>
              {metrics.mostFrequentViolation.name}
            </p>
            <p className="text-xs text-slate-400 mt-2">{metrics.mostFrequentViolation.count} occurrences</p>
          </div>
        </div>
      </div>

      {/* B. Revenue & Ticket Trends (Middle Row - 2 columns) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Ticket Trends (7 Days) */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900 mb-6">Tickets Issued vs Paid (7 Days)</h2>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={metrics.trendData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                <Tooltip cursor={{ fill: '#f1f5f9' }} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '12px' }} />
                <Line type="monotone" name="Issued" dataKey="issued" stroke="#64748b" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                <Line type="monotone" name="Paid" dataKey="paid" stroke="#10b981" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Payment Methods */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900 mb-6">Payment Methods</h2>
          <div className="h-72 flex items-center justify-center">
            {metrics.paymentMethodData.reduce((a,b) => a+b.value, 0) > 0 ? (
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
                      <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                  <Legend iconType="circle" layout="vertical" verticalAlign="middle" align="right" wrapperStyle={{ fontSize: '14px' }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-slate-400 text-sm">No payment data available yet.</p>
            )}
          </div>
        </div>
      </div>

      {/* C. Operational Feeds (Bottom Row - 2 columns) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Live Command Feed */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm lg:col-span-2">
          <div className="flex items-center gap-2 mb-4">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-rose-500"></span>
            </span>
            <h2 className="text-lg font-semibold text-slate-900">Live Command Feed</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="text-slate-500 border-b border-slate-200">
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
                  <tr key={ticket.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-4 py-3 text-slate-500">
                      {new Date(ticket.issuedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-900">{ticket.plateNo}</td>
                    <td className="px-4 py-3 text-slate-500">{ticket.issuedBy}</td>
                    <td className="px-4 py-3 text-slate-600 max-w-[200px] truncate" title={ticket.violations.map(v => v.label).join(", ")}>
                      {ticket.violations[0]?.label || 'Unknown'} {ticket.violations.length > 1 && `(+${ticket.violations.length - 1} more)`}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                        ticket.status === 'Paid' ? 'bg-green-100 text-green-700' :
                        ticket.status === 'Overdue' ? 'bg-red-100 text-red-700' :
                        ticket.status === 'Contested' ? 'bg-orange-100 text-orange-700' :
                        'bg-yellow-100 text-yellow-700' // Pending/Unpaid default to yellow
                      }`}>
                        {ticket.status}
                      </span>
                    </td>
                  </tr>
                ))}
                {metrics.recentTickets.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                      No live activity.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Enforcer Leaderboard */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
            <Trophy className="size-5 text-amber-500" />
            Top Enforcers Today
          </h2>
          <div className="space-y-4 mt-6">
            {metrics.leaderboard.length > 0 ? (
              metrics.leaderboard.map((enforcer, index) => (
                <div key={enforcer.name} className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100">
                  <div className="flex items-center gap-3">
                    <div className={`flex size-8 items-center justify-center rounded-full font-bold text-sm ${
                      index === 0 ? 'bg-amber-100 text-amber-600' :
                      index === 1 ? 'bg-slate-200 text-slate-600' :
                      'bg-orange-100 text-orange-600'
                    }`}>
                      #{index + 1}
                    </div>
                    <span className="font-medium text-slate-900">{enforcer.name}</span>
                  </div>
                  <div className="text-sm font-semibold text-slate-600 bg-white px-2 py-1 rounded shadow-sm border border-slate-100">
                    {enforcer.count} tickets
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-8 text-slate-500 flex flex-col items-center gap-2">
                <Clock className="size-8 text-slate-300" />
                <p>No apprehensions yet today.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
