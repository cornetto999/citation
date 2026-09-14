import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useAuthStore } from "@/store/useAuthStore";
import { useTicketStore } from "@/store/useTicketStore";
import { dateTime, peso } from "@/lib/format";
import { Search } from "lucide-react";

export const Route = createFileRoute("/treasury/transactions")({
  head: () => ({
    meta: [{ title: "Transactions | Municipal Treasury" }],
  }),
  component: TreasuryTransactionsPage,
});

function TreasuryTransactionsPage() {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const tickets = useTicketStore((s) => s.tickets);

  useEffect(() => {
    if (!user || user.role !== "treasury") {
      navigate({ to: "/login" });
    }
  }, [user, navigate]);

  const [query, setQuery] = useState("");

  const transactions = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tickets
      .filter((t) => t.status === "Paid" && t.payment)
      .filter(
        (t) =>
          !q ||
          t.id.toLowerCase().includes(q) ||
          t.violatorName.toLowerCase().includes(q) ||
          t.payment?.orNumber.toLowerCase().includes(q) ||
          t.payment?.channel.toLowerCase().includes(q),
      )
      .sort(
        (a, b) =>
          new Date(b.payment!.paidAt).getTime() -
          new Date(a.payment!.paidAt).getTime(),
      );
  }, [tickets, query]);

  if (!user || user.role !== "treasury") return null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-xl font-bold">Transaction History</h2>
      </div>

      <div className="rounded-xl border border-border bg-card shadow-panel">
        <div className="border-b border-border p-4">
          <div className="relative max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search OR No., Ticket, Name, or Channel"
              className="h-10 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-sm outline-none focus:border-ring"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-semibold">OR Number</th>
                <th className="px-4 py-3 font-semibold">Ticket No.</th>
                <th className="px-4 py-3 font-semibold">Violator</th>
                <th className="px-4 py-3 font-semibold">Channel</th>
                <th className="px-4 py-3 font-semibold">Date Paid</th>
                <th className="px-4 py-3 text-right font-semibold">Amount</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((t) => (
                <tr
                  key={t.id}
                  className="border-b border-border/60 last:border-0 hover:bg-muted/50"
                >
                  <td className="px-4 py-3 font-mono text-xs font-semibold">
                    {t.payment!.orNumber}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                    {t.id}
                  </td>
                  <td className="px-4 py-3 font-semibold">{t.violatorName}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {t.payment!.channel}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {dateTime(t.payment!.paidAt)}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold tabular">
                    {peso(t.totalFine)}
                  </td>
                </tr>
              ))}
              {transactions.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-12 text-center text-muted-foreground"
                  >
                    No transactions match your search.
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
