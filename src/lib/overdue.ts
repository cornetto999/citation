import type { Ticket } from "@/types";

const DAY_MS = 86_400_000;

/** Sum of the base violation fines (before any surcharge). */
export const baseFine = (t: Ticket) =>
  t.violations.reduce((sum, v) => sum + v.fine, 0);

/**
 * Surcharge already included in `totalFine` (total minus base fines).
 * Kept in sync with the admin ticket detail view.
 */
export const surchargeOf = (t: Ticket) =>
  Math.max(0, t.totalFine - baseFine(t));

/** Whole days past the due date (minimum 1 once a ticket is overdue). */
export const daysOverdue = (t: Ticket) => {
  const diff = Date.now() - new Date(t.dueDate).getTime();
  if (diff <= 0) return 0;
  return Math.max(1, Math.ceil(diff / DAY_MS));
};

export const agingBuckets = [
  "Any age",
  "1–7 days",
  "8–30 days",
  "31+ days",
] as const;
export type AgingBucket = (typeof agingBuckets)[number];

export const inAgingBucket = (days: number, bucket: AgingBucket) => {
  switch (bucket) {
    case "1–7 days":
      return days >= 1 && days <= 7;
    case "8–30 days":
      return days >= 8 && days <= 30;
    case "31+ days":
      return days >= 31;
    default:
      return true;
  }
};

export const isOverdue = (t: Ticket) => t.status === "Overdue";
