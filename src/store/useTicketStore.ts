import { create } from "zustand";
import type { Payment, Ticket, TicketStatus, ViolationCode } from "@/types";
import { supabase } from "@/lib/supabase";

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
  subscribeToRealtime: () => void;
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

export const useTicketStore = create<TicketState>((set, get) => ({
  tickets: [],

  fetchTickets: async () => {
    const { data: ticketsData, error: ticketsError } = await supabase
      .from("tickets")
      .select("*")
      .order("issued_at", { ascending: false });

    if (ticketsError) {
      console.error("Error fetching tickets:", ticketsError);
      return;
    }

    const { data: paymentsData, error: paymentsError } = await supabase
      .from("payments")
      .select("*");

    if (paymentsError) {
      console.error("Error fetching payments:", paymentsError);
    }

    const tickets: Ticket[] = ticketsData.map((t) => {
      const paymentData = paymentsData?.find((p) => p.ticket_id === t.id);
      let payment: Payment | undefined;
      if (paymentData) {
        payment = {
          id: paymentData.id,
          ticketId: paymentData.ticket_id,
          amount: paymentData.amount,
          channel: paymentData.channel as Payment["channel"],
          paidAt: paymentData.paid_at,
          receivedBy: paymentData.received_by,
          orNumber: paymentData.or_number,
        };
      }

      return {
        id: t.id,
        plateNo: t.plate_no,
        vehicleType: t.vehicle_type,
        violatorName: t.violator_name,
        licenseNo: t.license_no,
        violations: t.violations as ViolationCode[],
        totalFine: t.total_fine,
        location: t.location,
        remarks: t.remarks || undefined,
        photoData: t.photo_name || undefined,
        status: t.status as TicketStatus,
        issuedAt: t.issued_at,
        dueDate: t.due_date,
        issuedBy: t.issued_by,
        payment,
      };
    });

    set({ tickets });
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

    const { error } = await supabase.from("tickets").insert({
      id: ticket.id,
      plate_no: ticket.plateNo,
      vehicle_type: ticket.vehicleType,
      violator_name: ticket.violatorName,
      license_no: ticket.licenseNo,
      violations: ticket.violations,
      total_fine: ticket.totalFine,
      location: ticket.location,
      remarks: ticket.remarks,
      photo_name: ticket.photoData,
      status: ticket.status,
      issued_at: ticket.issuedAt,
      due_date: ticket.dueDate,
      issued_by: ticket.issuedBy,
    });

    if (error) {
      console.error("Error inserting ticket:", error);
      throw error;
    }

    set({ tickets: [ticket, ...get().tickets] });
    return ticket;
  },

  payTicket: async (ticketId, channel, receivedBy, manualOrNumber) => {
    const ticket = get().tickets.find((t) => t.id === ticketId);
    if (!ticket || ticket.status === "Paid") return undefined;

    const payment: Payment = {
      id: `PMT-${Date.now().toString().slice(-6)}`,
      ticketId,
      amount: ticket.totalFine,
      channel,
      paidAt: new Date().toISOString(),
      receivedBy,
      orNumber:
        manualOrNumber ||
        `OR-${new Date().getFullYear()}-${pad(
          Math.floor(Math.random() * 9000) + 1000,
        )}`,
    };

    const { error: paymentError } = await supabase.from("payments").insert({
      id: payment.id,
      ticket_id: payment.ticketId,
      amount: payment.amount,
      channel: payment.channel,
      paid_at: payment.paidAt,
      received_by: payment.receivedBy,
      or_number: payment.orNumber,
    });

    if (paymentError) {
      console.error("Error inserting payment:", paymentError);
      throw paymentError;
    }

    const { error: ticketError } = await supabase
      .from("tickets")
      .update({ status: "Paid" })
      .eq("id", ticketId);

    if (ticketError) {
      console.error("Error updating ticket status:", ticketError);
      throw ticketError;
    }

    set({
      tickets: get().tickets.map((t) =>
        t.id === ticketId
          ? { ...t, status: "Paid" as TicketStatus, payment }
          : t,
      ),
    });
    return payment;
  },

  setStatus: async (ticketId, status) => {
    const { error } = await supabase
      .from("tickets")
      .update({ status })
      .eq("id", ticketId);

    if (error) {
      console.error("Error updating ticket status:", error);
      throw error;
    }

    set({
      tickets: get().tickets.map((t) =>
        t.id === ticketId ? { ...t, status } : t,
      ),
    });
  },

  getTicket: (ticketId) =>
    get().tickets.find(
      (t) => t.id.toLowerCase() === ticketId.trim().toLowerCase(),
    ),

  subscribeToRealtime: () => {
    const existingChannel = supabase.getChannels().find(c => c.topic === 'realtime:schema-db-changes');
    if (existingChannel) return;

    supabase
      .channel('schema-db-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
        },
        (payload) => {
          console.log('Realtime update received!', payload);
          get().fetchTickets(); // Refetch whenever any ticket or payment changes
        }
      )
      .subscribe();
  },
}));
