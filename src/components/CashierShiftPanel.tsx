import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Banknote, LoaderCircle, LockKeyhole, Wallet } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { peso } from "@/lib/format";
import { receiptDate } from "@/lib/receipt";
import { treasuryRequest, useCashierShifts } from "@/lib/treasury-client";

export function CashierShiftPanel({ compact = false }: { compact?: boolean }) {
  const shifts = useCashierShifts();
  const queryClient = useQueryClient();
  const [openingCash, setOpeningCash] = useState("");
  const [countedCash, setCountedCash] = useState("");
  const [reason, setReason] = useState("");
  const [closing, setClosing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const current = shifts.data?.current;
  const counted = Number(countedCash);
  const difference =
    Math.round((counted - (current?.expectedCash ?? 0)) * 100) / 100;
  const closeValid =
    countedCash !== "" &&
    Number.isFinite(counted) &&
    counted >= 0 &&
    (difference === 0 || reason.trim().length >= 3);
  const openValid =
    openingCash !== "" &&
    Number.isFinite(Number(openingCash)) &&
    Number(openingCash) >= 0;
  const submit = async (action: "open" | "close") => {
    if (busy || (action === "open" ? !openValid : !closeValid || !current))
      return;
    setBusy(true);
    setError("");
    try {
      await treasuryRequest(`shifts/${action}`, {
        method: "POST",
        body: JSON.stringify(
          action === "open"
            ? { openingCash: Number(openingCash) }
            : {
                shiftId: current!.id,
                countedCash: counted,
                reason: reason.trim(),
              },
        ),
      });
      await queryClient.invalidateQueries({ queryKey: ["treasury"] });
      setClosing(false);
      setOpeningCash("");
      setCountedCash("");
      setReason("");
      toast.success(
        action === "open"
          ? "Cashier shift opened."
          : "Cashier shift closed and reconciled.",
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to save the shift. Your entries have been kept.",
      );
    } finally {
      setBusy(false);
    }
  };

  if (shifts.isLoading)
    return (
      <p
        role="status"
        className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground"
      >
        Checking cashier shift…
      </p>
    );
  if (shifts.isError)
    return (
      <div
        role="alert"
        className="rounded-xl border border-destructive/30 bg-card p-4 text-sm"
      >
        <p>{shifts.error.message}</p>
        <button
          onClick={() => void shifts.refetch()}
          className="mt-2 font-semibold text-foreground"
        >
          Retry shift status
        </button>
      </div>
    );
  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-border bg-card p-5 shadow-panel">
        {current ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-foreground">
                  <Wallet className="size-5" />
                </span>
                <div>
                  <h2 className="font-bold">
                    Shift open{" "}
                    <span className="ml-2 rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">
                      Active
                    </span>
                  </h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {current.cashierName} · {receiptDate(current.openedAt)}
                  </p>
                </div>
              </div>
              <div className="flex gap-3">
                {compact && (
                  <Link
                    to="/treasury/shifts"
                    className="inline-flex min-h-10 items-center text-sm font-semibold text-foreground"
                  >
                    Shift history
                  </Link>
                )}
                <button
                  onClick={() => {
                    setClosing(true);
                    setError("");
                  }}
                  className="min-h-10 rounded-xl border border-border px-4 text-sm font-semibold"
                >
                  Close shift
                </button>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2 border-t border-border pt-4">
              {[
                ["Opening float", current.openingCash],
                ["Cash collected", current.cashCollected],
                ["Expected drawer", current.expectedCash],
              ].map(([label, value]) => (
                <div key={label}>
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="mt-1 text-base font-bold sm:text-xl">
                    {peso(Number(value))}
                  </p>
                </div>
              ))}
            </div>
          </>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void submit("open");
            }}
            className="flex flex-wrap items-end gap-4"
          >
            <div className="min-w-0 flex-1">
              <h2 className="flex items-center gap-2 font-bold">
                <Banknote className="size-5 text-foreground" /> Open your
                cashier shift
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Enter the cash already in your drawer before accepting payments.
              </p>
            </div>
            <div>
              <label
                htmlFor="opening-cash"
                className="mb-1 block text-xs font-semibold"
              >
                Opening cash / float
              </label>
              <input
                id="opening-cash"
                type="number"
                step="0.01"
                min="0"
                inputMode="decimal"
                required
                value={openingCash}
                onChange={(e) => setOpeningCash(e.target.value)}
                placeholder="0.00"
                disabled={busy}
                className="h-11 w-40 rounded-xl border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <button
              disabled={!openValid || busy}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground disabled:opacity-40"
            >
              {busy && <LoaderCircle className="size-4 animate-spin" />}Open
              shift
            </button>
          </form>
        )}
        {error && !closing && (
          <p role="alert" className="mt-3 text-sm text-destructive">
            {error}
          </p>
        )}
      </section>
      {!compact && (
        <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-panel">
          <h2 className="border-b border-border px-5 py-4 font-bold">
            Shift history
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/30 text-xs text-muted-foreground">
                <tr>
                  {[
                    "Cashier / opened",
                    "Status",
                    "Expected",
                    "Counted",
                    "Difference / explanation",
                  ].map((label) => (
                    <th key={label} className="px-4 py-3 font-semibold">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {shifts.data?.shifts.map((shift) => (
                  <tr key={shift.id}>
                    <td className="px-4 py-4">
                      <p className="font-semibold">{shift.cashierName}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {receiptDate(shift.openedAt)}
                      </p>
                      {shift.closedAt && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Closed {receiptDate(shift.closedAt)}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      <span
                        className={`rounded-full px-2 py-1 text-xs font-semibold ${shift.status === "open" ? "bg-emerald-50 text-emerald-700" : "bg-muted text-muted-foreground"}`}
                      >
                        {shift.status === "open" ? "Open" : "Closed"}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-4 font-semibold">
                      {peso(shift.expectedCash)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-4">
                      {shift.countedCash == null
                        ? "—"
                        : peso(shift.countedCash)}
                    </td>
                    <td className="max-w-xs px-4 py-4">
                      <p
                        className={
                          shift.difference
                            ? "font-semibold text-destructive"
                            : "font-semibold"
                        }
                      >
                        {shift.difference == null
                          ? "—"
                          : peso(shift.difference)}
                      </p>
                      {shift.reason && (
                        <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">
                          {shift.reason}
                        </p>
                      )}
                    </td>
                  </tr>
                ))}
                {!shifts.data?.shifts.length && (
                  <tr>
                    <td
                      colSpan={5}
                      className="p-10 text-center text-muted-foreground"
                    >
                      Your cashier shifts will appear here after you open a
                      shift.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}
      <Dialog
        open={closing}
        onOpenChange={(open) => {
          if (!busy) setClosing(open);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Close and reconcile shift</DialogTitle>
            <DialogDescription>
              Count the cash in your drawer, including the opening float.
              Closing locks this shift's reconciliation.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-xl bg-muted/40 p-4">
              <p className="text-xs text-muted-foreground">
                Expected cash in drawer
              </p>
              <p className="mt-1 text-2xl font-bold">
                {peso(current?.expectedCash ?? 0)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Opening float plus cash payments recorded in this shift.
              </p>
            </div>
            <div>
              <label htmlFor="counted-cash" className="text-sm font-semibold">
                Counted cash
              </label>
              <input
                id="counted-cash"
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={countedCash}
                onChange={(e) => setCountedCash(e.target.value)}
                disabled={busy}
                className="mt-2 h-12 w-full rounded-xl border border-input bg-background px-4 text-lg outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            {countedCash !== "" && (
              <p
                className={`text-sm font-semibold ${difference ? "text-destructive" : "text-emerald-200"}`}
              >
                {difference === 0
                  ? "Balanced"
                  : `${difference < 0 ? "Short" : "Over"} by ${peso(Math.abs(difference))}`}
              </p>
            )}
            <div>
              <label htmlFor="shift-reason" className="text-sm font-semibold">
                {difference
                  ? "Discrepancy explanation (required)"
                  : "Closing note (optional)"}
              </label>
              <textarea
                id="shift-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                disabled={busy}
                maxLength={2000}
                rows={3}
                className="mt-2 w-full rounded-xl border border-input bg-background p-3 text-sm outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
          </div>
          <DialogFooter>
            <button
              onClick={() => setClosing(false)}
              disabled={busy}
              className="min-h-11 rounded-xl border border-border px-4 text-sm font-semibold"
            >
              Keep open
            </button>
            <button
              onClick={() => void submit("close")}
              disabled={busy || !closeValid}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground disabled:opacity-40"
            >
              {busy ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <LockKeyhole className="size-4" />
              )}
              Close shift
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
