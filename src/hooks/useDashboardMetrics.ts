import { useMemo } from "react";
import { useTicketStore } from "@/store/useTicketStore";
import { localDateKey } from "@/lib/format";
import type { Payment } from "@/types";

/** Groups raw payment channels into the buckets shown on charts. */
export function channelGroup(channel: Payment["channel"] | undefined) {
  if (!channel) return "Other";
  if (channel.startsWith("Cash")) return "Cash (OTC)";
  if (channel === "GCash") return "GCash";
  if (channel === "Maya") return "Maya";
  return "Online / QRPh";
}

export function useDashboardMetrics() {
  const tickets = useTicketStore((s) => s.tickets);

  return useMemo(() => {
    const totalTickets = tickets.length;

    // Use local dates so "today" is correct in PH time (UTC+8), not UTC.
    const now = new Date();
    const todayKey = localDateKey(now);
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayKey = localDateKey(yesterday);

    const todayTickets = tickets.filter(
      (t) => localDateKey(t.issuedAt) === todayKey,
    );
    const yesterdayCount = tickets.filter(
      (t) => localDateKey(t.issuedAt) === yesterdayKey,
    ).length;
    const todayCount = todayTickets.length;

    // null when there's nothing to compare against, so the UI can say so
    const apprehensionsTrend =
      yesterdayCount === 0
        ? null
        : Math.round(((todayCount - yesterdayCount) / yesterdayCount) * 100);

    const paidTickets = tickets.filter((t) => t.status === "Paid");
    const unpaidTickets = tickets.filter((t) => t.status !== "Paid");
    const overdueTickets = tickets.filter((t) => t.status === "Overdue");

    const collectionRate =
      totalTickets > 0
        ? Math.round((paidTickets.length / totalTickets) * 100)
        : 0;

    const totalRevenue = tickets.reduce(
      (sum, t) => sum + (t.payment?.amount ?? 0),
      0,
    );
    const pendingAmount = unpaidTickets.reduce((s, t) => s + t.totalFine, 0);

    const revenueToday = tickets
      .filter((t) => t.payment && localDateKey(t.payment.paidAt) === todayKey)
      .reduce((s, t) => s + (t.payment?.amount ?? 0), 0);

    // Most frequent violations
    const violationCounts = tickets.reduce(
      (acc, t) => {
        t.violations.forEach((v) => {
          acc[v.label] = (acc[v.label] || 0) + 1;
        });
        return acc;
      },
      {} as Record<string, number>,
    );
    const topViolations = Object.entries(violationCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
    const mostFrequentViolation = topViolations[0] ?? {
      name: "None",
      count: 0,
    };

    // 7-day trend (issued vs paid, by local day)
    const trendData = Array.from({ length: 7 }).map((_, i) => {
      const d = new Date(now);
      d.setDate(d.getDate() - (6 - i));
      const key = localDateKey(d);
      const issued = tickets.filter(
        (t) => localDateKey(t.issuedAt) === key,
      ).length;
      const paid = tickets.filter(
        (t) => t.payment && localDateKey(t.payment.paidAt) === key,
      ).length;
      return {
        name: d.toLocaleDateString("en-US", { weekday: "short" }),
        issued,
        paid,
      };
    });

    // Real payment channel breakdown
    const channelTotals = paidTickets.reduce(
      (acc, t) => {
        const g = channelGroup(t.payment?.channel);
        acc[g] = (acc[g] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );
    const paymentMethodData = Object.entries(channelTotals)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    // Enforcer leaderboard (top 3 today)
    const enforcerCounts = todayTickets.reduce(
      (acc, t) => {
        acc[t.issuedBy] = (acc[t.issuedBy] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );
    const leaderboard = Object.entries(enforcerCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 3);

    const recentTickets = [...tickets]
      .sort(
        (a, b) =>
          new Date(b.issuedAt).getTime() - new Date(a.issuedAt).getTime(),
      )
      .slice(0, 6);

    return {
      totalTickets,
      todayCount,
      yesterdayCount,
      apprehensionsTrend,
      collectionRate,
      totalRevenue,
      revenueToday,
      pendingAmount,
      pendingCount: unpaidTickets.length,
      overdueCount: overdueTickets.length,
      mostFrequentViolation,
      topViolations,
      trendData,
      paymentMethodData,
      leaderboard,
      recentTickets,
    };
  }, [tickets]);
}
