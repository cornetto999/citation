import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { ShieldCheck, Radio, Landmark, LogIn, Eye, EyeOff } from "lucide-react";
import { useAuthStore } from "@/store/useAuthStore";
import { supabase } from "@/lib/supabase";
import type { Role } from "@/types";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Sign In | Citation Ticket & Payment System" },
      {
        name: "description",
        content:
          "Sign in to the citation ticket and payment system — traffic enforcers, PNP monitoring, municipal treasury, and the public violator portal.",
      },
      {
        property: "og:title",
        content: "Sign In | Citation Ticket & Payment System",
      },
      {
        property: "og:description",
        content:
          "Role-based sign-in for the citation ticket and payment system demo.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LoginPage,
});

interface DemoAccount {
  key: string;
  credential: string;
  password: string;
  label: string;
  icon: typeof Radio;
  destination: string;
  name: string;
  role: Role;
  unit: string;
}

const ACCOUNTS: DemoAccount[] = [
  {
    key: "enforcer",
    credential: "jakeroaya@gmail.com",
    password: "jake123",
    label: "Traffic Enforcer",
    icon: Radio,
    destination: "/enforcer",
    name: "Jake Roaya",
    role: "enforcer",
    unit: "Gitagum Traffic Management Office",
  },
  {
    key: "pnp",
    credential: "roayajake@gmail.com",
    password: "roaya123",
    label: "PNP / Police",
    icon: ShieldCheck,
    destination: "/pnp",
    name: "Roaya Jake",
    role: "pnp",
    unit: "Gitagum Municipal Police Station",
  },
  {
    key: "treasury",
    credential: "francisjake@gmail.com",
    password: "koy123@",
    label: "Municipal Treasury",
    icon: Landmark,
    destination: "/treasury",
    name: "Francis Jake",
    role: "treasury",
    unit: "Municipal Treasurer's Office",
  },
  {
    key: "admin",
    credential: "admin@gitagum.gov.ph",
    password: "admin",
    label: "System Admin",
    icon: ShieldCheck,
    destination: "/admin",
    name: "System Admin",
    role: "admin",
    unit: "System Administration",
  },
];

function roleDestination(role: Role): string {
  if (role === "enforcer") return "/enforcer";
  if (role === "pnp") return "/pnp";
  if (role === "treasury") return "/treasury";
  if (role === "admin") return "/admin";
  return "/portal";
}

