import type { Payment, Ticket, TicketStatus, ViolationCode } from "@/types";
export type DbRow = Record<string, unknown>;
export function mapPayment(p: DbRow): Payment {
  return {
    id: String(p["id"]),
    ticketId: String(p["ticket_id"]),
    amount: Number(p["amount"]),
    channel: p["channel"] as Payment["channel"],
    paidAt: String(p["paid_at"]),
    receivedBy: String(p["received_by"]),
    orNumber: String(p["or_number"]),
    ...(p["received_by_id"]
      ? { receivedById: String(p["received_by_id"]) }
      : {}),
    ...(p["shift_id"] ? { shiftId: String(p["shift_id"]) } : {}),
  };
}
export function mapTicket(t: DbRow): Ticket {
  return {
    id: String(t["id"]),
    plateNo: String(t["plate_no"]),
    vehicleType: String(t["vehicle_type"]),
    violatorName: String(t["violator_name"]),
    licenseNo: String(t["license_no"]),
    violations: t["violations"] as ViolationCode[],
    totalFine: Number(t["total_fine"]),
    location: String(t["location"]),
    remarks: t["remarks"] ? String(t["remarks"]) : undefined,
    photoData: t["photo_name"] ? String(t["photo_name"]) : undefined,
    hasPhoto: Boolean(t["has_photo"] || t["photo_name"]),
    status: (t["status"] === "Unpaid" &&
    new Date(String(t["due_date"])).getTime() < Date.now()
      ? "Overdue"
      : t["status"]) as TicketStatus,
    issuedAt: String(t["issued_at"]),
    dueDate: String(t["due_date"]),
    issuedBy: String(t["issued_by"]),
    ...(t["issued_by_id"] ? { issuedById: String(t["issued_by_id"]) } : {}),
    ...(t["access_token"] ? { accessToken: String(t["access_token"]) } : {}),
    ruleVersion: Number(t["rule_version"] ?? 1),
    payment: t["payment"] ? mapPayment(t["payment"] as DbRow) : undefined,
    endorsedAt: t["endorsed_at"] ? String(t["endorsed_at"]) : undefined,
    endorsedBy: t["endorsed_by"] ? String(t["endorsed_by"]) : undefined,
    endorsementNote: t["endorsement_note"]
      ? String(t["endorsement_note"])
      : undefined,
  };
}
export function camelRow(row: DbRow): DbRow {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      key
        .replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())
        .replace("beforeData", "before")
        .replace("afterData", "after"),
      value,
    ]),
  );
}
export const emptySummary = {
  totalTickets: 0,
  todayCount: 0,
  yesterdayCount: 0,
  apprehensionsTrend: null as number | null,
  collectionRate: 0,
  totalRevenue: 0,
  revenueToday: 0,
  pendingAmount: 0,
  pendingCount: 0,
  overdueCount: 0,
  overdueAmount: 0,
  oldestOverdueDays: 0,
  unpaidCount: 0,
  paidCount: 0,
  contestedCount: 0,
  flaggedCount: 0,
  flaggedAmount: 0,
  unflaggedOverdueCount: 0,
  pendingInvitations: 0,
  paymentExceptions: 0,
  paymentExceptionCount: 0,
  settledToday: 0,
  mostFrequentViolation: { name: "None", count: 0 },
  topViolations: [] as { name: string; count: number }[],
  trendData: [] as { name: string; issued: number; paid: number }[],
  paymentMethodData: [] as { name: string; value: number }[],
  leaderboard: [] as { name: string; count: number }[],
  recentTickets: [] as Ticket[],
  recentTransactions: [] as Ticket[],
};
