import { createFileRoute } from "@tanstack/react-router";
import { CashierShiftPanel } from "@/components/CashierShiftPanel";

export const Route = createFileRoute("/treasury/shifts")({
  head: () => ({ meta: [{ title: "Cashier Shifts | Municipal Treasury" }] }),
  component: TreasuryShiftsPage,
});

function TreasuryShiftsPage() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold">Cashier shifts</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Record your opening float and reconcile the cash drawer at the end of
          your shift.
        </p>
      </div>
      <CashierShiftPanel />
    </div>
  );
}
