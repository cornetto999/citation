import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import {
  ShieldCheck,
  Radio,
  Landmark,
  UserRound,
  LogIn,
  Eye,
  EyeOff,
} from "lucide-react";
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
}

const ACCOUNTS: DemoAccount[] = [
  {
    key: "enforcer",
    credential: "TE-2291",
    password: "enforcer123",
    label: "Traffic Enforcer",
    icon: Radio,
    destination: "/enforcer",
  },
  {
    key: "pnp",
    credential: "PNP-4471",
    password: "pnp123",
    label: "PNP / Police",
    icon: ShieldCheck,
    destination: "/pnp",
  },
  {
    key: "treasury",
    credential: "CASHIER-03",
    password: "treasury123",
    label: "Municipal Treasury",
    icon: Landmark,
    destination: "/treasury",
  },
  {
    key: "violator",
    credential: "juan.reyes@mail.com",
    password: "citizen123",
    label: "Violator (Public)",
    icon: UserRound,
    destination: "/portal",
  },
];

function roleDestination(role: Role): string {
  if (role === "enforcer") return "/enforcer";
  if (role === "pnp") return "/pnp";
  if (role === "treasury") return "/treasury";
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
    const account = ACCOUNTS.find(
      (a) => a.credential.toLowerCase() === credential.trim().toLowerCase(),
    );
    if (!account || account.password !== password) {
      setError("Invalid credentials. Use one of the demo accounts below.");
      return;
    }

    const { data: user, error: dbError } = await supabase
      .from("users")
      .select("*")
      .eq("credential", account.credential)
      .single();

    if (dbError || !user) {
      setError("User not found in Supabase database.");
      return;
    }

    signIn({
      key: account.key,
      name: user.name,
      role: user.role as Role,
      unit: user.unit,
      credential: user.credential,
    });
    await router.navigate({ to: roleDestination(user.role as Role) });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-authority px-4 py-12">
      <div className="w-full max-w-md">
        <div className="text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-sidebar-accent/60">
            <ShieldCheck className="size-6 text-sidebar-primary" />
          </div>
          <h1 className="mt-4 font-display text-2xl font-bold text-primary-foreground">
            Sign in to your dashboard
          </h1>
          <p className="mt-1 text-sm text-primary-foreground/70">
            Citation Ticket &amp; Payment System — demo access
          </p>
        </div>

        <form
          onSubmit={onSubmit}
          className="mt-8 rounded-xl border border-sidebar-border bg-surface p-6 shadow-lift"
        >
          <label
            className="block text-sm font-medium text-card-foreground"
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
            className="mt-1.5 w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
          />

          <label
            className="mt-4 block text-sm font-medium text-card-foreground"
            htmlFor="password"
          >
            Password
          </label>
          <div className="relative mt-1.5">
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              placeholder="••••••••"
              className="w-full rounded-md border border-input bg-background px-3 py-2.5 pr-10 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground"
            >
              {showPassword ? (
                <EyeOff className="size-4" />
              ) : (
                <Eye className="size-4" />
              )}
            </button>
          </div>

          {error && (
            <p className="mt-3 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          <button
            type="submit"
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <LogIn className="size-4" />
            Sign in
          </button>
        </form>

        <div className="mt-6">
          <p className="text-center text-xs font-semibold uppercase tracking-widest text-primary-foreground/60">
            Demo accounts — tap to autofill
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {ACCOUNTS.map((a) => (
              <button
                key={a.key}
                type="button"
                onClick={() => fillAccount(a)}
                className="flex items-center gap-3 rounded-lg border border-sidebar-border bg-surface px-3 py-2.5 text-left transition-transform hover:-translate-y-0.5 hover:shadow-lift"
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-secondary text-secondary-foreground">
                  <a.icon className="size-4" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-card-foreground">
                    {a.label}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {a.credential}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
