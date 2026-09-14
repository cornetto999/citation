import { createFileRoute } from "@tanstack/react-router";
import { useTicketStore } from "@/store/useTicketStore";
import { useMemo } from "react";
import { Activity, ShieldAlert, CheckCircle2, AlertTriangle, PhilippinePeso } from "lucide-react";

export const Route = createFileRoute("/admin/")({
  component: AdminDashboard,
});

function AdminDashboard() {
  const { tickets } = useTicketStore();

  const metrics = useMemo(() => {
    const totalTickets = tickets.length;
    const unpaidTickets = tickets.filter(
      (t) => t.status === "Unpaid" || t.status === "Overdue"
    ).length;
    
    const totalRevenue = tickets.reduce((sum, t) => sum + (t.payment?.amount || 0), 0);

    const vehicleTypeCounts = tickets.reduce((acc, t) => {
      acc[t.vehicleType] = (acc[t.vehicleType] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return { totalTickets, unpaidTickets, totalRevenue, vehicleTypeCounts };
  }, [tickets]);

  return (
    <div className="space-y-6 max-w-5xl mx-auto py-6">
      <div>
        <h1 className="text-3xl font-display font-bold text-slate-900 tracking-tight">
          System Overview
        </h1>
        <p className="text-slate-500 mt-2">
          Global monitoring of all citations and revenue across the municipality.
        </p>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="bg-blue-100 p-3 rounded-xl text-blue-600">
              <Activity className="size-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-500">Total Citations</p>
              <p className="text-2xl font-bold text-slate-900">{metrics.totalTickets}</p>
            </div>
          </div>
        </div>
        
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="bg-green-100 p-3 rounded-xl text-green-600">
              <PhilippinePeso className="size-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-500">Total Revenue</p>
              <p className="text-2xl font-bold text-slate-900">₱{metrics.totalRevenue.toLocaleString()}</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="bg-amber-100 p-3 rounded-xl text-amber-600">
              <AlertTriangle className="size-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-500">Unpaid Tickets</p>
              <p className="text-2xl font-bold text-slate-900">{metrics.unpaidTickets}</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="bg-emerald-100 p-3 rounded-xl text-emerald-600">
              <CheckCircle2 className="size-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-500">Collection Rate</p>
              <p className="text-2xl font-bold text-slate-900">
                {metrics.totalTickets > 0 
                  ? Math.round(((metrics.totalTickets - metrics.unpaidTickets) / metrics.totalTickets) * 100) 
                  : 0}%
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
          <ShieldAlert className="size-5 text-slate-400" />
          Recent Citations
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-slate-50 text-slate-500 border-y border-slate-200">
              <tr>
                <th className="px-4 py-3 font-medium">Ticket ID</th>
                <th className="px-4 py-3 font-medium">Date Issued</th>
                <th className="px-4 py-3 font-medium">Violator</th>
                <th className="px-4 py-3 font-medium">Vehicle</th>
                <th className="px-4 py-3 font-medium">Fine</th>
                <th className="px-4 py-3 font-medium">Issued By</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {tickets.slice(0, 10).map((ticket) => (
                <tr key={ticket.id} className="hover:bg-slate-50/50">
                  <td className="px-4 py-3 font-medium text-slate-900">{ticket.id.slice(0, 8)}...</td>
                  <td className="px-4 py-3 text-slate-500">
                    {new Date(ticket.issuedAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-slate-900">{ticket.violatorName}</td>
                  <td className="px-4 py-3 text-slate-500">{ticket.vehicleType}</td>
                  <td className="px-4 py-3 font-medium">₱{ticket.totalFine}</td>
                  <td className="px-4 py-3 text-slate-500">{ticket.issuedBy}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                      ticket.status === 'Paid' ? 'bg-emerald-100 text-emerald-700' :
                      ticket.status === 'Overdue' ? 'bg-red-100 text-red-700' :
                      ticket.status === 'Contested' ? 'bg-amber-100 text-amber-700' :
                      'bg-slate-100 text-slate-700'
                    }`}>
                      {ticket.status}
                    </span>
                  </td>
                </tr>
              ))}
              {tickets.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                    No citations found in the database.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
