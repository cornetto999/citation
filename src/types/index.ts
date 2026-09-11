export type Role = "enforcer" | "pnp" | "treasury" | "violator";

export interface User {
  id: string;
  name: string;
  badgeNo?: string;
  role: Role;
  unit: string;
}

export type TicketStatus = "Unpaid" | "Paid" | "Contested" | "Overdue";

export type PaymentChannel = "Cash (Over-the-counter)" | "QRPh" | "Unpaid";

export interface ViolationCode {
  code: string;
  label: string;
  fine: number;
  category: string;
}

export interface Payment {
  id: string;
  ticketId: string;
  amount: number;
  channel: Exclude<PaymentChannel, "Unpaid">;
  paidAt: string;
  receivedBy: string;
  orNumber: string;
}

export interface Ticket {
  id: string;
  plateNo: string;
  vehicleType: string;
  violatorName: string;
  licenseNo: string;
  violations: ViolationCode[];
  totalFine: number;
  location: string;
  remarks?: string | undefined;
  photoName?: string | undefined;
  status: TicketStatus;
  issuedAt: string;
  dueDate: string;
  issuedBy: string;
  payment?: Payment;
}