function LoginPage() {
  const router = useRouter();
  const signIn = useAuthStore((s) => s.signIn);
  const [credential, setCredential] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");

  const fillAccount = (account: DemoAccount) => {
    setCredential(account.credential);
    setPassword(account.password);
    setError("");
  };

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const normalizedCredential = credential.trim().toLowerCase();
    const account = ACCOUNTS.find(
      (candidate) =>
        candidate.credential.toLowerCase() === normalizedCredential,
    );

    const { data: user, error: dbError } = await supabase
      .from("users")
      .select("*")
      .eq("credential", normalizedCredential)
      .maybeSingle();

    if (dbError) {
      setError("Error connecting to database.");
      console.error(dbError);
      return;
    }

    if (!user && !account) {
      setError("User not found in database.");
      return;
    }

    if (user) {
      if (user.password !== password) {
        setError("Invalid password.");
        return;
      }
    } else if (account) {
      if (account.password !== password) {
        setError("Invalid password for demo account.");
        return;
      }
    }

    const sessionUser = user ?? account;

    signIn({
      key: sessionUser.role,
      name: sessionUser.name,
      role: sessionUser.role,
      unit: sessionUser.unit,
      credential: sessionUser.credential,
    });
    await router.navigate({ to: roleDestination(sessionUser.role) });
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-authority px-3 py-10 sm:px-4 sm:py-12 overflow-hidden">
      {/* Background decoration */}
      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImciIHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PGNpcmNsZSBjeD0iMzAiIGN5PSIzMCIgcj0iMC41IiBmaWxsPSJyZ2JhKDI1NSwyNTUsMjU1LDAuMDUpIi8+PC9wYXR0ZXJuPjwvZGVmcz48cmVjdCBmaWxsPSJ1cmwoI2cpIiB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIi8+PC9zdmc+')] opacity-60" />
      <div className="pointer-events-none absolute -top-40 -right-40 size-80 rounded-full bg-sidebar-primary/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -left-40 size-80 rounded-full bg-sidebar-primary/5 blur-3xl" />

      <div className="relative w-full max-w-md animate-fade-in-up">
        <div className="text-center">
          <div className="mx-auto flex size-14 items-center justify-center rounded-2xl glass-dark shadow-glow">
            <ShieldCheck className="size-7 text-sidebar-primary" />
          </div>
          <h1 className="mt-5 font-display text-xl font-bold tracking-tight text-primary-foreground sm:text-2xl">
            Sign in to your dashboard
          </h1>
          <p className="mt-1.5 text-sm text-primary-foreground/60">
            Citation Ticket &amp; Payment System
          </p>
        </div>

        <form
          onSubmit={onSubmit}
          className="mt-8 overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.06] p-6 shadow-lift backdrop-blur-sm sm:p-7"
        >
          <label
            className="block text-sm font-semibold text-primary-foreground/90"
            htmlFor="credential"
          >
            Badge no. / Email
          </label>
          <input
            id="credential"
            value={credential}
            onChange={(e) => setCredential(e.target.value)}
            autoComplete="username"
            placeholder="e.g. TE-2291"
            className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-primary-foreground placeholder:text-primary-foreground/30 outline-none transition-all focus:border-sidebar-primary/50 focus:bg-white/10 focus:ring-2 focus:ring-sidebar-primary/20"
          />

          <label
            className="mt-5 block text-sm font-semibold text-primary-foreground/90"
            htmlFor="password"
          >
            Password
          </label>
          <div className="relative mt-2">
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              placeholder="••••••••"
              className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 pr-11 text-sm text-primary-foreground placeholder:text-primary-foreground/30 outline-none transition-all focus:border-sidebar-primary/50 focus:bg-white/10 focus:ring-2 focus:ring-sidebar-primary/20"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-primary-foreground/40 hover:text-primary-foreground/70 transition-colors"
            >
              {showPassword ? (
                <EyeOff className="size-4" />
              ) : (
                <Eye className="size-4" />
              )}
            </button>
          </div>

          {error && (
            <p className="mt-4 rounded-xl bg-destructive/15 border border-destructive/20 px-4 py-2.5 text-sm font-medium text-destructive animate-scale-in">
              {error}
            </p>
          )}

          <button
            type="submit"
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-sidebar-primary px-4 py-3.5 text-sm font-bold text-sidebar-primary-foreground shadow-glow transition-all hover:brightness-110 hover:shadow-lg active:scale-[0.98]"
          >
            <LogIn className="size-4" />
            Sign in
          </button>
        </form>

        <div className="mt-7">
          <p className="text-center text-[10px] font-bold uppercase tracking-[0.2em] text-primary-foreground/40">
            Demo accounts — tap to autofill
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 stagger-children">
            {ACCOUNTS.map((a) => (
              <button
                key={a.key}
                type="button"
                onClick={() => fillAccount(a)}
                className="flex items-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.04] px-3.5 py-3 text-left backdrop-blur-sm transition-all hover:-translate-y-0.5 hover:border-white/[0.15] hover:bg-white/[0.08]"
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-white/10 text-primary-foreground/70">
                  <a.icon className="size-4" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-primary-foreground">
                    {a.label}
                  </span>
                  <span className="block truncate text-xs text-primary-foreground/40">
                    {a.credential}
                  </span>
                </span>
              </button>
            ))}
          </div>
          <div className="mt-4">
            <p className="text-center text-[10px] font-bold uppercase tracking-[0.2em] text-primary-foreground/40">
              Public access
            </p>
            <Link
              to="/portal"
              className="mt-3 flex items-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.04] px-3.5 py-3 text-left backdrop-blur-sm transition-all hover:-translate-y-0.5 hover:border-white/[0.15] hover:bg-white/[0.08]"
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-white/10 text-primary-foreground/70">
                <ShieldCheck className="size-4" />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-primary-foreground">
                  Violator (Public)
                </span>
                <span className="block truncate text-xs text-primary-foreground/40">
                  No sign-in required
                </span>
              </span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
