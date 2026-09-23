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
    gradient: "from-blue-500/10 to-indigo-500/10",
    iconBg: "bg-blue-500/10 text-blue-600",
  },
  {
    to: "/pnp",
    icon: ShieldCheck,
    name: "PNP / Police",
    access: "Private",
    blurb:
      "Read-only monitoring of every citation, status filters, and due-date watch.",
    gradient: "from-emerald-500/10 to-teal-500/10",
    iconBg: "bg-emerald-500/10 text-emerald-600",
  },
  {
    to: "/treasury",
    icon: Landmark,
    name: "Municipal Treasury",
    access: "Private",
    blurb:
      "Cashier point-of-sale. Search a ticket, take cash, release the receipt.",
    gradient: "from-amber-500/10 to-orange-500/10",
    iconBg: "bg-amber-500/10 text-amber-600",
  },
  {
    to: "/portal",
    icon: QrCode,
    name: "Online Pay",
    access: "Public",
    blurb:
      "Look up your ticket, pay online via QRPh, and download your e-receipt.",
    gradient: "from-violet-500/10 to-purple-500/10",
    iconBg: "bg-violet-500/10 text-violet-600",
  },
  {
    to: "/admin",
    icon: ShieldCheck,
    name: "System Admin",
    access: "Private",
    blurb:
      "Monitor all citations, manage users, and generate system reports.",
    gradient: "from-rose-500/10 to-pink-500/10",
    iconBg: "bg-rose-500/10 text-rose-600",
  },
] as const;

function RoleSelect() {
  const sessionUser = useAuthStore((s) => s.user);
  const signOut = useAuthStore((s) => s.signOut);

  return (
    <div className="relative min-h-screen bg-authority overflow-hidden">
      {/* Subtle dot pattern overlay */}
      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImciIHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PGNpcmNsZSBjeD0iMzAiIGN5PSIzMCIgcj0iMC41IiBmaWxsPSJyZ2JhKDI1NSwyNTUsMjU1LDAuMDUpIi8+PC9wYXR0ZXJuPjwvZGVmcz48cmVjdCBmaWxsPSJ1cmwoI2cpIiB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIi8+PC9zdmc+')] opacity-60" />

      {/* Gradient orbs */}
      <div className="pointer-events-none absolute -top-32 -right-32 size-96 rounded-full bg-sidebar-primary/8 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -left-32 size-96 rounded-full bg-sidebar-primary/5 blur-3xl" />

      <div className="relative mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-16 lg:py-24">
        <div className="animate-fade-in-up flex items-center gap-2 text-sidebar-primary">
          <ShieldCheck className="size-4 sm:size-5" />
          <span className="text-[10px] font-semibold uppercase tracking-[0.22em] sm:text-xs">
            Gitagum Traffic Management System
          </span>
        </div>
        <h1 className="animate-fade-in-up mt-4 max-w-3xl font-display text-3xl font-bold tracking-tight text-primary-foreground sm:mt-5 sm:text-4xl lg:text-5xl" style={{ animationDelay: "80ms" }}>
          Citation Ticket &amp; Payment System
        </h1>
        <p className="animate-fade-in-up mt-3 max-w-2xl text-sm leading-relaxed text-primary-foreground/65 sm:mt-4 sm:text-base" style={{ animationDelay: "160ms" }}>
          One shared record of every citation — issued on the road, watched by
          the police, settled at the treasury window, and payable online by the
          motorist.
        </p>

        <div className="mt-8 grid gap-3 sm:mt-10 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3 stagger-children">
          {roles.map((r) => (
            <Link
              key={r.to}
              to={r.to}
              className="group relative overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.06] p-5 backdrop-blur-sm transition-all duration-300 hover:-translate-y-1 hover:border-white/[0.15] hover:bg-white/[0.1] hover:shadow-lift"
            >
              {/* Hover gradient glow */}
              <div className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-br from-sidebar-primary/0 to-sidebar-primary/0 opacity-0 transition-opacity duration-300 group-hover:opacity-100 group-hover:from-sidebar-primary/5 group-hover:to-transparent" />

              <div className="relative flex items-start justify-between gap-3">
                <div className="flex size-11 items-center justify-center rounded-xl bg-white/10 text-primary-foreground transition-all duration-300 group-hover:bg-sidebar-primary/20 group-hover:text-sidebar-primary group-hover:shadow-glow">
                  <r.icon className="size-5" />
                </div>
                <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-widest text-primary-foreground/60">
                  {r.access}
                </span>
              </div>
              <h2 className="relative mt-4 font-display text-lg font-semibold text-primary-foreground">
                {r.name}
              </h2>
              <p className="relative mt-1 text-sm leading-relaxed text-primary-foreground/50">
                {r.blurb}
              </p>
              <span className="relative mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-sidebar-primary">
                Enter dashboard
                <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-1" />
              </span>
            </Link>
          ))}
        </div>

        <p className="animate-fade-in mt-8 text-xs text-primary-foreground/40 sm:mt-10" style={{ animationDelay: "500ms" }}>
          Demo environment — sample records only. Data is shared live across all
          dashboards.
        </p>
      </div>
    </div>
  );
}
