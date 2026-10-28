const STORAGE_KEY = "citation-payment-recovery:v1";
const MAX_AGE = 7 * 24 * 60 * 60 * 1000;
export interface PaymentRecovery {
  ticketId: string;
  linkId: string;
  savedAt: number;
}

export function readPaymentRecovery(
  storage?: Storage,
  now = Date.now(),
): PaymentRecovery | null {
  try {
    storage ??= localStorage;
    const value = JSON.parse(
      storage.getItem(STORAGE_KEY) ?? "null",
    ) as PaymentRecovery | null;
    if (!value) return null;
    if (
      typeof value.ticketId !== "string" ||
      typeof value.linkId !== "string" ||
      !Number.isFinite(value.savedAt) ||
      value.savedAt > now ||
      now - value.savedAt >= MAX_AGE
    ) {
      storage.removeItem(STORAGE_KEY);
      return null;
    }
    return {
      ticketId: value.ticketId,
      linkId: value.linkId,
      savedAt: value.savedAt,
    };
  } catch {
    return null;
  }
}

/** Access tokens, license numbers, payer names and checkout URLs are never persisted. */
export function savePaymentRecovery(value: PaymentRecovery, storage?: Storage) {
  try {
    storage ??= localStorage;
    storage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        ticketId: value.ticketId,
        linkId: value.linkId,
        savedAt: value.savedAt,
      }),
    );
  } catch {
    /* The open page can still verify the payment. */
  }
}
export function clearPaymentRecovery(storage?: Storage) {
  try {
    storage ??= localStorage;
    storage.removeItem(STORAGE_KEY);
  } catch {
    /* Storage may be disabled. */
  }
}
