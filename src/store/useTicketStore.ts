import { create } from "zustand";
import type { Payment, Ticket, TicketStatus, ViolationCode } from "@/types";
import { workflowRequest } from "@/lib/workflow-client";
export interface NewTicketInput {
  ruleVersion?: number;
  plateNo: string;
  vehicleType: string;
  violatorName: string;
  licenseNo: string;
  violations: ViolationCode[];
  location: string;
  remarks?: string | undefined;
  photoData?: string | undefined;
  issuedBy: string;
  clientRequestId?: string;
}
interface TicketState {
  tickets: Ticket[];
  total: number;
  loading: boolean;
  loaded: boolean;
  error: string | null;
  lastSyncedAt: string | null;
  fetchTickets: () => Promise<void>;
  addTicket: (input: NewTicketInput) => Promise<Ticket>;
  payTicket: (
    id: string,
    channel: Payment["channel"],
    receivedBy: string,
    orNumber?: string,
  ) => Promise<Payment | undefined>;
  setStatus: (id: string, status: TicketStatus) => Promise<void>;
  endorseToPnp: (id: string, by: string, note?: string) => Promise<void>;
  withdrawEndorsement: (id: string) => Promise<void>;
  getTicket: (id: string) => Ticket | undefined;
  subscribeToRealtime: () => () => void;
  clear: () => void;
}
let generation = 0;
const requests = new Map<string, { orNumber: string; requestId: string }>();
const post = <T>(url: string, body: unknown) =>
  workflowRequest<T>(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
const path = (id: string, action: string) =>
  `/api/workflow/tickets/${encodeURIComponent(id)}/${action}`;
export function announceWorkflowChange() {
  if (typeof window !== "undefined")
    window.dispatchEvent(new Event("citation-data-changed"));
}
export const useTicketStore = create<TicketState>((set, get) => ({
  tickets: [],
  total: 0,
  loading: false,
  loaded: false,
  error: null,
  lastSyncedAt: null,
  clear: () => {
    generation++;
    requests.clear();
    set({
      tickets: [],
      total: 0,
      loading: false,
      loaded: false,
      error: null,
      lastSyncedAt: null,
    });
  },
  fetchTickets: async () => {
    if (get().loading) return;
    const started = generation;
    set({ loading: true, error: null });
    try {
      const result = await workflowRequest<{
        tickets: Ticket[];
        total: number;
      }>("/api/workflow/tickets?pageSize=100");
      if (started === generation)
        set({
          ...result,
          loading: false,
          loaded: true,
          lastSyncedAt: new Date().toISOString(),
        });
    } catch (e) {
      if (started === generation)
        set({
          loading: false,
          loaded: true,
          error:
            e instanceof Error ? e.message : "Unable to refresh citations.",
        });
    }
  },
  addTicket: async (input) => {
    const started = generation;
    const { ticket } = await post<{ ticket: Ticket }>("/api/workflow/tickets", {
      ...input,
      clientRequestId: input.clientRequestId ?? crypto.randomUUID(),
    });
    if (started !== generation) return ticket;
    set({
      tickets: [
        ticket,
        ...get().tickets.filter((t) => t.id !== ticket.id),
      ].slice(0, 100),
    });
    announceWorkflowChange();
    return ticket;
  },
  payTicket: async (id, channel, _receivedBy, orNumber) => {
    const started = generation;
    if (channel !== "Cash (Over-the-counter)")
      throw new Error(
        "Online payments must be verified by the payment provider.",
      );
    const receipt = orNumber?.trim();
    if (!receipt) throw new Error("Enter the official receipt number.");
    let request = requests.get(id);
    if (!request || request.orNumber !== receipt) {
      request = { orNumber: receipt, requestId: crypto.randomUUID() };
      requests.set(id, request);
    }
    const { payment } = await post<{ payment: Payment }>(
      path(id, "pay"),
      request,
    );
    if (started !== generation) return payment;
    set({
      tickets: get().tickets.map((t) =>
        t.id === id ? { ...t, status: "Paid", payment } : t,
      ),
    });
    announceWorkflowChange();
    return payment;
  },
  setStatus: async (id, status) => {
    const started = generation;
    const { ticket } = await post<{ ticket: Ticket }>(path(id, "status"), {
      status,
    });
    if (started !== generation) return;
    set({ tickets: get().tickets.map((t) => (t.id === id ? ticket : t)) });
    announceWorkflowChange();
  },
  endorseToPnp: async (id, _by, note) => {
    const started = generation;
    const { ticket } = await post<{ ticket: Ticket }>(path(id, "endorse"), {
      endorsementNote: note?.trim(),
    });
    if (started !== generation) return;
    set({ tickets: get().tickets.map((t) => (t.id === id ? ticket : t)) });
    announceWorkflowChange();
  },
  withdrawEndorsement: async (id) => {
    const started = generation;
    const { ticket } = await post<{ ticket: Ticket }>(path(id, "withdraw"), {});
    if (started !== generation) return;
    set({ tickets: get().tickets.map((t) => (t.id === id ? ticket : t)) });
    announceWorkflowChange();
  },
  getTicket: (id) =>
    get().tickets.find((t) => t.id.toLowerCase() === id.trim().toLowerCase()),
  // Signed sessions cannot authorize Supabase Realtime directly. Poll while visible and refresh on local writes/focus.
  subscribeToRealtime: () => {
    const refresh = () => {
      if (document.visibilityState === "visible") void get().fetchTickets();
    };
    const timer = window.setInterval(refresh, 60000);
    window.addEventListener("focus", refresh);
    window.addEventListener("citation-data-changed", refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("citation-data-changed", refresh);
    };
  },
}));
