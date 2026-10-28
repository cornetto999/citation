export interface BatchEndorsementResult {
  ticketId: string;
  ok: boolean;
  error?: string;
}

/** A missing or ambiguous response never removes a citation from review. */
export function reconcileEndorsementResults(
  requestedIds: string[],
  results: BatchEndorsementResult[],
): BatchEndorsementResult[] {
  return [...new Set(requestedIds)].map((ticketId) => {
    const matches = results.filter((result) => result.ticketId === ticketId);
    if (matches.length !== 1)
      return {
        ticketId,
        ok: false,
        error:
          "The result could not be confirmed. Refresh this citation before retrying.",
      };
    const result = matches[0]!;
    return result.ok === true
      ? { ticketId, ok: true }
      : {
          ticketId,
          ok: false,
          error:
            result.error ||
            "Unable to endorse this citation. Review its current status.",
        };
  });
}
