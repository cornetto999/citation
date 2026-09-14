import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Payment, Ticket, TicketStatus, ViolationCode } from "@/types";
import { VIOLATION_CODES } from "@/lib/mockData";

export interface NewTicketInput {
  plateNo: string;
  vehicleType: string;
  violatorName: string;
  licenseNo: string;
  violations: ViolationCode[];
  location: string;
  remarks?: string | undefined;
  photoData?: string | undefined;
  issuedBy: string;
}

interface TicketState {
  tickets: Ticket[];
  fetchTickets: () => Promise<void>;
  addTicket: (input: NewTicketInput) => Promise<Ticket>;
  payTicket: (
    ticketId: string,
    channel: Payment["channel"],
    receivedBy: string,
    manualOrNumber?: string,
  ) => Promise<Payment | undefined>;
  setStatus: (ticketId: string, status: TicketStatus) => Promise<void>;
  getTicket: (ticketId: string) => Ticket | undefined;
}

const pad = (n: number) => String(n).padStart(4, "0");

const nextTicketId = (tickets: Ticket[]) => {
  const year = new Date().getFullYear();
  const max = tickets.reduce((acc, t) => {
    const n = Number(t.id.split("-").pop());
    return Number.isFinite(n) && n > acc ? n : acc;
  }, 0);
  return `CTN-${year}-${pad(max + 1)}`;
};

// Initial Mock Data to populate the store so dashboards aren't empty
const MOCK_INITIAL_TICKETS: Ticket[] = [];

export const useTicketStore = create<TicketState>()(
  persist(
    (set, get) => ({
      tickets: MOCK_INITIAL_TICKETS,

      fetchTickets: async () => {
        // Bypassed Supabase 404s
        console.log("Mock data initialized.");
        return Promise.resolve();
      },

      addTicket: async (input) => {
        const tickets = get().tickets;
        const issuedAt = new Date();
        const due = new Date(issuedAt);
        due.setDate(due.getDate() + 7);

        const ticket: Ticket = {
          ...input,
          id: nextTicketId(tickets),
          totalFine: input.violations.reduce((sum, v) => sum + v.fine, 0),
          status: "Unpaid",
          issuedAt: issuedAt.toISOString(),
          dueDate: due.toISOString(),
        };

        set({ tickets: [ticket, ...get().tickets] });
        return Promise.resolve(ticket);
      },

      payTicket: async (ticketId, channel, receivedBy, manualOrNumber) => {
        const ticket = get().tickets.find((t) => t.id === ticketId);
        if (!ticket || ticket.status === "Paid") return Promise.resolve(undefined);

        const payment: Payment = {
          id: `PMT-${Date.now().toString().slice(-6)}`,
          ticketId,
          amount: ticket.totalFine,
          channel,
          paidAt: new Date().toISOString(),
          receivedBy,
          orNumber: manualOrNumber || `OR-${new Date().getFullYear()}-${pad(
            Math.floor(Math.random() * 9000) + 1000,
          )}`,
        };

        set({
          tickets: get().tickets.map((t) =>
            t.id === ticketId
              ? { ...t, status: "Paid" as TicketStatus, payment }
              : t,
          ),
        });
        return Promise.resolve(payment);
      },

      setStatus: async (ticketId, status) => {
        set({
          tickets: get().tickets.map((t) =>
            t.id === ticketId ? { ...t, status } : t,
          ),
        });
        return Promise.resolve();
      },

      getTicket: (ticketId) =>
        get().tickets.find(
          (t) => t.id.toLowerCase() === ticketId.trim().toLowerCase(),
        ),
    }),
    {
      name: "citation-system-tickets",
      version: 1,
    }
  )
);
