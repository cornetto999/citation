import type { TicketStatus } from "@/types";
import { cn } from "@/lib/utils";

const styles: Record<TicketStatus, string> = {
  Paid: "bg-paid text-paid-foreground",
  Unpaid: "bg-unpaid text-unpaid-foreground",
  Overdue: "bg-overdue text-overdue-foreground",
  Contested: "bg-contested text-contested-foreground",
};

export function StatusBadge({
  status,
  className,
}: {
  status: TicketStatus;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-wide",
        styles[status],
        className,
      )}
    >
      <span className="size-1.5 rounded-full bg-current" />
      {status}
    </span>
  );
}
