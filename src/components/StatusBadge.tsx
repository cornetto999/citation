import type { TicketStatus } from "@/types";
import { cn } from "@/lib/utils";

const styles: Record<TicketStatus, string> = {
  Paid: "bg-paid text-paid-foreground",
  Unpaid: "bg-unpaid text-unpaid-foreground",
  Overdue: "bg-overdue text-overdue-foreground",
  Contested: "bg-contested text-contested-foreground",
};

const dotStyles: Record<TicketStatus, string> = {
  Paid: "bg-paid-foreground",
  Unpaid: "bg-unpaid-foreground",
  Overdue: "bg-overdue-foreground animate-pulse",
  Contested: "bg-contested-foreground animate-pulse-soft",
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
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider transition-all",
        styles[status],
        className,
      )}
    >
      <span
        className={cn("size-1.5 rounded-full", dotStyles[status])}
      />
      {status}
    </span>
  );
}
