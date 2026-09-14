import { createFileRoute, Link } from "@tanstack/react-router";
import { ShieldCheck, Radio, Landmark, QrCode, ArrowRight } from "lucide-react";
import { useAuthStore } from "@/store/useAuthStore";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Citation Ticket & Payment System | Role Access" },
      {
        name: "description",
        content:
          "Role-based citation ticketing: enforcer fast entry, PNP monitoring, treasury cashiering, and a public portal for paying traffic tickets.",
      },
      { property: "og:title", content: "Citation Ticket & Payment System" },
      {
        property: "og:description",
        content:
          "Issue, monitor, settle, and pay traffic citations across four role-isolated dashboards.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: RoleSelect,
});

const roles = [
  {
    to: "/enforcer",
    icon: Radio,
    name: "Traffic Enforcer",
    access: "Private",
    blurb:
      "Mobile fast-entry. Issue a citation in under 30 seconds on the roadside.",
  },
  {
    to: "/pnp",
    icon: ShieldCheck,
    name: "PNP / Police",
    access: "Private",
    blurb:
      "Read-only monitoring of every citation, status filters, and due-date watch.",
  },
  {
    to: "/treasury",
    icon: Landmark,
    name: "Municipal Treasury",
    access: "Private",
    blurb:
      "Cashier point-of-sale. Search a ticket, take cash, release the receipt.",
  },
  {
    to: "/portal",
    icon: QrCode,
    name: "Online Pay",
    access: "Public",
    blurb:
      "Look up your ticket, pay online via QRPh, and download your e-receipt.",
  },
  {
    to: "/admin",
    icon: ShieldCheck,
    name: "System Admin",
    access: "Private",
    blurb:
      "Monitor all citations, manage users, and generate system reports.",
  },
] as const;

function RoleSelect() {
  const sessionUser = useAuthStore((s) => s.user);
  const signOut = useAuthStore((s) => s.signOut);

  return (
    <div className="min-h-screen bg-authority">
      <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
        <div className="flex items-center gap-2 text-sidebar-primary">
          <ShieldCheck className="size-5" />
          <span className="text-xs font-semibold uppercase tracking-[0.25em]">
            Gitagum Traffic Management System
          </span>
        </div>
        <h1 className="mt-5 max-w-3xl font-display text-4xl font-bold text-primary-foreground sm:text-5xl">
          Citation Ticket &amp; Payment System
        </h1>
        <p className="mt-4 max-w-2xl text-primary-foreground/75">
          One shared record of every citation — issued on the road, watched by
          the police, settled at the treasury window, and payable online by the
          motorist.
        </p>

        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          {roles.map((r) => (
            <Link
              key={r.to}
              to={r.to}
              className="group rounded-xl border border-sidebar-border bg-surface p-5 transition-transform hover:-translate-y-0.5 hover:shadow-lift"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex size-11 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
                  <r.icon className="size-5" />
                </div>
                <span className="rounded-full bg-muted px-2.5 py-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                  {r.access}
                </span>
              </div>
              <h2 className="mt-4 font-display text-lg font-semibold text-card-foreground">
                {r.name}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">{r.blurb}</p>
              <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-card-foreground">
                Enter dashboard
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
              </span>
            </Link>
          ))}
        </div>

        <p className="mt-10 text-xs text-primary-foreground/50">
          Demo environment — sample records only. Data is shared live across all
          four dashboards.
        </p>
      </div>
    </div>
  );
}
