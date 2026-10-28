export type Role = "enforcer" | "pnp" | "treasury" | "violator" | "admin";

export interface User {
  id: string;
  name: string;
  credential: string;
  active?: boolean;
  disabledReason?: string;
  badgeNo?: string;
  password?: string;
  emailVerificationRequired?: boolean;
  emailVerifiedAt?: string | null;
  authManaged?: boolean;
  role: Role;
  unit: string;
}

export type TicketStatus = "Unpaid" | "Paid" | "Contested" | "Overdue";

export type PaymentChannel =
  | "Cash (Over-the-counter)"
  | "QRPh"
  | "GCash"
  | "Maya"
  | "Online (PayMongo)"
  | "Unpaid";

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
  receivedById?: string;
  shiftId?: string;
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
  photoData?: string | undefined;
  status: TicketStatus;
  issuedAt: string;
  dueDate: string;
  issuedBy: string;
  issuedById?: string;
  accessToken?: string;
  hasPhoto?: boolean;
  ruleVersion?: number;
  payment?: Payment | undefined;
  /** ISO timestamp when the overdue citation was endorsed to the PNP. */
  endorsedAt?: string | undefined;
  /** Name of the admin/treasury user who endorsed it. */
  endorsedBy?: string | undefined;
  /** Treasury/Admin's reason or instructions for this endorsement. */
  endorsementNote?: string | undefined;
}

export interface WorkflowEvent {
  id: string;
  ticketId?: string;
  actorId?: string;
  actorName: string;
  action: string;
  reason?: string;
  createdAt: string;
  before?: unknown;
  after?: unknown;
}
export interface CitationCase {
  id: string;
  ticketId: string;
  assignedTo?: string;
  reason: string;
  state: "open" | "in_review" | "resolved";
  decision?: string;
  createdAt: string;
  updatedAt: string;
}
export interface CashierShift {
  id: string;
  cashierId: string;
  cashierName: string;
  openedAt: string;
  closedAt?: string;
  openingCash: number;
  cashCollected: number;
  expectedCash: number;
  countedCash?: number;
  difference?: number;
  reason?: string;
  status: "open" | "closed";
}
export interface PaymentException {
  id: string;
  ticketId: string;
  reason: string;
  status: "open" | "resolved";
  createdAt: string;
  providerReference?: string;
}
