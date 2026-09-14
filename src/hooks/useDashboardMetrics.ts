import { useMemo } from 'react';
import { useTicketStore } from '@/store/useTicketStore';

export function useDashboardMetrics() {
  const { tickets } = useTicketStore();

  return useMemo(() => {
    // Basic Metrics
    const totalTickets = tickets.length;
    
    // Time-based filtering (mocking 'today' and 'yesterday')
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    const todayTickets = tickets.filter(t => t.issuedAt.startsWith(todayStr));
    const yesterdayTickets = tickets.filter(t => t.issuedAt.startsWith(yesterdayStr));
    
    const todayCount = todayTickets.length;
    const yesterdayCount = yesterdayTickets.length;
    const apprehensionsTrend = yesterdayCount === 0 
      ? 100 
      : Math.round(((todayCount - yesterdayCount) / yesterdayCount) * 100);

    // Collection Rate
    const paidTickets = tickets.filter(t => t.status === 'Paid').length;
    const collectionRate = totalTickets > 0 ? Math.round((paidTickets / totalTickets) * 100) : 0;

    // Total Revenue (Cashier vs Online)
    // Note: Since payment methods aren't explicitly tracked in the existing ticket schema,
    // we will simulate this for the chart based on location/status if necessary,
    // but total revenue is exact.
    const totalRevenue = tickets.reduce((sum, t) => sum + (t.payment?.amount || 0), 0);

    // Most Frequent Violation
    const violationCounts = tickets.reduce((acc, t) => {
      t.violations.forEach(v => {
        acc[v.label] = (acc[v.label] || 0) + 1;
      });
      return acc;
    }, {} as Record<string, number>);
    
    const mostFrequentViolation = Object.entries(violationCounts)
      .sort((a, b) => b[1] - a[1])[0] || ['None', 0];

    // Data for charts
    // 1. 7-Day Trend (Tickets Issued vs Paid)
    const trendData = Array.from({ length: 7 }).map((_, i) => {
      const d = new Date(now);
      d.setDate(d.getDate() - (6 - i));
      const dateStr = d.toISOString().split('T')[0];
      const shortName = d.toLocaleDateString('en-US', { weekday: 'short' });
      
      const dayTickets = tickets.filter(t => t.issuedAt.startsWith(dateStr));
      const issued = dayTickets.length;
      const paid = dayTickets.filter(t => t.status === 'Paid').length;
      
      return { name: shortName, issued, paid };
    });

    // 2. Payment Methods Pie Data
    // Simulating Payment Methods: 'Online' vs 'OTC'
    const onlinePayments = Math.floor(paidTickets * 0.4); // 40% online simulation
    const otcPayments = paidTickets - onlinePayments;
    const paymentMethodData = [
      { name: 'Online (PayMongo)', value: onlinePayments },
      { name: 'OTC (Cashier)', value: otcPayments },
    ];

    // 3. Enforcer Leaderboard (Top 3 Today)
    const enforcerCounts = todayTickets.reduce((acc, t) => {
      acc[t.issuedBy] = (acc[t.issuedBy] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const leaderboard = Object.entries(enforcerCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 3);

    // 4. Live Command Feed (Recent 5 tickets)
    const recentTickets = [...tickets]
      .sort((a, b) => new Date(b.issuedAt).getTime() - new Date(a.issuedAt).getTime())
      .slice(0, 5);

    return {
      totalTickets,
      todayCount,
      apprehensionsTrend,
      collectionRate,
      totalRevenue,
      mostFrequentViolation: { name: mostFrequentViolation[0], count: mostFrequentViolation[1] },
      trendData,
      paymentMethodData,
      leaderboard,
      recentTickets
    };
  }, [tickets]);
}
