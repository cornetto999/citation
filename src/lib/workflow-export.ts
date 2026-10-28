import type { Ticket } from "@/types";
import { workflowParams, workflowRequest } from "@/lib/workflow-client";

/** Fetch every matching page only when staff explicitly requests an export. */
export async function loadAllCitationPages(
  filters: Record<string, string | number>,
  signal?: AbortSignal,
) {
  const records = new Map<string, Ticket>();
  let expectedTotal: number | undefined;
  let expectedPageSize: number | undefined;
  for (let page = 1; ; page++) {
    const result = await workflowRequest<{
      tickets: Ticket[];
      total: number;
      pageSize: number;
    }>(
      `/api/workflow/tickets?${workflowParams({ ...filters, page, pageSize: 100 })}`,
      signal ? { signal } : undefined,
    );
    if (
      !Number.isSafeInteger(result.total) ||
      result.total < 0 ||
      !Number.isInteger(result.pageSize) ||
      result.pageSize < 1 ||
      result.pageSize > 100 ||
      !Array.isArray(result.tickets) ||
      result.tickets.length > result.pageSize ||
      (expectedPageSize !== undefined && expectedPageSize !== result.pageSize)
    )
      throw new Error(
        "The complete list could not be retrieved. Please retry the export.",
      );
    expectedPageSize = result.pageSize;
    if (expectedTotal !== undefined && expectedTotal !== result.total)
      throw new Error(
        "Citation records changed while preparing the export. Please retry for a complete list.",
      );
    expectedTotal = result.total;
    for (const ticket of result.tickets) records.set(ticket.id, ticket);
    if (page * result.pageSize >= result.total) {
      if (records.size !== result.total)
        throw new Error(
          "Citation records changed while preparing the export. Please retry for a complete list.",
        );
      return [...records.values()];
    }
    if (!result.tickets.length || result.pageSize <= 0)
      throw new Error(
        "The complete list could not be retrieved. Please retry the export.",
      );
  }
}
