import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Users, Shield, BadgeCheck, Loader2 } from "lucide-react";
import type { User } from "@/types";

export const Route = createFileRoute("/admin/manage")({
  component: AdminManageUsers,
});

function AdminManageUsers() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchUsers() {
      const { data, error } = await supabase.from("users").select("*").order("role");
      if (data) setUsers(data as User[]);
      if (error) console.error("Error fetching users:", error);
      setLoading(false);
    }
    fetchUsers();
  }, []);

  return (
    <div className="space-y-6 max-w-5xl mx-auto py-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Users className="size-8 text-primary" />
            Manage Users
          </h1>
          <p className="text-slate-500 mt-2">
            View all registered system accounts across the municipality.
          </p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex justify-center p-12">
            <Loader2 className="size-8 animate-spin text-primary/50" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="px-6 py-4 font-medium">Name</th>
                  <th className="px-6 py-4 font-medium">Credential</th>
                  <th className="px-6 py-4 font-medium">Role</th>
                  <th className="px-6 py-4 font-medium">Assigned Unit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.map((user) => (
                  <tr key={user.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="size-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 font-bold">
                          {user.name.charAt(0)}
                        </div>
                        <span className="font-medium text-slate-900">{user.name}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-slate-500">{user.credential}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold uppercase tracking-wider
                        ${user.role === 'admin' ? 'bg-indigo-100 text-indigo-700' : ''}
                        ${user.role === 'enforcer' ? 'bg-blue-100 text-blue-700' : ''}
                        ${user.role === 'pnp' ? 'bg-rose-100 text-rose-700' : ''}
                        ${user.role === 'treasury' ? 'bg-amber-100 text-amber-700' : ''}
                        ${user.role === 'violator' ? 'bg-slate-100 text-slate-700' : ''}
                      `}>
                        {user.role === 'admin' && <Shield className="size-3" />}
                        {user.role === 'pnp' && <Shield className="size-3" />}
                        {user.role === 'enforcer' && <BadgeCheck className="size-3" />}
                        {user.role}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-slate-600">{user.unit}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
