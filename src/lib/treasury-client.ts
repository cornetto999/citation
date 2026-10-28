import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { CashierShift, Ticket } from "@/types";

export async function treasuryRequest<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`/api/workflow/${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(
      payload?.error ||
        "Unable to load Treasury records. Retry when your connection is restored.",
    );
  }
  return payload as T;
}

export function useDebouncedSearch(value: string) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timeout = setTimeout(() => setDebounced(value.trim()), 250);
    return () => clearTimeout(timeout);
  }, [value]);
  return debounced;
}

export function useCashierShifts() {
  return useQuery({
    queryKey: ["treasury", "shifts"],
    queryFn: ({ signal }) =>
      treasuryRequest<{ current: CashierShift | null; shifts: CashierShift[] }>(
        "shifts",
        { signal },
      ),
  });
}

export interface TicketPage {
  tickets: Ticket[];
  total: number;
  page: number;
  pageSize: number;
}

export interface PaymentPage extends TicketPage {
  totalAmount: number;
  cashAmount: number;
  onlineAmount: number;
  cashiers: string[];
}

export function treasuryDateKey(value = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
}
